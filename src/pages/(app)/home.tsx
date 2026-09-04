import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuthProfileReady, useJobs, useMutations, useQuery } from 'deepspace'
import { Check, Clapperboard, Clipboard, Download, FileText, FolderOpen, Image, Mic2, PackageCheck, Play, Plus, RefreshCw, Save, Sparkles } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, buttonVariants, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, useToast } from '../../components/ui'
import { SCOPE_ID } from '../../constants'
import { latestStoredAsset, normalizeAssetManifest, upsertAssetManifest, type StoredAsset } from '../../lib/assets'
import { buildCreativePackageMarkdown, safePackageFilename } from '../../lib/creative-package'
import { countWords, narrationFitsFiveSeconds, NARRATION_HARD_MAX_WORDS } from '../../lib/narration'
import { freshMotionProject, newMotionProject, type MotionProject as Project } from '../../lib/motion-project'
import { FINAL_RENDER_ENABLED, MOTION_GENERATION_ENABLED } from '../../lib/pipeline-config'
import type { RenderPreflight } from '../../lib/render-preflight'
import { readMediaDuration } from '../../lib/video-upload'
import { MOTIONBRIEF_VOICES } from '../../lib/voices'

type PipelineResult = {
  projectId: string
  pipelineVersion?: number
  assetManifest?: unknown[]
  brief?: Pick<Project, 'title' | 'audience' | 'objective' | 'visualDirection' | 'motionDirection' | 'narration' | 'headline' | 'stillPrompt' | 'motionPrompt'>
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
  ['Motion', Play],
  ['Voice', Mic2],
  ['Render', Clapperboard],
] as const

function appFileUrl(key: string) {
  return `/api/files/${key.split('/').map(encodeURIComponent).join('/')}?scope=app`
}

function confirmPaidCall(details: string) {
  return window.confirm(`Confirm one paid provider call\n\n${details}\n\nThis submits exactly one paid request. Continue?`)
}

function narrationReservationEstimate(text: string) {
  return text.trim().length * 0.000065 * 1.3
}

function latestJob(jobs: ReturnType<typeof useJobs<unknown, PipelineResult>>['jobs'], types: string[], recordId: string | null) {
  return jobs
    .filter(job => types.includes(job.type) && (!recordId || (job.payload as { projectId?: string } | undefined)?.projectId === recordId))
    .sort((a, b) => Date.parse(b.enqueuedAt) - Date.parse(a.enqueuedAt))[0]
}

export default function HomePage() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedProjectId = searchParams.get('project')
  const creatingNew = searchParams.get('new') === '1'
  const { records, status: recordsStatus } = useQuery<Project>('motion-projects', { orderBy: 'updatedAt', orderDir: 'desc', limit: 100 })
  const { createConfirmed, putConfirmed, ready } = useMutations<Project>('motion-projects')
  const { enqueue, jobs } = useJobs<unknown, PipelineResult>(SCOPE_ID)
  const toast = useToast()
  const [draft, setDraft] = useState(freshMotionProject)
  const [recordId, setRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [queuing, setQueuing] = useState(false)
  const [renderAttemptStartedAt, setRenderAttemptStartedAt] = useState<number | null>(null)
  const loadedRecord = useRef<string | null>(null)
  const appliedBriefJob = useRef<string | null>(null)
  const appliedStillJob = useRef<string | null>(null)
  const appliedMotionJob = useRef<string | null>(null)
  const appliedVoiceJob = useRef<string | null>(null)
  const appliedRenderJob = useRef<string | null>(null)
  const appliedPreflightJob = useRef<string | null>(null)
  const preflightRequestedAt = useRef<number | null>(null)
  const jobsStartedHere = useRef(new Set<string>())

  const stored = requestedProjectId
    ? records.find(record => record.recordId === requestedProjectId)
    : creatingNew ? undefined : records[0]
  const imageAsset = latestStoredAsset(draft.assetManifest, 'image')
  const videoAsset = latestStoredAsset(draft.assetManifest, 'video')
  const audioAsset = latestStoredAsset(draft.assetManifest, 'audio')
  const renderAsset = latestStoredAsset(draft.assetManifest, 'render')
  const imageUrl = imageAsset ? appFileUrl(imageAsset.key) : draft.imageUrl
  const videoUrl = videoAsset ? appFileUrl(videoAsset.key) : draft.videoUrl
  const audioUrl = audioAsset ? appFileUrl(audioAsset.key) : draft.audioUrl
  const renderUrl = renderAsset ? appFileUrl(renderAsset.key) : draft.renderUrl
  const narrationNeedsMp3Repair = Boolean(audioAsset && !audioAsset.key.toLowerCase().endsWith('.mp3'))
  const packageReady = Boolean(recordId && renderAsset)
  const briefJob = useMemo(() => latestJob(jobs, ['motionbrief-generate-brief'], recordId), [jobs, recordId])
  const stillJob = useMemo(() => latestJob(jobs, ['motionbrief-generate-still', 'motionbrief-store-still'], recordId), [jobs, recordId])
  const motionJob = useMemo(() => latestJob(jobs, ['motionbrief-generate-motion', 'motionbrief-store-motion'], recordId), [jobs, recordId])
  const voiceJob = useMemo(() => latestJob(jobs, ['motionbrief-generate-narration', 'motionbrief-store-narration', 'motionbrief-restorage-narration'], recordId), [jobs, recordId])
  const renderJob = useMemo(() => latestJob(jobs, ['motionbrief-render-final', 'motionbrief-store-render'], recordId), [jobs, recordId])
  const preflightJob = useMemo(() => latestJob(jobs, ['motionbrief-preflight-render'], recordId), [jobs, recordId])
  const currentRenderActivity = useMemo(() => renderAttemptStartedAt === null ? undefined : [renderJob, preflightJob]
    .filter(job => job && Date.parse(job.enqueuedAt) >= renderAttemptStartedAt)
    .sort((a, b) => Date.parse(b!.enqueuedAt) - Date.parse(a!.enqueuedAt))[0], [preflightJob, renderAttemptStartedAt, renderJob])

  const set = <K extends keyof Project>(key: K, value: Project[K]) => {
    setDraft(current => ({ ...current, [key]: value, status: current.status === 'complete' ? 'ready' : current.status }))
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
    setDraft({ ...newMotionProject, ...stored.data, assetManifest: normalizeAssetManifest(stored.data.assetManifest ?? '[]') })
  }, [creatingNew, stored])

  async function save() {
    if (!isSignedIn) return toast.info('Sign in to save', 'Saving and generation require an account.')
    const values = { ...draft, assetManifest: normalizeAssetManifest(draft.assetManifest) }
    if (!values.prompt.trim()) return toast.error('Prompt required', 'Add the creator prompt before saving the brief.')
    if (values.narration.trim() && !narrationFitsFiveSeconds(values.narration)) {
      return toast.error('Narration timing', 'Use 8–13 words for a concise concept read.')
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
      toast.success('Brief saved', 'Your editable concept is synced in DeepSpace.')
    } catch (error) {
      toast.error('Could not save', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function generateBrief() {
    if (!isSignedIn || !recordId) return toast.info('Save first', 'Save your creator prompt before generating the brief.')
    if (!confirmPaidCall('Provider: OpenAI\nModel: gpt-5.6-terra\nOutput: editable creative direction and copy')) return
    setQueuing(true)
    try {
      const jobId = await enqueue('motionbrief-generate-brief', { projectId: recordId, prompt: draft.prompt }, { maxAttempts: 1 })
      jobsStartedHere.current.add(jobId)
      toast.success('Brief queued', 'OpenAI is shaping the editable concept.')
    } catch (error) {
      toast.error('Could not queue', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setQueuing(false)
    }
  }

  async function generateStill() {
    if (!isSignedIn || !recordId) return toast.info('Save first', 'Save the brief before generating its visual.')
    const recover = stillJob?.result?.temporaryImageUrl
    if (!recover && !draft.stillPrompt.trim()) return toast.error('Image prompt required', 'Generate or edit the image prompt first.')
    if (!recover && !confirmPaidCall('Provider: FAL\nModel: Seedream v5 Lite\nOutput: one portrait campaign visual\nEstimated cost: $0.035')) return
    setQueuing(true)
    try {
      if (recover) {
        const jobId = await enqueue('motionbrief-store-still', { projectId: recordId, sourceUrl: recover }, { maxAttempts: 1 })
        jobsStartedHere.current.add(jobId)
        toast.success('Storage retry queued', 'Reusing the generated image at no generation cost.')
      } else {
        const jobId = await enqueue('motionbrief-generate-still', { projectId: recordId, stillPrompt: draft.stillPrompt }, { maxAttempts: 1 })
        jobsStartedHere.current.add(jobId)
        toast.success('Visual queued', 'FAL is generating one campaign image.')
      }
    } catch (error) {
      toast.error('Could not queue', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setQueuing(false)
    }
  }

  async function generateMotion() {
    if (!isSignedIn || !recordId) return toast.info('Save first', 'Save the brief before generating motion.')
    const recover = motionJob?.result?.temporaryVideoUrl
    if (!recover && !imageAsset) return toast.error('Visual required', 'Generate and store the campaign visual first.')
    if (!recover && !draft.motionPrompt.trim()) return toast.error('Motion prompt required', 'Generate or edit the motion direction first.')
    const durableImageUrl = imageAsset ? new URL(appFileUrl(imageAsset.key), window.location.origin) : null
    if (!recover && durableImageUrl?.protocol !== 'https:') return toast.info('Deploy to animate', 'FAL needs the public HTTPS URL from the deployed app.')
    if (!recover && !confirmPaidCall('Provider: FAL\nModel: Wan 2.6 Image-to-Video Flash\nDuration: 5 seconds\nEstimated provider cost: $0.25\nDeepSpace manages and reconciles the temporary reserve.')) return
    setQueuing(true)
    try {
      const jobId = recover
        ? await enqueue('motionbrief-store-motion', { projectId: recordId, sourceUrl: recover }, { maxAttempts: 1 })
        : await enqueue('motionbrief-generate-motion', { projectId: recordId, motionPrompt: draft.motionPrompt, imageUrl: durableImageUrl!.href }, { maxAttempts: 1 })
      jobsStartedHere.current.add(jobId)
      toast.success(recover ? 'Video storage retry queued' : 'Motion queued', recover ? 'Reusing the generated video at no generation cost.' : 'FAL is animating the campaign visual.')
    } catch (error) {
      toast.error('Could not queue', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setQueuing(false)
    }
  }

  async function generateNarration() {
    if (!isSignedIn || !recordId) return toast.info('Save first', 'Save the brief before generating narration.')
    const recover = voiceJob?.result?.temporaryAudioUrl
    if (!recover && !narrationFitsFiveSeconds(draft.narration)) return toast.error('Narration timing', 'Use 8–13 words for a concise read.')
    if (!recover && !confirmPaidCall(`Provider: ElevenLabs\nModel: eleven_flash_v2_5\nVoice: ${MOTIONBRIEF_VOICES.find(voice => voice.id === draft.voiceId)?.name ?? draft.voiceId}\nEstimated reservation: $${narrationReservationEstimate(draft.narration).toFixed(4)}`)) return
    setQueuing(true)
    try {
      if (recover) {
        const jobId = await enqueue('motionbrief-store-narration', { projectId: recordId, dataUrl: recover }, { maxAttempts: 1 })
        jobsStartedHere.current.add(jobId)
        toast.success('Storage retry queued', 'Reusing the generated narration at no generation cost.')
      } else {
        const jobId = await enqueue('motionbrief-generate-narration', { projectId: recordId, narration: draft.narration, voiceId: draft.voiceId }, { maxAttempts: 1 })
        jobsStartedHere.current.add(jobId)
        toast.success('Narration queued', 'ElevenLabs is recording the selected voice.')
      }
    } catch (error) {
      toast.error('Could not queue', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setQueuing(false)
    }
  }

  async function repairNarrationFilename() {
    if (!recordId || !audioAsset) return
    setQueuing(true)
    try {
      const jobId = await enqueue('motionbrief-restorage-narration', { projectId: recordId, audioKey: audioAsset.key }, { maxAttempts: 1 })
      jobsStartedHere.current.add(jobId)
      toast.info('Updating narration file', 'Re-storing the existing audio as .mp3. No provider call will be made.')
    } catch (error) {
      toast.error('Could not repair narration', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setQueuing(false)
    }
  }

  async function renderFinal() {
    if (!isSignedIn || !recordId) return toast.info('Save first', 'Save the brief before rendering.')
    const recover = renderJob?.result?.temporaryRenderUrl
    if (!recover && !videoAsset) return toast.error('Motion required', 'Generate and store the five-second motion clip first.')
    if (!recover && narrationNeedsMp3Repair) return toast.info('Repair narration first', 'Use the free MP3 repair action before sending this project to Shotstack.')
    if (!recover && draft.narration.trim() && !audioAsset) return toast.error('Narration audio required', 'Generate narration first, or clear the narration field for a silent render.')
    if (!recover && !draft.headline.trim()) return toast.error('Headline required', 'Enter one headline before rendering.')
    const attemptStartedAt = Date.now() - 5000
    setRenderAttemptStartedAt(attemptStartedAt)
    setQueuing(true)
    try {
      if (recover) {
        const jobId = await enqueue('motionbrief-store-render', { projectId: recordId, sourceUrl: recover }, { maxAttempts: 1 })
        jobsStartedHere.current.add(jobId)
        toast.success('Final storage retry queued', 'Reusing the existing Shotstack result at no render cost.')
      } else {
        const measuredVideoLength = await readMediaDuration(appFileUrl(videoAsset!.key), 'video')
        if (measuredVideoLength < 4.95) throw new Error('motion_video_must_be_at_least_4.95_seconds')
        const videoLength = Math.min(5, Math.max(0.1, measuredVideoLength - 0.02))
        const audioLength = audioAsset ? await readMediaDuration(appFileUrl(audioAsset.key), 'audio') : undefined
        preflightRequestedAt.current = attemptStartedAt
        const jobId = await enqueue('motionbrief-preflight-render', { projectId: recordId, videoKey: videoAsset!.key, videoLength, audioKey: audioAsset?.key, audioLength }, { maxAttempts: 1 })
        jobsStartedHere.current.add(jobId)
        toast.info('Checking render assets', 'No paid provider call has been made.')
      }
    } catch (error) {
      preflightRequestedAt.current = null
      setRenderAttemptStartedAt(null)
      toast.error('Could not prepare render', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setQueuing(false)
    }
  }

  function packageMarkdown() {
    const absoluteImageUrl = imageUrl ? new URL(imageUrl, window.location.origin).href : undefined
    const absoluteAudioUrl = audioUrl ? new URL(audioUrl, window.location.origin).href : undefined
    return buildCreativePackageMarkdown({ ...draft, imageUrl: absoluteImageUrl, audioUrl: absoluteAudioUrl })
  }

  async function copyPackage() {
    await navigator.clipboard.writeText(packageMarkdown())
    toast.success('Creative package copied', 'Paste the complete brief into your working document.')
  }

  function downloadPackage() {
    const blobUrl = URL.createObjectURL(new Blob([packageMarkdown()], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = safePackageFilename(draft.title)
    link.click()
    URL.revokeObjectURL(blobUrl)
    toast.success('Package downloaded', 'The Markdown brief includes links to both generated assets.')
  }

  async function completePackage() {
    if (!recordId || !packageReady) return toast.info('Finish the package', 'Generate both the visual and narration first.')
    const next = { ...draft, status: 'complete' as const }
    await putConfirmed(recordId, next)
    setDraft(next)
    toast.success('Creative package ready', 'Your brief, visual, headline, and narration are complete.')
  }

  useEffect(() => {
    if (briefJob?.status !== 'succeeded' || !briefJob.result?.brief || appliedBriefJob.current === briefJob.id) return
    appliedBriefJob.current = briefJob.id
    const shouldNotify = jobsStartedHere.current.delete(briefJob.id)
    const next = { ...draft, ...briefJob.result.brief, status: 'ready' as const }
    setDraft(next)
    if (recordId) void putConfirmed(recordId, next)
      .then(() => { if (shouldNotify) toast.success('AI brief ready', 'Review and edit every field.') })
      .catch(error => { if (shouldNotify) toast.error('Brief ready but not saved', error instanceof Error ? error.message : 'Save it manually.') })
  }, [briefJob, draft, putConfirmed, recordId, toast])

  useEffect(() => {
    if (stillJob?.status !== 'succeeded' || stillJob.result?.asset?.kind !== 'image' || appliedStillJob.current === stillJob.id) return
    appliedStillJob.current = stillJob.id
    const shouldNotify = jobsStartedHere.current.delete(stillJob.id)
    if (imageAsset?.key === stillJob.result.asset.key) return
    const next = { ...draft, imageUrl: appFileUrl(stillJob.result.asset.key), assetManifest: upsertAssetManifest(draft.assetManifest, stillJob.result.asset), status: 'ready' as const }
    setDraft(next)
    if (recordId) void putConfirmed(recordId, next)
      .then(() => { if (shouldNotify) toast.success('Visual ready', 'The FAL image is stored in durable app storage.') })
      .catch(error => { if (shouldNotify) toast.error('Image ready but not saved', error instanceof Error ? error.message : 'Save it manually.') })
  }, [stillJob, draft, imageAsset?.key, putConfirmed, recordId, toast])

  useEffect(() => {
    if (motionJob?.status !== 'succeeded' || motionJob.result?.asset?.kind !== 'video' || appliedMotionJob.current === motionJob.id) return
    appliedMotionJob.current = motionJob.id
    const shouldNotify = jobsStartedHere.current.delete(motionJob.id)
    if (videoAsset?.key === motionJob.result.asset.key) return
    const next = { ...draft, videoUrl: appFileUrl(motionJob.result.asset.key), assetManifest: upsertAssetManifest(draft.assetManifest, motionJob.result.asset), status: 'ready' as const }
    setDraft(next)
    if (recordId) void putConfirmed(recordId, next)
      .then(() => { if (shouldNotify) toast.success('Motion ready', 'The five-second FAL video is stored and ready to render.') })
      .catch(error => { if (shouldNotify) toast.error('Video ready but not saved', error instanceof Error ? error.message : 'Save it manually.') })
  }, [draft, motionJob, putConfirmed, recordId, toast, videoAsset?.key])

  useEffect(() => {
    if (voiceJob?.status !== 'succeeded' || voiceJob.result?.asset?.kind !== 'audio' || appliedVoiceJob.current === voiceJob.id) return
    appliedVoiceJob.current = voiceJob.id
    const shouldNotify = jobsStartedHere.current.delete(voiceJob.id)
    if (audioAsset?.key === voiceJob.result.asset.key) return
    const next = { ...draft, audioUrl: appFileUrl(voiceJob.result.asset.key), assetManifest: upsertAssetManifest(draft.assetManifest, voiceJob.result.asset), status: 'ready' as const }
    setDraft(next)
    if (recordId) void putConfirmed(recordId, next)
      .then(() => { if (shouldNotify) toast.success('Narration ready', 'The ElevenLabs recording is stored in durable app storage.') })
      .catch(error => { if (shouldNotify) toast.error('Narration ready but not saved', error instanceof Error ? error.message : 'Save it manually.') })
  }, [audioAsset?.key, voiceJob, draft, putConfirmed, recordId, toast])

  useEffect(() => {
    const requestedAt = preflightRequestedAt.current
    if (requestedAt === null || !preflightJob || Date.parse(preflightJob.enqueuedAt) < requestedAt || preflightJob.status !== 'succeeded' || !preflightJob.result?.preflight || appliedPreflightJob.current === preflightJob.id) return
    preflightRequestedAt.current = null
    appliedPreflightJob.current = preflightJob.id
    const failed = preflightJob.result.preflight.assets.filter(asset => !asset.ok)
    if (failed.length) {
      setRenderAttemptStartedAt(null)
      toast.error('Render preflight failed', failed.map(asset => asset.error).join(' '))
      return
    }
    const payload = preflightJob.payload as { videoKey: string; videoLength: number; audioKey?: string; audioLength?: number }
    if (!confirmPaidCall(`Provider: Shotstack\nTimeline: ${payload.videoLength.toFixed(2)}-second 9:16 MP4\nAssets: public video${payload.audioKey ? ` + ${Math.min(payload.videoLength, payload.audioLength ?? payload.videoLength).toFixed(2)}s narration` : ''}\nEstimated cost: usage-based per rendered second`)) {
      setRenderAttemptStartedAt(null)
      toast.info('Render cancelled', 'Preflight passed; no paid Shotstack call was made.')
      return
    }
    void enqueue('motionbrief-render-final', { projectId: recordId, headline: draft.headline, videoKey: payload.videoKey, videoLength: payload.videoLength, audioKey: payload.audioKey, audioLength: payload.audioLength }, { maxAttempts: 1 })
      .then(jobId => {
        jobsStartedHere.current.add(jobId)
        toast.success('Final render queued', 'One confirmed Shotstack request was submitted.')
      })
      .catch(error => toast.error('Could not queue', error instanceof Error ? error.message : 'Please try again.'))
  }, [draft.headline, enqueue, preflightJob, recordId, toast])

  useEffect(() => {
    if (renderJob?.status !== 'succeeded' || renderJob.result?.asset?.kind !== 'render' || appliedRenderJob.current === renderJob.id) return
    appliedRenderJob.current = renderJob.id
    const shouldNotify = jobsStartedHere.current.delete(renderJob.id)
    if (renderAsset?.key === renderJob.result.asset.key) return
    const next = { ...draft, renderUrl: appFileUrl(renderJob.result.asset.key), assetManifest: upsertAssetManifest(draft.assetManifest, renderJob.result.asset), status: 'complete' as const }
    setDraft(next)
    if (recordId) void putConfirmed(recordId, next)
      .then(() => { if (shouldNotify) toast.success('Final MP4 ready', `Stored permanently${typeof renderJob.result?.renderCostUsd === 'number' ? ` · render cost $${renderJob.result.renderCostUsd.toFixed(4)}` : ''}.`) })
      .catch(error => { if (shouldNotify) toast.error('Final video ready but not saved', error instanceof Error ? error.message : 'Save it manually.') })
  }, [draft, putConfirmed, recordId, renderAsset?.key, renderJob, toast])

  const stepState = [
    { job: briefJob, done: Boolean(recordId && draft.stillPrompt.trim()) },
    { job: stillJob, done: Boolean(imageAsset) },
    { job: motionJob, done: Boolean(videoAsset) },
    { job: voiceJob, done: Boolean(audioAsset) },
    { job: currentRenderActivity, done: Boolean(renderAsset) },
  ]

  if (requestedProjectId && recordsStatus === 'ready' && !stored) {
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center px-5 text-center">
        <FolderOpen className="mb-4 size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or it belongs to another account.</p>
        <Link className={buttonVariants({ className: 'mt-5' })} to="/projects">View your projects</Link>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[minmax(0,1fr)_390px]">
        <section aria-labelledby="studio-heading" className="min-w-0 border-border lg:border-r">
          <header className="border-b border-border px-5 py-7 md:px-9">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-primary">Prompt to campaign concept</p>
                <h1 id="studio-heading" className="max-w-4xl text-3xl font-semibold tracking-[-.04em] md:text-5xl">Shape the idea. See it. Hear it.</h1>
                <p className="mt-3 max-w-2xl text-muted-foreground">MotionBrief turns one rough prompt into an editable creative brief, a campaign visual, and a voiced concept package.</p>
              </div>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <Button variant="outline" onClick={save} loading={saving} disabled={!ready}><Save />Save brief</Button>
                <Link className={buttonVariants({ variant: 'outline' })} to="/home?new=1"><Plus />New project</Link>
                <Link className={buttonVariants({ variant: 'outline' })} to="/projects"><FolderOpen />Projects</Link>
              </div>
            </div>
          </header>

          <div className="flex flex-col gap-3 border-b border-border bg-shell/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-9">
            <div>
              <p className="text-sm font-medium">Production</p>
              <p className="text-xs text-muted-foreground">Generate assets after saving your brief.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Button onClick={generateStill} loading={stillJob?.status === 'queued' || stillJob?.status === 'running'} disabled={!recordId || (!draft.stillPrompt.trim() && !stillJob?.result?.temporaryImageUrl)}><Image />{stillJob?.result?.temporaryImageUrl ? 'Retry image storage · $0' : 'Generate visual · $0.035'}</Button>
              <Button onClick={generateMotion} loading={motionJob?.status === 'queued' || motionJob?.status === 'running'} disabled={!recordId || !MOTION_GENERATION_ENABLED || (!imageAsset && !motionJob?.result?.temporaryVideoUrl)}><Play />{motionJob?.result?.temporaryVideoUrl ? 'Retry video storage · $0' : 'Animate · est. $0.25'}</Button>
              <Button onClick={generateNarration} loading={voiceJob?.status === 'queued' || voiceJob?.status === 'running'} disabled={!recordId || (!draft.narration.trim() && !voiceJob?.result?.temporaryAudioUrl)}><Mic2 />{voiceJob?.result?.temporaryAudioUrl ? 'Retry audio storage · $0' : `Narrate · est. $${narrationReservationEstimate(draft.narration).toFixed(4)}`}</Button>
              <Button onClick={renderFinal} loading={currentRenderActivity?.status === 'queued' || currentRenderActivity?.status === 'running'} disabled={!recordId || !FINAL_RENDER_ENABLED || (!videoAsset && !renderJob?.result?.temporaryRenderUrl)}><Clapperboard />{renderJob?.result?.temporaryRenderUrl ? 'Retry final storage · $0' : 'Render final · usage-based'}</Button>
            </div>
          </div>

          {narrationNeedsMp3Repair && <div className="flex flex-col gap-3 border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between md:px-9"><p>Your existing narration uses the old .mpeg filename that Shotstack rejects.</p><Button variant="outline" onClick={repairNarrationFilename} loading={voiceJob?.status === 'queued' || voiceJob?.status === 'running'}><RefreshCw />Repair as MP3 · $0</Button></div>}

          <div className="grid gap-8 p-5 md:p-9 xl:grid-cols-[1fr_.72fr]">
            <div className="space-y-6">
              <Field id="creator-prompt" label="Creator prompt">
                <Textarea id="creator-prompt" value={draft.prompt} onChange={event => set('prompt', event.target.value)} placeholder="A pocket camera that makes ordinary walks feel cinematic…" className="min-h-36 bg-card text-lg leading-relaxed" />
                <Button className="mt-3" onClick={generateBrief} loading={queuing || briefJob?.status === 'queued' || briefJob?.status === 'running'} disabled={!recordId}><Sparkles />Generate AI brief</Button>
              </Field>
              <div className="grid gap-5 md:grid-cols-2">
                <Field id="project-name" label="Project name"><Input id="project-name" value={draft.title} onChange={event => set('title', event.target.value)} /></Field>
                <Field id="audience" label="Audience"><Input id="audience" value={draft.audience} onChange={event => set('audience', event.target.value)} /></Field>
              </div>
              <Field id="objective" label="Objective"><Textarea id="objective" value={draft.objective} onChange={event => set('objective', event.target.value)} className="min-h-24 bg-card" /></Field>
              <Field id="visual-direction" label="Visual direction"><Textarea id="visual-direction" value={draft.visualDirection} onChange={event => set('visualDirection', event.target.value)} className="min-h-24 bg-card" /></Field>
              <Field id="image-prompt" label="Image prompt"><Textarea id="image-prompt" value={draft.stillPrompt} onChange={event => set('stillPrompt', event.target.value)} className="min-h-28 bg-card" /></Field>
              <Field id="motion-direction" label="Motion direction"><Textarea id="motion-direction" value={draft.motionPrompt || draft.motionDirection} onChange={event => set('motionPrompt', event.target.value)} className="min-h-24 bg-card" /></Field>
              <div className="grid gap-5 md:grid-cols-2">
                <Field id="narration" label="Narration">
                  <Textarea id="narration" value={draft.narration} onChange={event => set('narration', event.target.value)} className="min-h-28 bg-card" />
                  <p className={`text-xs ${countWords(draft.narration) > NARRATION_HARD_MAX_WORDS ? 'text-destructive' : 'text-muted-foreground'}`}>{countWords(draft.narration)} / {NARRATION_HARD_MAX_WORDS} words · target 8–11</p>
                  <Label htmlFor="narration-voice">Narration voice</Label>
                  <Select value={draft.voiceId} onValueChange={value => set('voiceId', value)}><SelectTrigger id="narration-voice"><SelectValue placeholder="Choose a voice" /></SelectTrigger><SelectContent>{MOTIONBRIEF_VOICES.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name} · {voice.style}</SelectItem>)}</SelectContent></Select>
                </Field>
                <Field id="headline" label="Headline"><Textarea id="headline" value={draft.headline} onChange={event => set('headline', event.target.value)} className="min-h-28 bg-card font-semibold uppercase" /></Field>
              </div>
            </div>

            <aside aria-label="Campaign concept preview" className="space-y-4">
              <div className="sticky top-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_70px_rgba(0,0,0,.28)]">
                <div className="relative aspect-[9/16] overflow-hidden bg-[#25221b]">
                  {renderUrl ? <video src={renderUrl} aria-label="Final MotionBrief video" className="absolute inset-0 h-full w-full object-cover" controls playsInline loop /> : videoUrl ? <video src={videoUrl} aria-label="Generated MotionBrief animation" className="absolute inset-0 h-full w-full object-cover" controls playsInline loop /> : imageUrl ? <img src={imageUrl} alt="Generated MotionBrief campaign visual" className="absolute inset-0 h-full w-full object-cover" /> : <><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_24%,rgba(255,107,53,.5),transparent_28%),linear-gradient(145deg,#40372a_0%,#151511_58%,#080807_100%)]" /><div className="absolute left-[12%] top-[18%] h-[38%] w-[70%] rotate-[-8deg] border border-white/20 bg-white/5 backdrop-blur-sm" /></>}
                  {!renderUrl && <div className="pointer-events-none absolute inset-x-7 bottom-16"><p className="text-[10px] uppercase tracking-[.28em] text-white/60">MotionBrief concept</p><p className="mt-3 text-4xl font-black uppercase leading-[.88] tracking-[-.055em] text-white">{draft.headline || 'Your headline'}</p></div>}
                </div>
                {audioUrl && !renderUrl && <div className="border-t border-border p-3"><audio aria-label="Generated narration preview" src={audioUrl} controls className="w-full" /></div>}
                <div className="flex justify-between border-t border-border p-4 text-xs text-muted-foreground"><span>9:16 · 5 seconds</span><span>{renderUrl ? 'Final MP4' : videoUrl ? 'Motion ready' : audioUrl ? 'Voiced concept' : imageUrl ? 'Visual ready' : 'Live preview'}</span></div>
              </div>
            </aside>
          </div>
        </section>

        <aside aria-labelledby="package-heading" className="bg-shell p-5 md:p-7">
          <h2 id="package-heading" className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Creative package</h2>
          <div className="mt-5 space-y-2">
            {steps.map(([label, Icon], index) => {
              const state = stepState[index]
              const active = state.job && ['queued', 'running'].includes(state.job.status)
              const message = state.done ? 'Ready' : state.job?.status === 'failed' ? state.job.error ?? 'Failed' : active ? state.job?.progressMessage ?? 'Working' : 'Waiting'
              return <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${state.done ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{state.done ? <Check /> : <Icon />}</div><div className="flex-1"><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{message}</p></div><span className="text-xs text-muted-foreground">0{index + 1}</span></div>
            })}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <h3 className="font-medium">{draft.status === 'complete' ? 'Package complete' : 'Finish your package'}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Shotstack combines the five-second motion, narration, and headline. The package also keeps your editable strategy and generated assets.</p>
            <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">Media links are viewable by anyone who receives them. Your editable project remains private to your account.</p>
            <div className="mt-4 grid gap-2">
              <Button onClick={completePackage} disabled={!packageReady || draft.status === 'complete'}><PackageCheck />{draft.status === 'complete' ? 'Creative package ready' : 'Mark package ready'}</Button>
              <Button variant="outline" onClick={copyPackage} disabled={!recordId}><Clipboard />Copy brief</Button>
              <Button variant="outline" onClick={downloadPackage} disabled={!recordId}><Download />Download Markdown</Button>
              {imageUrl && <a className={buttonVariants({ variant: 'outline' })} href={imageUrl} download><Download />Download shareable visual</a>}
              {audioUrl && <a className={buttonVariants({ variant: 'outline' })} href={audioUrl} download><Download />Download shareable narration</a>}
              {videoUrl && <a className={buttonVariants({ variant: 'outline' })} href={videoUrl} download><Download />Download motion</a>}
              {renderUrl && <a className={buttonVariants({ variant: 'outline' })} href={renderUrl} download><Download />Download final MP4</a>}
            </div>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Powered by DeepSpace integrations: OpenAI for the brief, FAL for the visual and motion, ElevenLabs for narration, and Shotstack for the final MP4.</p>
        </aside>
      </div>
    </div>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>
}
