/**
 * Background-job handler — invoked by AppJobRoom (worker.ts) for every
 * job picked up from the queue. Dispatch on `job.type` and return a
 * result (captured as `job.result`) or throw to fail (retried up to
 * `maxAttempts`, then permanently marked failed).
 *
 * Use this for any work that needs to outlive the HTTP response:
 *   - AI generation that exceeds Cloudflare's 30-second waitUntil window
 *   - Export / render pipelines
 *   - Bulk imports, fan-out side effects
 *
 * Enqueue from a client with the `useJobs(roomId)` hook, or from
 * worker-side code (an HTTP route, an action, a cron task) with
 * `enqueueJob(env.JOB_ROOMS, \`app:${env.DEEPSPACE_APP_ID}\`, type, payload)`.
 *
 * Long-running progress / checkpoint guidance:
 *   - `ctx.progress(0..1, msg?)` publishes a real-time update over the
 *     room's WebSocket so subscribers see progress without polling.
 *   - `ctx.continue(state, { afterMs })` yields and resumes on the next
 *     alarm with `job.resumeFrom = state` — use this for work that
 *     exceeds the 15-minute per-alarm wall-time ceiling.
 *   - `ctx.signal` is an AbortSignal that fires when a client cancels;
 *     forward it to `fetch` and check `.aborted` at loop suspension
 *     points.
 *
 * Example:
 *
 *   export async function runJob(job: Job, ctx: JobContext, env: Env) {
 *     switch (job.type) {
 *       case 'ai-summarize': {
 *         const { text } = job.payload as { text: string }
 *         ctx.progress(0.1, 'starting')
 *         const summary = await summarize(text, { signal: ctx.signal })
 *         return { summary }
 *       }
 *       default:
 *         throw new Error(`Unknown job type: ${job.type}`)
 *     }
 *   }
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker.js'
import {
  generateCreativeBrief,
  generateNarrationDataUrl,
  MOTIONBRIEF_PIPELINE_VERSION,
  pollFalMotion,
  pollFalStill,
  pollShotstackRender,
  preflightShotstackAssets,
  restorageNarrationAsset,
  runProviderDiagnostic,
  storeNarrationDataUrl,
  storeRemoteAsset,
  submitFalMotion,
  submitFalStill,
  submitShotstackRender,
} from './server/motionbrief-pipeline.js'
import {
  FINAL_RENDER_ENABLED,
  MOTION_GENERATION_ENABLED,
} from './lib/pipeline-config.js'
import { buildShotstackTextOnlySmokeEdit } from './lib/shotstack.js'

const FAL_PROVIDER_SMOKE_MODEL = 'wan/v2.6/text-to-video'
const FAL_PROVIDER_SMOKE_MAX_COST_USD = 1

function requireSignedInJob(job: Job): void {
  if (!job.enqueuedBy || job.enqueuedBy.startsWith('anon-')) {
    throw new Error('generation_requires_sign_in')
  }
}

export async function runJob(
  job: Job,
  ctx: JobContext,
  env: Env,
): Promise<unknown> {
  if (job.type === 'motionbrief-smoke-fal-provider') {
    if (!job.enqueuedBy || job.enqueuedBy !== env.OWNER_USER_ID)
      throw new Error('diagnostic_job_requires_app_owner')
    ctx.progress(0.1, 'Submitting asset-free FAL provider control')
    const diagnostic = await runProviderDiagnostic(env, {
      provider: 'fal',
      endpoint: 'fal/run-model',
      model: FAL_PROVIDER_SMOKE_MODEL,
      body: {
        model_id: FAL_PROVIDER_SMOKE_MODEL,
        maxCostUsd: FAL_PROVIDER_SMOKE_MAX_COST_USD,
        input: {
          prompt: 'A red paper airplane glides across a clear blue sky.',
          duration: '5',
        },
      },
    })
    ctx.progress(
      1,
      diagnostic.ok ? 'FAL accepted the control' : 'FAL rejected the control',
    )
    return {
      diagnostic,
      maximumProviderCostUsd: FAL_PROVIDER_SMOKE_MAX_COST_USD,
    }
  }

  if (job.type === 'motionbrief-smoke-shotstack-provider') {
    if (!job.enqueuedBy || job.enqueuedBy !== env.OWNER_USER_ID)
      throw new Error('diagnostic_job_requires_app_owner')
    ctx.progress(0.1, 'Submitting text-only Shotstack provider control')
    const diagnostic = await runProviderDiagnostic(env, {
      provider: 'shotstack',
      endpoint: 'shotstack/render',
      model: 'render/text-only',
      body: buildShotstackTextOnlySmokeEdit(),
    })
    ctx.progress(
      1,
      diagnostic.ok
        ? 'Shotstack accepted the control'
        : 'Shotstack rejected the control',
    )
    return { diagnostic, billedDurationSeconds: 1 }
  }

  if (job.type === 'motionbrief-preflight-render') {
    requireSignedInJob(job)
    const payload = job.payload as {
      projectId: string
      imageKey: string
      audioKey?: string
    }
    ctx.progress(0.2, 'Checking public render assets')
    const preflight = await preflightShotstackAssets(env, {
      imageKey: payload.imageKey,
      audioKey: payload.audioKey,
      signal: ctx.signal,
    })
    ctx.progress(
      1,
      preflight.ok ? 'Render assets passed' : 'Render assets failed',
    )
    return { projectId: payload.projectId, preflight }
  }

  if (job.type === 'motionbrief-preview') {
    const payload = job.payload as { projectId: string; headline: string }
    ctx.progress(0.2, 'Brief locked')
    ctx.progress(0.55, 'Preview frame prepared')
    ctx.progress(0.85, 'Timeline assembled')
    return { ...payload, mode: 'mock', paidCalls: 0 }
  }

  if (job.type === 'motionbrief-generate-brief') {
    requireSignedInJob(job)
    const payload = job.payload as { projectId: string; prompt: string }
    ctx.progress(0.05, 'Validating paid-call gate')
    const brief = await generateCreativeBrief(env, payload.prompt)
    ctx.progress(1, 'Creative brief generated')
    return {
      projectId: payload.projectId,
      brief,
      pipelineVersion: MOTIONBRIEF_PIPELINE_VERSION,
      assetManifest: [],
    }
  }

  if (job.type === 'motionbrief-generate-still') {
    requireSignedInJob(job)
    const payload = job.payload as { projectId: string; stillPrompt: string }
    const resume = job.resumeFrom as
      { requestId: string; polls: number } | undefined
    if (!resume) {
      ctx.progress(0.05, 'Submitting one capped FAL image')
      const submission = await submitFalStill(env, payload.stillPrompt)
      ctx.progress(0.2, 'Image queued at FAL')
      ctx.continue(
        { requestId: submission.requestId, polls: 0 },
        { afterMs: 1500 },
      )
      return
    }
    if (resume.polls >= 80) throw new Error('fal_still_poll_timeout')
    const polled = await pollFalStill(env, resume.requestId)
    if (polled.status === 'failed') throw new Error(polled.error)
    if (polled.status === 'pending') {
      const detail =
        polled.queuePosition === undefined
          ? 'Generating still'
          : `Queue position ${polled.queuePosition}`
      ctx.progress(Math.min(0.25 + resume.polls * 0.008, 0.88), detail)
      ctx.continue(
        { requestId: resume.requestId, polls: resume.polls + 1 },
        { afterMs: 1500 },
      )
      return
    }
    ctx.progress(0.9, 'Copying still to durable storage')
    let asset
    try {
      asset = await storeRemoteAsset(env, {
        projectId: payload.projectId,
        kind: 'image',
        sourceUrl: polled.imageUrl,
        signal: ctx.signal,
      })
    } catch (error) {
      // Preserve the paid output so storage can be retried without regenerating.
      return {
        projectId: payload.projectId,
        temporaryImageUrl: polled.imageUrl,
        storageError:
          error instanceof Error ? error.message : 'asset_storage_failed',
      }
    }
    ctx.progress(1, 'Still image ready')
    return { projectId: payload.projectId, asset }
  }

  if (job.type === 'motionbrief-store-still') {
    requireSignedInJob(job)
    const payload = job.payload as { projectId: string; sourceUrl: string }
    ctx.progress(0.2, 'Retrying durable storage')
    const asset = await storeRemoteAsset(env, {
      projectId: payload.projectId,
      kind: 'image',
      sourceUrl: payload.sourceUrl,
      signal: ctx.signal,
    })
    ctx.progress(1, 'Still image stored')
    return { projectId: payload.projectId, asset }
  }

  if (job.type === 'motionbrief-generate-motion') {
    if (!MOTION_GENERATION_ENABLED)
      throw new Error('motion_generation_paused_pending_deepspace')
    if (!job.enqueuedBy || job.enqueuedBy !== env.OWNER_USER_ID) {
      throw new Error('paid_job_requires_app_owner')
    }
    const payload = job.payload as {
      projectId: string
      motionPrompt: string
      imageUrl: string
    }
    const resume = job.resumeFrom as
      { requestId: string; polls: number } | undefined
    if (!resume) {
      ctx.progress(0.05, 'Submitting one fixed-price FAL video')
      const submission = await submitFalMotion(env, {
        prompt: payload.motionPrompt,
        imageUrl: payload.imageUrl,
      })
      ctx.progress(0.2, 'Motion queued at FAL')
      ctx.continue(
        { requestId: submission.requestId, polls: 0 },
        { afterMs: 2500 },
      )
      return
    }
    if (resume.polls >= 300) throw new Error('fal_motion_poll_timeout')
    const polled = await pollFalMotion(env, resume.requestId)
    if (polled.status === 'failed') throw new Error(polled.error)
    if (polled.status === 'pending') {
      const detail =
        polled.queuePosition === undefined
          ? 'Animating still'
          : `Queue position ${polled.queuePosition}`
      ctx.progress(Math.min(0.22 + resume.polls * 0.004, 0.88), detail)
      ctx.continue(
        { requestId: resume.requestId, polls: resume.polls + 1 },
        { afterMs: 2500 },
      )
      return
    }
    ctx.progress(0.9, 'Copying video to durable storage')
    try {
      const asset = await storeRemoteAsset(env, {
        projectId: payload.projectId,
        kind: 'video',
        sourceUrl: polled.videoUrl,
        signal: ctx.signal,
      })
      ctx.progress(1, 'Motion ready')
      return { projectId: payload.projectId, asset }
    } catch (error) {
      return {
        projectId: payload.projectId,
        temporaryVideoUrl: polled.videoUrl,
        storageError:
          error instanceof Error ? error.message : 'asset_storage_failed',
      }
    }
  }

  if (job.type === 'motionbrief-store-motion') {
    if (!job.enqueuedBy || job.enqueuedBy !== env.OWNER_USER_ID) {
      throw new Error('storage_job_requires_app_owner')
    }
    const payload = job.payload as { projectId: string; sourceUrl: string }
    ctx.progress(0.2, 'Retrying durable video storage')
    const asset = await storeRemoteAsset(env, {
      projectId: payload.projectId,
      kind: 'video',
      sourceUrl: payload.sourceUrl,
      signal: ctx.signal,
    })
    ctx.progress(1, 'Motion stored')
    return { projectId: payload.projectId, asset }
  }

  if (job.type === 'motionbrief-generate-narration') {
    requireSignedInJob(job)
    const payload = job.payload as {
      projectId: string
      narration: string
      voiceId: string
    }
    ctx.progress(0.1, 'Generating five-second narration')
    const audioDataUrl = await generateNarrationDataUrl(
      env,
      payload.narration,
      payload.voiceId,
    )
    ctx.progress(0.75, 'Copying narration to durable storage')
    try {
      const asset = await storeNarrationDataUrl(env, {
        projectId: payload.projectId,
        dataUrl: audioDataUrl,
      })
      ctx.progress(1, 'Narration ready')
      return { projectId: payload.projectId, asset }
    } catch (error) {
      return {
        projectId: payload.projectId,
        temporaryAudioUrl: audioDataUrl,
        storageError:
          error instanceof Error ? error.message : 'asset_storage_failed',
      }
    }
  }

  if (job.type === 'motionbrief-store-narration') {
    requireSignedInJob(job)
    const payload = job.payload as { projectId: string; dataUrl: string }
    ctx.progress(0.2, 'Retrying durable narration storage')
    const asset = await storeNarrationDataUrl(env, payload)
    ctx.progress(1, 'Narration stored')
    return { projectId: payload.projectId, asset }
  }

  if (job.type === 'motionbrief-restorage-narration') {
    requireSignedInJob(job)
    const payload = job.payload as { projectId: string; audioKey: string }
    ctx.progress(0.2, 'Updating narration filename')
    const asset = await restorageNarrationAsset(env, {
      ...payload,
      signal: ctx.signal,
    })
    ctx.progress(1, 'Narration stored as MP3')
    return { projectId: payload.projectId, asset }
  }

  if (job.type === 'motionbrief-render-final') {
    if (!FINAL_RENDER_ENABLED)
      throw new Error('shotstack_render_temporarily_paused')
    requireSignedInJob(job)
    const payload = job.payload as {
      projectId: string
      headline: string
      imageKey: string
      motionPreset: 'push-in' | 'pull-back' | 'pan-left' | 'pan-right'
      audioKey?: string
      audioLength?: number
    }
    const resume = job.resumeFrom as
      { renderId: string; polls: number } | undefined
    if (!resume) {
      ctx.progress(0.05, 'Submitting five-second Shotstack render')
      const submission = await submitShotstackRender(env, payload)
      ctx.progress(0.2, 'Render queued at Shotstack')
      ctx.continue(
        { renderId: submission.renderId, polls: 0 },
        { afterMs: 3000 },
      )
      return
    }
    if (resume.polls >= 120) throw new Error('shotstack_render_poll_timeout')
    const polled = await pollShotstackRender(env, resume.renderId)
    if (polled.status === 'failed') throw new Error(polled.error)
    if (polled.status === 'pending') {
      ctx.progress(
        Math.min(0.22 + resume.polls * 0.005, 0.88),
        `Rendering: ${polled.statusLabel}`,
      )
      ctx.continue(
        { renderId: resume.renderId, polls: resume.polls + 1 },
        { afterMs: 3000 },
      )
      return
    }
    ctx.progress(0.9, 'Copying final MP4 to durable storage')
    try {
      const asset = await storeRemoteAsset(env, {
        projectId: payload.projectId,
        kind: 'render',
        sourceUrl: polled.renderUrl,
        signal: ctx.signal,
      })
      ctx.progress(1, 'Final MP4 ready')
      return {
        projectId: payload.projectId,
        asset,
        renderCostUsd: polled.costUsd,
      }
    } catch (error) {
      return {
        projectId: payload.projectId,
        temporaryRenderUrl: polled.renderUrl,
        renderCostUsd: polled.costUsd,
        storageError:
          error instanceof Error ? error.message : 'asset_storage_failed',
      }
    }
  }

  if (job.type === 'motionbrief-store-render') {
    requireSignedInJob(job)
    const payload = job.payload as { projectId: string; sourceUrl: string }
    ctx.progress(0.2, 'Retrying durable final-video storage')
    const asset = await storeRemoteAsset(env, {
      projectId: payload.projectId,
      kind: 'render',
      sourceUrl: payload.sourceUrl,
      signal: ctx.signal,
    })
    ctx.progress(1, 'Final MP4 stored')
    return { projectId: payload.projectId, asset }
  }

  throw new Error(`Unknown job type: ${job.type}`)
}
