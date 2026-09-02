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
import { generateCreativeBrief, MOTIONBRIEF_PIPELINE_VERSION } from './server/motionbrief-pipeline.js'

export async function runJob(
  job: Job,
  ctx: JobContext,
  env: Env,
): Promise<unknown> {
  if (job.type === 'motionbrief-preview') {
    const payload = job.payload as { projectId: string; headline: string }
    ctx.progress(0.2, 'Brief locked')
    ctx.progress(0.55, 'Preview frame prepared')
    ctx.progress(0.85, 'Timeline assembled')
    return { ...payload, mode: 'mock', paidCalls: 0 }
  }

  if (job.type === 'motionbrief-generate-brief') {
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

  throw new Error(`Unknown job type: ${job.type}`)
}
