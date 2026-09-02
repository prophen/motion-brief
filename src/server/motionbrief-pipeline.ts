import { apiWorkerFetch, platformWorkerFetch } from 'deepspace/worker'
import type { Env } from '../../worker.js'
import { countWords, NARRATION_HARD_MAX_WORDS, NARRATION_TARGET_MIN_WORDS } from '../lib/narration.js'

export const MOTIONBRIEF_PIPELINE_VERSION = 1
export const OPENAI_BRIEF_MODEL = 'gpt-5.6-terra'
export const FAL_STILL_MODEL = 'bytedance/seedream/v5/lite/text-to-image'
export const FAL_STILL_MAX_COST_USD = 0.04
export const FAL_MOTION_MODEL = 'luma/agent/ray/v3.2/image-to-video'
export const FAL_MOTION_MAX_COST_USD = 0.5

export type CreativeBrief = {
  title: string
  audience: string
  objective: string
  visualDirection: string
  motionDirection: string
  narration: string
  headline: string
  stillPrompt: string
  motionPrompt: string
}

export type StoredAsset = {
  kind: 'image' | 'video' | 'audio' | 'render'
  key: string
  url: string
  mimeType: string
  sourceUrl: string
  storedAt: string
}

export type FalStillSubmission = { requestId: string }
export type FalStillPoll =
  | { status: 'pending'; queuePosition?: number }
  | { status: 'failed'; error: string }
  | { status: 'complete'; imageUrl: string }
export type FalMotionPoll =
  | { status: 'pending'; queuePosition?: number }
  | { status: 'failed'; error: string }
  | { status: 'complete'; videoUrl: string }

function requirePaidIntegrations(env: Env): void {
  if (env.MOTIONBRIEF_PAID_INTEGRATIONS_ENABLED !== 'true') {
    throw new Error('paid_integrations_disabled')
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function extractChatContent(response: unknown): string {
  const root = asObject(response)
  const data = asObject(root?.data) ?? root
  const choices = data?.choices
  if (!Array.isArray(choices)) throw new Error('openai_response_missing_choices')
  const first = asObject(choices[0])
  const message = asObject(first?.message)
  if (typeof message?.content !== 'string') throw new Error('openai_response_missing_content')
  return message.content
}

function parseCreativeBrief(content: string): CreativeBrief {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const value = asObject(JSON.parse(normalized))
  if (!value) throw new Error('openai_brief_not_an_object')

  const keys: Array<keyof CreativeBrief> = [
    'title', 'audience', 'objective', 'visualDirection', 'motionDirection',
    'narration', 'headline', 'stillPrompt', 'motionPrompt',
  ]
  const result = {} as CreativeBrief
  for (const key of keys) {
    const field = value[key]
    if (typeof field !== 'string' || !field.trim()) throw new Error(`openai_brief_invalid_${key}`)
    result[key] = field.trim()
  }
  const narrationWords = countWords(result.narration)
  if (narrationWords < NARRATION_TARGET_MIN_WORDS || narrationWords > NARRATION_HARD_MAX_WORDS) {
    throw new Error('openai_brief_narration_must_be_8_to_13_words')
  }
  return result
}

export async function generateCreativeBrief(
  env: Env,
  creatorPrompt: string,
): Promise<CreativeBrief> {
  requirePaidIntegrations(env)
  if (!creatorPrompt.trim()) throw new Error('creator_prompt_required')

  const response = await apiWorkerFetch(env, '/api/integrations/openai/chat-completion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.APP_OWNER_JWT}`,
    },
    body: JSON.stringify({
      model: OPENAI_BRIEF_MODEL,
      max_tokens: 1400,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: 'You are a creative director for a five-second vertical video. Return only valid JSON with these non-empty string fields: title, audience, objective, visualDirection, motionDirection, narration, headline, stillPrompt, motionPrompt. Narration must be one short sentence of 8 to 11 words, never more than 13 words, and must not repeat the headline. Keep the headline under 8 words.',
        },
        { role: 'user', content: creatorPrompt.trim() },
      ],
    }),
  })
  if (!response.ok) throw new Error(`openai_brief_failed_${response.status}`)
  return parseCreativeBrief(extractChatContent(await response.json()))
}

async function callIntegration(env: Env, endpoint: string, body: unknown): Promise<unknown> {
  requirePaidIntegrations(env)
  const response = await apiWorkerFetch(env, `/api/integrations/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.APP_OWNER_JWT}` },
    body: JSON.stringify(body),
  })
  const responseText = await response.text()
  if (!response.ok) {
    let detail = ''
    try {
      const errorBody = asObject(JSON.parse(responseText))
      const candidate = errorBody?.error ?? errorBody?.message ?? errorBody?.detail
      if (typeof candidate === 'string') detail = candidate.replace(/\s+/g, ' ').slice(0, 240)
    } catch {
      detail = responseText.replace(/\s+/g, ' ').slice(0, 240)
    }
    const suffix = detail ? `_${detail}` : ''
    throw new Error(`${endpoint.replaceAll('/', '_')}_failed_${response.status}${suffix}`)
  }
  return JSON.parse(responseText)
}

export async function submitFalStill(env: Env, prompt: string): Promise<FalStillSubmission> {
  if (!prompt.trim()) throw new Error('still_prompt_required')
  const response = asObject(await callIntegration(env, 'fal/run-model', {
    model_id: FAL_STILL_MODEL,
    maxCostUsd: FAL_STILL_MAX_COST_USD,
    input: {
      prompt: prompt.trim(),
      image_size: 'portrait_16_9',
      num_images: 1,
      max_images: 1,
      sync_mode: false,
      enable_safety_checker: true,
      return_byteplus_urls: false,
    },
  }))
  const data = asObject(response?.data) ?? response
  const requestId = data?.jobId ?? data?.request_id
  if (typeof requestId !== 'string') throw new Error('fal_still_submission_missing_job_id')
  return { requestId }
}

export async function pollFalStill(env: Env, requestId: string): Promise<FalStillPoll> {
  const response = asObject(await callIntegration(env, 'fal/get-result', { request_id: requestId }))
  const data = asObject(response?.data) ?? response
  const status = typeof data?.status === 'string' ? data.status.toLowerCase() : ''
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    return { status: 'failed', error: typeof data?.error === 'string' ? data.error : 'FAL generation failed' }
  }
  const output = asObject(data?.output)
  const images = output?.images
  const image = Array.isArray(images) ? asObject(images[0]) : null
  if (typeof image?.url === 'string') return { status: 'complete', imageUrl: image.url }
  return {
    status: 'pending',
    queuePosition: typeof data?.queuePosition === 'number' ? data.queuePosition : undefined,
  }
}

export async function submitFalMotion(
  env: Env,
  input: { prompt: string; imageKey: string },
): Promise<{ requestId: string }> {
  if (!input.prompt.trim()) throw new Error('motion_prompt_required')
  if (!input.imageKey.trim()) throw new Error('stored_image_required')
  const imageUrl = `https://${env.APP_NAME}.app.space${appFileUrl(input.imageKey)}`
  const response = asObject(await callIntegration(env, 'fal/run-model', {
    model_id: FAL_MOTION_MODEL,
    maxCostUsd: FAL_MOTION_MAX_COST_USD,
    input: {
      prompt: input.prompt.trim(),
      image_url: imageUrl,
      aspect_ratio: '9:16',
      resolution: '540p',
      duration: '5s',
      loop: false,
    },
  }))
  const data = asObject(response?.data) ?? response
  const requestId = data?.jobId ?? data?.request_id
  if (typeof requestId !== 'string') throw new Error('fal_motion_submission_missing_job_id')
  return { requestId }
}

export async function pollFalMotion(env: Env, requestId: string): Promise<FalMotionPoll> {
  const response = asObject(await callIntegration(env, 'fal/get-result', { request_id: requestId }))
  const data = asObject(response?.data) ?? response
  const status = typeof data?.status === 'string' ? data.status.toLowerCase() : ''
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    return { status: 'failed', error: typeof data?.error === 'string' ? data.error : 'FAL motion generation failed' }
  }
  const video = asObject(asObject(data?.output)?.video)
  if (typeof video?.url === 'string') return { status: 'complete', videoUrl: video.url }
  return {
    status: 'pending',
    queuePosition: typeof data?.queuePosition === 'number' ? data.queuePosition : undefined,
  }
}

function safeAssetKey(projectId: string, kind: StoredAsset['kind'], mimeType: string): string {
  const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `motionbrief/${safeProjectId}/${kind}-${crypto.randomUUID()}.${extension}`
}

function appFileUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `/api/files/${encoded}?scope=app`
}

export async function storeRemoteAsset(
  env: Env,
  input: { projectId: string; kind: StoredAsset['kind']; sourceUrl: string; signal?: AbortSignal },
): Promise<StoredAsset> {
  requirePaidIntegrations(env)
  if (!env.APP_IDENTITY_TOKEN) throw new Error('app_identity_required_for_asset_storage')

  const source = new URL(input.sourceUrl)
  if (source.protocol !== 'https:') throw new Error('asset_source_must_use_https')
  const downloaded = await fetch(source, { signal: input.signal, redirect: 'follow' })
  if (!downloaded.ok) throw new Error(`asset_download_failed_${downloaded.status}`)
  const mimeType = downloaded.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'
  const bytes = await downloaded.arrayBuffer()
  const key = safeAssetKey(input.projectId, input.kind, mimeType)
  const url = new URL('https://platform.invalid/internal/files/upload')
  url.searchParams.set('scope', 'app')
  url.searchParams.set('uploadKey', key)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), key.split('/').at(-1) ?? 'asset')
  form.append('name', key.split('/').at(-1) ?? 'asset')

  const uploaded = await platformWorkerFetch(env, new Request(url, {
    method: 'POST',
    headers: {
      'x-app-identity-token': env.APP_IDENTITY_TOKEN,
      'x-app-id': env.DEEPSPACE_APP_ID,
      // App scope controls visibility; mutations still require an authenticated actor.
      'x-user-id': env.OWNER_USER_ID,
    },
    body: form,
  }))
  if (!uploaded.ok) throw new Error(`asset_upload_failed_${uploaded.status}`)
  const result = asObject(await uploaded.json())
  if (typeof result?.url !== 'string' || typeof result?.key !== 'string') {
    throw new Error('asset_upload_response_invalid')
  }
  return {
    kind: input.kind,
    key: result.key,
    // Platform-service URLs are not browser-facing; route through this app.
    url: appFileUrl(result.key),
    mimeType,
    sourceUrl: input.sourceUrl,
    storedAt: new Date().toISOString(),
  }
}
