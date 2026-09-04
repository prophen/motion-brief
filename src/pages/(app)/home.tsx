import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuthProfileReady, useJobs, useMutations, useQuery } from 'deepspace'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clipboard,
  Download,
  FileText,
  FolderOpen,
  Image,
  Mic2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Button,
  buttonVariants,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useToast,
} from '../../components/ui'
import { SCOPE_ID } from '../../constants'
import {
  latestStoredAsset,
  normalizeAssetManifest,
  normalizeProjectAssetManifest,
  upsertAssetManifest,
  type StoredAsset,
} from '../../lib/assets'
import {
  buildCreativePackageMarkdown,
  safePackageFilename,
} from '../../lib/creative-package'
import {
  countWords,
  narrationFitsFiveSeconds,
  NARRATION_HARD_MAX_WORDS,
} from '../../lib/narration'
import {
  freshMotionProject,
  newMotionProject,
  type MotionProject as Project,
} from '../../lib/motion-project'
import { MOTION_PRESETS, normalizeMotionPreset } from '../../lib/motion-presets'
import { FINAL_RENDER_ENABLED } from '../../lib/pipeline-config'
import type { RenderPreflight } from '../../lib/render-preflight'
import { readMediaDuration } from '../../lib/video-upload'
import { MOTIONBRIEF_VOICES } from '../../lib/voices'

type PipelineResult = {
  projectId: string
  pipelineVersion?: number
  assetManifest?: unknown[]
  brief?: Pick<
    Project,
    | 'title'
    | 'audience'
    | 'objective'
    | 'visualDirection'
    | 'motionDirection'
    | 'narration'
    | 'headline'
    | 'stillPrompt'
    | 'motionPrompt'
  >
  asset?: StoredAsset
  temporaryImageUrl?: string
  temporaryVideoUrl?: string
  temporaryAudioUrl?: string
  temporaryRenderUrl?: string
  renderCostUsd?: number
  preflight?: RenderPreflight
  storageError?: string
}

const steps = [
  ['Brief', FileText],
  ['Visual', Image],
  ['Voice', Mic2],
  ['Export', Clapperboard],
] as const

function appFileUrl(key: string) {
  return `/api/files/${key.split('/').map(encodeURIComponent).join('/')}?scope=app`
}

function confirmPaidCall(details: string) {
  return window.confirm(
    `Confirm one paid provider call\n\n${details}\n\nThis submits exactly one paid request. Continue?`,
  )
}

function narrationReservationEstimate(text: string) {
  return text.trim().length * 0.000065 * 1.3
}

function latestJob(
  jobs: ReturnType<typeof useJobs<unknown, PipelineResult>>['jobs'],
  types: string[],
  recordId: string | null,
) {
  if (!recordId) return undefined
  return jobs
    .filter(
      (job) =>
        types.includes(job.type) &&
        (job.payload as { projectId?: string } | undefined)?.projectId ===
          recordId,
    )
    .sort((a, b) => Date.parse(b.enqueuedAt) - Date.parse(a.enqueuedAt))[0]
}

export default function HomePage() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedProjectId = searchParams.get('project')
  const creatingNew = searchParams.get('new') === '1'
  const { records, status: recordsStatus } = useQuery<Project>(
    'motion-projects',
    { orderBy: 'updatedAt', orderDir: 'desc', limit: 100 },
  )
  const { createConfirmed, putConfirmed, ready } =
    useMutations<Project>('motion-projects')
  const { enqueue, jobs } = useJobs<unknown, PipelineResult>(SCOPE_ID)
  const toast = useToast()
  const [draft, setDraft] = useState(freshMotionProject)
  const [recordId, setRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [queuing, setQueuing] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [renderAttemptStartedAt, setRenderAttemptStartedAt] = useState<
    number | null
  >(null)
  const loadedRecord = useRef<string | null>(null)
  const appliedBriefJob = useRef<string | null>(null)
  const appliedStillJob = useRef<string | null>(null)
  const appliedVoiceJob = useRef<string | null>(null)
  const appliedRenderJob = useRef<string | null>(null)
  const appliedPreflightJob = useRef<string | null>(null)
  const preflightRequestedAt = useRef<number | null>(null)
  const jobsStartedHere = useRef(new Set<string>())

  const stored = requestedProjectId
    ? records.find((record) => record.recordId === requestedProjectId)
    : creatingNew
      ? undefined
      : records[0]
  const briefJob = useMemo(
    () => latestJob(jobs, ['motionbrief-generate-brief'], recordId),
    [jobs, recordId],
  )
  const stillJob = useMemo(
    () =>
      latestJob(
        jobs,
        ['motionbrief-generate-still', 'motionbrief-store-still'],
        recordId,
      ),
    [jobs, recordId],
  )
  const voiceJob = useMemo(
    () =>
      latestJob(
        jobs,
        [
          'motionbrief-generate-narration',
          'motionbrief-store-narration',
          'motionbrief-restorage-narration',
        ],
        recordId,
      ),
    [jobs, recordId],
  )
  const renderJob = useMemo(
    () =>
      latestJob(
        jobs,
        ['motionbrief-render-final', 'motionbrief-store-render'],
        recordId,
      ),
    [jobs, recordId],
  )
  const preflightJob = useMemo(
    () => latestJob(jobs, ['motionbrief-preflight-render'], recordId),
    [jobs, recordId],
  )
  const legacyAssetKeys = useMemo(
    () =>
      new Set(
        jobs
          .filter(
            (job) =>
              (job.payload as { projectId?: string } | undefined)?.projectId ===
              recordId,
          )
          .map((job) => job.result?.asset?.key)
          .filter((key): key is string => Boolean(key)),
      ),
    [jobs, recordId],
  )
  const projectAssetManifest = recordId
    ? normalizeProjectAssetManifest(
        draft.assetManifest,
        recordId,
        legacyAssetKeys,
      )
    : '[]'
  const imageAsset = latestStoredAsset(projectAssetManifest, 'image')
  const audioAsset = latestStoredAsset(projectAssetManifest, 'audio')
  const renderAsset =
    draft.status === 'complete'
      ? latestStoredAsset(projectAssetManifest, 'render')
      : undefined
  const imageUrl = imageAsset ? appFileUrl(imageAsset.key) : ''
  const audioUrl = audioAsset ? appFileUrl(audioAsset.key) : ''
  const renderUrl = renderAsset ? appFileUrl(renderAsset.key) : ''
  const narrationNeedsMp3Repair = Boolean(
    audioAsset && !audioAsset.key.toLowerCase().endsWith('.mp3'),
  )
  const currentRenderActivity = useMemo(
    () =>
      renderAttemptStartedAt === null
        ? undefined
        : [renderJob, preflightJob]
            .filter(
              (job) =>
                job && Date.parse(job.enqueuedAt) >= renderAttemptStartedAt,
            )
            .sort(
              (a, b) => Date.parse(b!.enqueuedAt) - Date.parse(a!.enqueuedAt),
            )[0],
    [preflightJob, renderAttemptStartedAt, renderJob],
  )

  const set = <K extends keyof Project>(key: K, value: Project[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
      status: current.status === 'complete' ? 'ready' : current.status,
    }))
  }

  useEffect(() => {
    if (creatingNew) {
      if (loadedRecord.current === 'new') return
      loadedRecord.current = 'new'
      setRecordId(null)
      setDraft(freshMotionProject())
      return
    }
    if (!stored || loadedRecord.current === stored.recordId) return
    loadedRecord.current = stored.recordId
    setRecordId(stored.recordId)
    setDraft({
      ...newMotionProject,
      ...stored.data,
      motionPreset: normalizeMotionPreset(stored.data.motionPreset),
      assetManifest: normalizeAssetManifest(stored.data.assetManifest ?? '[]'),
    })
  }, [creatingNew, stored])

  async function save() {
    if (!isSignedIn)
      return toast.info(
        'Sign in to save',
        'Saving and generation require an account.',
      )
    const scopedManifest = recordId
      ? normalizeProjectAssetManifest(
          draft.assetManifest,
          recordId,
          legacyAssetKeys,
        )
      : '[]'
    const values = {
      ...draft,
      assetManifest: scopedManifest,
      imageUrl: latestStoredAsset(scopedManifest, 'image')?.url ?? '',
      videoUrl: latestStoredAsset(scopedManifest, 'video')?.url ?? '',
      audioUrl: latestStoredAsset(scopedManifest, 'audio')?.url ?? '',
      renderUrl: latestStoredAsset(scopedManifest, 'render')?.url ?? '',
    }
    if (!values.prompt.trim())
      return toast.error(
        'Prompt required',
        'Add the creator prompt before saving the brief.',
      )
    if (
      values.narration.trim() &&
      !narrationFitsFiveSeconds(values.narration)
    ) {
      return toast.error(
        'Narration timing',
        'Use 8–13 words for a concise concept read.',
      )
    }
    setSaving(true)
    try {
      if (recordId) await putConfirmed(recordId, { ...values, status: 'ready' })
      else {
        const createdId = await createConfirmed({ ...values, status: 'ready' })
        setRecordId(createdId)
        loadedRecord.current = createdId
        setSearchParams({ project: createdId }, { replace: true })
      }
      setDraft({ ...values, status: 'ready' })
      toast.success(
        'Brief saved',
        'Your editable concept is synced in DeepSpace.',
      )
    } catch (error) {
      toast.error(
        'Could not save',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function generateBrief() {
    if (!isSignedIn || !recordId)
      return toast.info(
        'Save first',
        'Save your creator prompt before generating the brief.',
      )
    if (
      !confirmPaidCall(
        'Provider: OpenAI\nModel: gpt-5.6-terra\nOutput: editable creative direction and copy',
      )
    )
      return
    setQueuing(true)
    try {
      const jobId = await enqueue(
        'motionbrief-generate-brief',
        { projectId: recordId, prompt: draft.prompt },
        { maxAttempts: 1 },
      )
      jobsStartedHere.current.add(jobId)
      toast.success('Brief queued', 'OpenAI is shaping the editable concept.')
    } catch (error) {
      toast.error(
        'Could not queue',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setQueuing(false)
    }
  }

  async function generateStill() {
    if (!isSignedIn || !recordId)
      return toast.info(
        'Save first',
        'Save the brief before generating its visual.',
      )
    const recover = stillJob?.result?.temporaryImageUrl
    if (!recover && !draft.stillPrompt.trim())
      return toast.error(
        'Image prompt required',
        'Generate or edit the image prompt first.',
      )
    if (
      !recover &&
      !confirmPaidCall(
        'Provider: FAL\nModel: Seedream v5 Lite\nOutput: one portrait campaign visual\nEstimated cost: $0.035',
      )
    )
      return
    setQueuing(true)
    try {
      if (recover) {
        const jobId = await enqueue(
          'motionbrief-store-still',
          { projectId: recordId, sourceUrl: recover },
          { maxAttempts: 1 },
        )
        jobsStartedHere.current.add(jobId)
        toast.success(
          'Storage retry queued',
          'Reusing the generated image at no generation cost.',
        )
      } else {
        const jobId = await enqueue(
          'motionbrief-generate-still',
          { projectId: recordId, stillPrompt: draft.stillPrompt },
          { maxAttempts: 1 },
        )
        jobsStartedHere.current.add(jobId)
        toast.success('Visual queued', 'FAL is generating one campaign image.')
      }
    } catch (error) {
      toast.error(
        'Could not queue',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setQueuing(false)
    }
  }

  async function generateNarration() {
    if (!isSignedIn || !recordId)
      return toast.info(
        'Save first',
        'Save the brief before generating narration.',
      )
    const recover = voiceJob?.result?.temporaryAudioUrl
    if (!recover && !narrationFitsFiveSeconds(draft.narration))
      return toast.error(
        'Narration timing',
        'Use 8–13 words for a concise read.',
      )
    if (
      !recover &&
      !confirmPaidCall(
        `Provider: ElevenLabs\nModel: eleven_flash_v2_5\nVoice: ${MOTIONBRIEF_VOICES.find((voice) => voice.id === draft.voiceId)?.name ?? draft.voiceId}\nEstimated reservation: $${narrationReservationEstimate(draft.narration).toFixed(4)}`,
      )
    )
      return
    setQueuing(true)
    try {
      if (recover) {
        const jobId = await enqueue(
          'motionbrief-store-narration',
          { projectId: recordId, dataUrl: recover },
          { maxAttempts: 1 },
        )
        jobsStartedHere.current.add(jobId)
        toast.success(
          'Storage retry queued',
          'Reusing the generated narration at no generation cost.',
        )
      } else {
        const jobId = await enqueue(
          'motionbrief-generate-narration',
          {
            projectId: recordId,
            narration: draft.narration,
            voiceId: draft.voiceId,
          },
          { maxAttempts: 1 },
        )
        jobsStartedHere.current.add(jobId)
        toast.success(
          'Narration queued',
          'ElevenLabs is recording the selected voice.',
        )
      }
    } catch (error) {
      toast.error(
        'Could not queue',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setQueuing(false)
    }
  }

  async function repairNarrationFilename() {
    if (!recordId || !audioAsset) return
    setQueuing(true)
    try {
      const jobId = await enqueue(
        'motionbrief-restorage-narration',
        { projectId: recordId, audioKey: audioAsset.key },
        { maxAttempts: 1 },
      )
      jobsStartedHere.current.add(jobId)
      toast.info(
        'Updating narration file',
        'Re-storing the existing audio as .mp3. No provider call will be made.',
      )
    } catch (error) {
      toast.error(
        'Could not repair narration',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setQueuing(false)
    }
  }

  async function renderFinal() {
    if (!isSignedIn || !recordId)
      return toast.info('Save first', 'Save the brief before rendering.')
    const recover = renderJob?.result?.temporaryRenderUrl
    if (!recover && !imageAsset)
      return toast.error(
        'Visual required',
        'Generate and store the campaign visual first.',
      )
    if (!recover && narrationNeedsMp3Repair)
      return toast.info(
        'Repair narration first',
        'Use the free MP3 repair action before sending this project to Shotstack.',
      )
    if (!recover && draft.narration.trim() && !audioAsset)
      return toast.error(
        'Narration audio required',
        'Generate narration first, or clear the narration field for a silent render.',
      )
    const attemptStartedAt = Date.now() - 5000
    setRenderAttemptStartedAt(attemptStartedAt)
    setQueuing(true)
    try {
      if (recover) {
        const jobId = await enqueue(
          'motionbrief-store-render',
          { projectId: recordId, sourceUrl: recover },
          { maxAttempts: 1 },
        )
        jobsStartedHere.current.add(jobId)
        toast.success(
          'Final storage retry queued',
          'Reusing the existing Shotstack result at no render cost.',
        )
      } else {
        const audioLength = audioAsset
          ? await readMediaDuration(appFileUrl(audioAsset.key), 'audio')
          : undefined
        preflightRequestedAt.current = attemptStartedAt
        const jobId = await enqueue(
          'motionbrief-preflight-render',
          {
            projectId: recordId,
            imageKey: imageAsset!.key,
            motionPreset: draft.motionPreset,
            audioKey: audioAsset?.key,
            audioLength,
          },
          { maxAttempts: 1 },
        )
        jobsStartedHere.current.add(jobId)
        toast.info(
          'Checking render assets',
          'No paid provider call has been made.',
        )
      }
    } catch (error) {
      preflightRequestedAt.current = null
      setRenderAttemptStartedAt(null)
      toast.error(
        'Could not prepare render',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setQueuing(false)
    }
  }

  function packageMarkdown() {
    const absoluteImageUrl = imageUrl
      ? new URL(imageUrl, window.location.origin).href
      : undefined
    const absoluteAudioUrl = audioUrl
      ? new URL(audioUrl, window.location.origin).href
      : undefined
    return buildCreativePackageMarkdown({
      ...draft,
      imageUrl: absoluteImageUrl,
      audioUrl: absoluteAudioUrl,
    })
  }

  async function copyPackage() {
    await navigator.clipboard.writeText(packageMarkdown())
    toast.success(
      'Creative package copied',
      'Paste the complete brief into your working document.',
    )
  }

  function downloadPackage() {
    const blobUrl = URL.createObjectURL(
      new Blob([packageMarkdown()], { type: 'text/markdown;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = safePackageFilename(draft.title)
    link.click()
    URL.revokeObjectURL(blobUrl)
    toast.success(
      'Package downloaded',
      'The Markdown brief includes links to both generated assets.',
    )
  }

  useEffect(() => {
    if (
      briefJob?.status !== 'succeeded' ||
      !briefJob.result?.brief ||
      appliedBriefJob.current === briefJob.id
    )
      return
    appliedBriefJob.current = briefJob.id
    const shouldNotify = jobsStartedHere.current.delete(briefJob.id)
    const next = {
      ...draft,
      ...briefJob.result.brief,
      status: 'ready' as const,
    }
    setDraft(next)
    if (recordId)
      void putConfirmed(recordId, next)
        .then(() => {
          if (shouldNotify)
            toast.success('AI brief ready', 'Review and edit every field.')
        })
        .catch((error) => {
          if (shouldNotify)
            toast.error(
              'Brief ready but not saved',
              error instanceof Error ? error.message : 'Save it manually.',
            )
        })
  }, [briefJob, draft, putConfirmed, recordId, toast])

  useEffect(() => {
    if (
      stillJob?.status !== 'succeeded' ||
      stillJob.result?.asset?.kind !== 'image' ||
      appliedStillJob.current === stillJob.id
    )
      return
    appliedStillJob.current = stillJob.id
    const shouldNotify = jobsStartedHere.current.delete(stillJob.id)
    if (imageAsset?.key === stillJob.result.asset.key) return
    const next = {
      ...draft,
      imageUrl: appFileUrl(stillJob.result.asset.key),
      assetManifest: upsertAssetManifest(
        draft.assetManifest,
        stillJob.result.asset,
      ),
      status: 'ready' as const,
    }
    setDraft(next)
    if (recordId)
      void putConfirmed(recordId, next)
        .then(() => {
          if (shouldNotify)
            toast.success(
              'Visual ready',
              'The FAL image is stored in durable app storage.',
            )
        })
        .catch((error) => {
          if (shouldNotify)
            toast.error(
              'Image ready but not saved',
              error instanceof Error ? error.message : 'Save it manually.',
            )
        })
  }, [stillJob, draft, imageAsset?.key, putConfirmed, recordId, toast])

  useEffect(() => {
    if (
      voiceJob?.status !== 'succeeded' ||
      voiceJob.result?.asset?.kind !== 'audio' ||
      appliedVoiceJob.current === voiceJob.id
    )
      return
    appliedVoiceJob.current = voiceJob.id
    const shouldNotify = jobsStartedHere.current.delete(voiceJob.id)
    if (audioAsset?.key === voiceJob.result.asset.key) return
    const next = {
      ...draft,
      audioUrl: appFileUrl(voiceJob.result.asset.key),
      assetManifest: upsertAssetManifest(
        draft.assetManifest,
        voiceJob.result.asset,
      ),
      status: 'ready' as const,
    }
    setDraft(next)
    if (recordId)
      void putConfirmed(recordId, next)
        .then(() => {
          if (shouldNotify)
            toast.success(
              'Narration ready',
              'The ElevenLabs recording is stored in durable app storage.',
            )
        })
        .catch((error) => {
          if (shouldNotify)
            toast.error(
              'Narration ready but not saved',
              error instanceof Error ? error.message : 'Save it manually.',
            )
        })
  }, [audioAsset?.key, voiceJob, draft, putConfirmed, recordId, toast])

  useEffect(() => {
    const requestedAt = preflightRequestedAt.current
    if (
      requestedAt === null ||
      !preflightJob ||
      Date.parse(preflightJob.enqueuedAt) < requestedAt ||
      preflightJob.status !== 'succeeded' ||
      !preflightJob.result?.preflight ||
      appliedPreflightJob.current === preflightJob.id
    )
      return
    preflightRequestedAt.current = null
    appliedPreflightJob.current = preflightJob.id
    const failed = preflightJob.result.preflight.assets.filter(
      (asset) => !asset.ok,
    )
    if (failed.length) {
      setRenderAttemptStartedAt(null)
      toast.error(
        'Render preflight failed',
        failed.map((asset) => asset.error).join(' '),
      )
      return
    }
    const payload = preflightJob.payload as {
      imageKey: string
      motionPreset: Project['motionPreset']
      audioKey?: string
      audioLength?: number
    }
    if (
      !confirmPaidCall(
        `Provider: Shotstack\nTimeline: 5-second 9:16 MP4 with ${MOTION_PRESETS.find((preset) => preset.id === payload.motionPreset)?.label.toLowerCase()} motion\nAssets: public image${payload.audioKey ? ` + ${Math.min(5, payload.audioLength ?? 5).toFixed(2)}s narration` : ''}\nEstimated cost: usage-based per rendered second`,
      )
    ) {
      setRenderAttemptStartedAt(null)
      toast.info(
        'Render cancelled',
        'Preflight passed; no paid Shotstack call was made.',
      )
      return
    }
    void enqueue(
      'motionbrief-render-final',
      {
        projectId: recordId,
        headline: draft.headline,
        imageKey: payload.imageKey,
        motionPreset: payload.motionPreset,
        audioKey: payload.audioKey,
        audioLength: payload.audioLength,
      },
      { maxAttempts: 1 },
    )
      .then((jobId) => {
        jobsStartedHere.current.add(jobId)
        toast.success(
          'Final render queued',
          'One confirmed Shotstack request was submitted.',
        )
      })
      .catch((error) =>
        toast.error(
          'Could not queue',
          error instanceof Error ? error.message : 'Please try again.',
        ),
      )
  }, [draft.headline, enqueue, preflightJob, recordId, toast])

  useEffect(() => {
    if (
      renderJob?.status !== 'succeeded' ||
      renderJob.result?.asset?.kind !== 'render' ||
      appliedRenderJob.current === renderJob.id
    )
      return
    appliedRenderJob.current = renderJob.id
    const shouldNotify = jobsStartedHere.current.delete(renderJob.id)
    if (renderAsset?.key === renderJob.result.asset.key) return
    const next = {
      ...draft,
      renderUrl: appFileUrl(renderJob.result.asset.key),
      assetManifest: upsertAssetManifest(
        draft.assetManifest,
        renderJob.result.asset,
      ),
      status: 'complete' as const,
    }
    setDraft(next)
    if (recordId)
      void putConfirmed(recordId, next)
        .then(() => {
          if (shouldNotify)
            toast.success(
              'Final MP4 ready',
              `Stored permanently${typeof renderJob.result?.renderCostUsd === 'number' ? ` · render cost $${renderJob.result.renderCostUsd.toFixed(4)}` : ''}.`,
            )
        })
        .catch((error) => {
          if (shouldNotify)
            toast.error(
              'Final video ready but not saved',
              error instanceof Error ? error.message : 'Save it manually.',
            )
        })
  }, [draft, putConfirmed, recordId, renderAsset?.key, renderJob, toast])

  const stepState = [
    { job: briefJob, done: Boolean(recordId && draft.stillPrompt.trim()) },
    { job: stillJob, done: Boolean(imageAsset) },
    { job: voiceJob, done: Boolean(audioAsset) },
    { job: currentRenderActivity, done: Boolean(renderAsset) },
  ]

  if (requestedProjectId && recordsStatus === 'ready' && !stored) {
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center px-5 text-center">
        <FolderOpen
          className="mb-4 size-10 text-muted-foreground"
          aria-hidden
        />
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or it belongs to another account.
        </p>
        <Link className={buttonVariants({ className: 'mt-5' })} to="/projects">
          View your projects
        </Link>
      </div>
    )
  }

  const showingFinalRender = activeStep === 3 && Boolean(renderUrl)
  const previewMotionClass = {
    'push-in': 'motion-preview-push-in',
    'pull-back': 'motion-preview-pull-back',
    'pan-left': 'motion-preview-pan-left',
    'pan-right': 'motion-preview-pan-right',
  }[draft.motionPreset]
  const mediaPreview = (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_70px_rgba(0,0,0,.22)]">
      <div className="relative aspect-[9/16] overflow-hidden bg-[#25221b]">
        {showingFinalRender ? (
          <video
            src={renderUrl}
            aria-label="Final MotionBrief video"
            className="absolute inset-0 h-full w-full object-cover"
            controls
            playsInline
            loop
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Animated preview of the generated MotionBrief campaign visual"
            className={`absolute inset-0 h-full w-full object-cover ${previewMotionClass}`}
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_24%,rgba(255,107,53,.5),transparent_28%),linear-gradient(145deg,#40372a_0%,#151511_58%,#080807_100%)]" />
            <div className="absolute left-[12%] top-[18%] h-[38%] w-[70%] rotate-[-8deg] border border-white/20 bg-white/5 backdrop-blur-sm" />
          </>
        )}
      </div>
      {activeStep === 2 && audioUrl && (
        <div className="border-t border-border p-3">
          <audio
            aria-label="Generated narration preview"
            src={audioUrl}
            controls
            className="w-full"
          />
        </div>
      )}
      <div className="flex justify-between border-t border-border p-4 text-xs text-muted-foreground">
        <span>9:16 · 5 seconds</span>
        <span>
          {showingFinalRender
            ? 'Final MP4'
            : activeStep === 1
              ? imageUrl
                ? 'Motion preview'
                : 'Add a visual'
              : activeStep === 2 && audioUrl
                ? 'Voiced concept'
                : imageUrl
                  ? 'Motion preview'
                  : 'Preview'}
        </span>
      </div>
    </div>
  )

  return (
    <section
      aria-labelledby="studio-heading"
      className="min-h-full bg-background text-foreground"
    >
      <header className="border-b border-border px-5 py-6 md:px-9">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-primary">
              Studio
            </p>
            <h1
              id="studio-heading"
              className="text-3xl font-semibold tracking-[-.04em] md:text-4xl"
            >
              {draft.title || 'Untitled creative brief'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Work through one focused stage at a time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={save}
              loading={saving}
              disabled={!ready}
            >
              <Save />
              Save
            </Button>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              to="/home?new=1"
            >
              <Plus />
              New
            </Link>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              to="/projects"
            >
              <FolderOpen />
              Projects
            </Link>
          </div>
        </div>
      </header>

      <nav
        aria-label="Project workflow"
        className="border-b border-border bg-shell/55 px-5 md:px-9"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-4">
          {steps.map(([label, Icon], index) => (
            <button
              key={label}
              onClick={() => setActiveStep(index)}
              aria-current={activeStep === index ? 'step' : undefined}
              className={`flex min-h-16 items-center justify-center gap-2 border-b-2 px-2 text-sm transition-colors ${activeStep === index ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full ${stepState[index].done ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
              >
                {stepState[index].done ? (
                  <Check className="size-4" />
                ) : (
                  <Icon className="size-4" />
                )}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-5 py-8 md:px-9 md:py-10">
        {activeStep === 0 && (
          <div className="mx-auto max-w-3xl space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
                Step 1 of 4
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Shape the brief</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with your idea, save it as a project, then ask AI to
                develop the editable brief.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
              <div className="mb-4 flex items-start gap-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${recordId ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                >
                  {recordId ? <Check className="size-4" /> : '1'}
                </span>
                <div>
                  <h3 className="font-medium">Write and save your prompt</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Saving creates the project that generated assets will belong
                    to.
                  </p>
                </div>
              </div>
              <Field id="creator-prompt" label="Creator prompt">
                <Textarea
                  id="creator-prompt"
                  value={draft.prompt}
                  onChange={(event) => set('prompt', event.target.value)}
                  placeholder="A pocket camera that makes ordinary walks feel cinematic…"
                  className="min-h-36 bg-background text-lg leading-relaxed"
                />
                <Button
                  className="mt-3"
                  variant={recordId ? 'outline' : 'default'}
                  onClick={save}
                  loading={saving}
                  disabled={!ready || !draft.prompt.trim()}
                >
                  <Save />
                  {recordId ? 'Save prompt changes' : 'Save prompt'}
                </Button>
              </Field>
            </div>
            <div
              className={`rounded-2xl border p-5 md:p-6 ${recordId ? 'border-primary/30 bg-primary/5' : 'border-border bg-card/50'}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                  2
                </span>
                <div className="flex-1">
                  <h3 className="font-medium">Generate the editable brief</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {recordId
                      ? 'Your prompt is saved. You can now generate the brief.'
                      : 'Save your prompt first to unlock generation.'}
                  </p>
                  <Button
                    className="mt-4"
                    onClick={generateBrief}
                    loading={
                      queuing ||
                      briefJob?.status === 'queued' ||
                      briefJob?.status === 'running'
                    }
                    disabled={!recordId}
                  >
                    <Sparkles />
                    Generate AI brief
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-5 border-t border-border pt-6">
              <div>
                <h3 className="font-medium">Editable AI brief</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  These fields start blank and fill in after generation. You can
                  edit every result.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Field id="project-name" label="Project name">
                  <Input
                    id="project-name"
                    value={draft.title}
                    onChange={(event) => set('title', event.target.value)}
                    placeholder="Generated project name"
                  />
                </Field>
                <Field id="audience" label="Audience">
                  <Input
                    id="audience"
                    value={draft.audience}
                    onChange={(event) => set('audience', event.target.value)}
                    placeholder="Generated audience"
                  />
                </Field>
              </div>
              <Field id="objective" label="Objective">
                <Textarea
                  id="objective"
                  value={draft.objective}
                  onChange={(event) => set('objective', event.target.value)}
                  placeholder="Generated campaign objective"
                  className="min-h-24 bg-card"
                />
              </Field>
              <Field id="headline" label="Campaign headline">
                <Input
                  id="headline"
                  value={draft.headline}
                  onChange={(event) => set('headline', event.target.value)}
                  placeholder="Generated campaign headline"
                  className="font-semibold"
                />
              </Field>
            </div>
          </div>
        )}

        {activeStep === 1 && (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
                  Step 2 of 4
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Create the visual
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate one still, then choose a reliable five-second camera
                  move.
                </p>
              </div>
              <Field id="visual-direction" label="Visual direction">
                <Textarea
                  id="visual-direction"
                  value={draft.visualDirection}
                  onChange={(event) =>
                    set('visualDirection', event.target.value)
                  }
                  className="min-h-24 bg-card"
                />
              </Field>
              <Field id="image-prompt" label="Image prompt">
                <Textarea
                  id="image-prompt"
                  value={draft.stillPrompt}
                  onChange={(event) => set('stillPrompt', event.target.value)}
                  className="min-h-28 bg-card"
                />
              </Field>
              <Button
                onClick={generateStill}
                loading={
                  stillJob?.status === 'queued' ||
                  stillJob?.status === 'running'
                }
                disabled={
                  !recordId ||
                  (!draft.stillPrompt.trim() &&
                    !stillJob?.result?.temporaryImageUrl)
                }
              >
                <Image />
                {stillJob?.result?.temporaryImageUrl
                  ? 'Retry image storage · $0'
                  : 'Generate visual · $0.035'}
              </Button>
              <Field id="motion-preset" label="Motion style">
                <Select
                  value={draft.motionPreset}
                  onValueChange={(value) =>
                    set('motionPreset', normalizeMotionPreset(value))
                  }
                >
                  <SelectTrigger id="motion-preset" className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTION_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-sm text-muted-foreground">
                The preview updates instantly. Shotstack applies this motion
                when you render the final MP4—there is no separate animation
                charge.
              </p>
            </div>
            <aside
              aria-label="Visual preview"
              className="mx-auto w-full max-w-64 lg:mx-0 lg:justify-self-end"
            >
              {mediaPreview}
            </aside>
          </div>
        )}

        {activeStep === 2 && (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
                  Step 3 of 4
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Add the voice</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep the narration concise enough to fit the five-second cut.
                </p>
              </div>
              <Field id="narration" label="Narration">
                <Textarea
                  id="narration"
                  value={draft.narration}
                  onChange={(event) => set('narration', event.target.value)}
                  className="min-h-32 bg-card"
                />
                <p
                  className={`text-xs ${countWords(draft.narration) > NARRATION_HARD_MAX_WORDS ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {countWords(draft.narration)} / {NARRATION_HARD_MAX_WORDS}{' '}
                  words · target 8–11
                </p>
              </Field>
              <div className="space-y-2">
                <Label htmlFor="narration-voice">Narration voice</Label>
                <Select
                  value={draft.voiceId}
                  onValueChange={(value) => set('voiceId', value)}
                >
                  <SelectTrigger id="narration-voice">
                    <SelectValue placeholder="Choose a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIONBRIEF_VOICES.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name} · {voice.style}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {narrationNeedsMp3Repair ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <p>
                    The existing narration uses the old .mpeg filename that
                    Shotstack rejects.
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={repairNarrationFilename}
                    loading={
                      voiceJob?.status === 'queued' ||
                      voiceJob?.status === 'running'
                    }
                  >
                    <RefreshCw />
                    Repair as MP3 · $0
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={generateNarration}
                  loading={
                    voiceJob?.status === 'queued' ||
                    voiceJob?.status === 'running'
                  }
                  disabled={
                    !recordId ||
                    (!draft.narration.trim() &&
                      !voiceJob?.result?.temporaryAudioUrl)
                  }
                >
                  <Mic2 />
                  {voiceJob?.result?.temporaryAudioUrl
                    ? 'Retry audio storage · $0'
                    : `Narrate · est. $${narrationReservationEstimate(draft.narration).toFixed(4)}`}
                </Button>
              )}
            </div>
            <aside
              aria-label="Narration preview"
              className="mx-auto w-full max-w-64 lg:mx-0 lg:justify-self-end"
            >
              {mediaPreview}
            </aside>
          </div>
        )}

        {activeStep === 3 && (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
                  Step 4 of 4
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Render and export
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Combine the motion and narration into a clean final MP4.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {steps.map(([label, Icon], index) => {
                  const state = stepState[index]
                  const working =
                    state.job &&
                    ['queued', 'running'].includes(state.job.status)
                  return (
                    <div
                      key={label}
                      className="rounded-xl border border-border bg-card p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-primary" />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {state.done
                          ? 'Ready'
                          : working
                            ? (state.job?.progressMessage ?? 'Working')
                            : state.job?.status === 'failed'
                              ? (state.job.error ?? 'Failed')
                              : 'Waiting'}
                      </p>
                    </div>
                  )
                })}
              </div>
              <Button
                onClick={renderFinal}
                loading={
                  currentRenderActivity?.status === 'queued' ||
                  currentRenderActivity?.status === 'running'
                }
                disabled={
                  !recordId ||
                  !FINAL_RENDER_ENABLED ||
                  (!imageAsset && !renderJob?.result?.temporaryRenderUrl)
                }
              >
                <Clapperboard />
                {renderJob?.result?.temporaryRenderUrl
                  ? 'Retry final storage · $0'
                  : 'Render final · usage-based'}
              </Button>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-medium">Creative package</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your editable brief, campaign copy, and durable media links
                  stay together.
                </p>
                <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Anyone with a media link can view it. The editable project
                  remains private.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={copyPackage}
                    disabled={!recordId}
                  >
                    <Clipboard />
                    Copy brief
                  </Button>
                  <Button
                    variant="outline"
                    onClick={downloadPackage}
                    disabled={!recordId}
                  >
                    <Download />
                    Markdown
                  </Button>
                  {imageUrl && (
                    <a
                      className={buttonVariants({ variant: 'outline' })}
                      href={imageUrl}
                      download
                    >
                      <Download />
                      Visual
                    </a>
                  )}
                  {audioUrl && (
                    <a
                      className={buttonVariants({ variant: 'outline' })}
                      href={audioUrl}
                      download
                    >
                      <Download />
                      Narration
                    </a>
                  )}
                  {renderUrl && (
                    <a
                      className={buttonVariants({ variant: 'outline' })}
                      href={renderUrl}
                      download
                    >
                      <Download />
                      Final MP4
                    </a>
                  )}
                </div>
              </div>
            </div>
            <aside
              aria-label="Final video preview"
              className="mx-auto w-full max-w-64 lg:mx-0 lg:justify-self-end"
            >
              {mediaPreview}
            </aside>
          </div>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-border pt-5">
          <Button
            variant="ghost"
            onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
            disabled={activeStep === 0}
          >
            <ChevronLeft />
            Back
          </Button>
          <span className="text-xs text-muted-foreground">
            {activeStep + 1} / {steps.length}
          </span>
          <Button
            variant="outline"
            onClick={() =>
              setActiveStep((step) => Math.min(steps.length - 1, step + 1))
            }
            disabled={activeStep === steps.length - 1}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
