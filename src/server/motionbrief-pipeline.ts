import { apiWorkerFetch, platformWorkerFetch } from 'deepspace/worker'
import type { Env } from '../../worker.js'
import { countWords, NARRATION_HARD_MAX_WORDS, NARRATION_TARGET_MIN_WORDS } from '../lib/narration.js'
import { DEFAULT_MOTIONBRIEF_VOICE_ID, isMotionBriefVoiceId } from '../lib/voices.js'
import { decodeBase64DataUrl, type StoredAsset } from '../lib/assets.js'
import { buildShotstackEdit } from '../lib/shotstack.js'
import { sanitizeDiagnosticBody } from '../lib/provider-diagnostics.js'
import { formatIntegrationError } from '../lib/integration-errors.js'
import { validateAssetResponse, type AssetPreflight, type RenderPreflight } from '../lib/render-preflight.js'

export const MOTIONBRIEF_PIPELINE_VERSION = 1
export const OPENAI_BRIEF_MODEL = 'gpt-5.6-terra'
export const FAL_STILL_MODEL = 'bytedance/seedream/v5/lite/text-to-image'
export const FAL_STILL_MAX_COST_USD = 0.04
export const FAL_MOTION_MODEL = 'wan/v2.6/image-to-video/flash'
export const FAL_MOTION_MAX_COST_USD = 0.25
export const ELEVENLABS_MODEL_ID = 'eleven_flash_v2_5'
export const ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128'

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

export type { StoredAsset } from '../lib/assets.js'

export type FalStillSubmission = { requestId: string }
export type FalStillPoll =
  | { status: 'pending'; queuePosition?: number }
  | { status: 'failed'; error: string }
  | { status: 'complete'; imageUrl: string }
export type FalMotionPoll =
  | { status: 'pending'; queuePosition?: number }
  | { status: 'failed'; error: string }
  | { status: 'complete'; videoUrl: string }
export type ShotstackPoll =
  | { status: 'pending'; statusLabel: string }
  | { status: 'failed'; error: string }
  | { status: 'complete'; renderUrl: string; costUsd: number }

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
  const correlation = response.headers.get('x-request-id')
    ?? response.headers.get('request-id')
    ?? response.headers.get('cf-ray')
    ?? undefined
  if (!response.ok) throw new Error(formatIntegrationError(endpoint, response.status, responseText, correlation))
  return JSON.parse(responseText)
}

export type ProviderDiagnostic = {
  provider: string
  endpoint: string
  model: string
  httpStatus: number
  ok: boolean
  correlation: Record<string, string>
  responseBody: unknown
  checkedAt: string
}

export async function runProviderDiagnostic(
  env: Env,
  input: { provider: string; endpoint: string; model: string; body: unknown },
): Promise<ProviderDiagnostic> {
  requirePaidIntegrations(env)
  const response = await apiWorkerFetch(env, `/api/integrations/${input.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.APP_OWNER_JWT}` },
    body: JSON.stringify(input.body),
  })
  const responseText = await response.text()
  const correlation: Record<string, string> = {}
  for (const name of ['x-request-id', 'request-id', 'cf-ray', 'traceparent']) {
    const value = response.headers.get(name)
    if (value) correlation[name] = value
  }
  return {
    provider: input.provider,
    endpoint: input.endpoint,
    model: input.model,
    httpStatus: response.status,
    ok: response.ok,
    correlation,
    responseBody: sanitizeDiagnosticBody(responseText),
    checkedAt: new Date().toISOString(),
  }
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
  input: { prompt: string; imageUrl: string },
): Promise<{ requestId: string }> {
  if (!input.prompt.trim()) throw new Error('motion_prompt_required')
  const imageUrl = new URL(input.imageUrl)
  if (imageUrl.protocol !== 'https:') throw new Error('motion_image_must_use_https')
  const response = asObject(await callIntegration(env, 'fal/run-model', {
    model_id: FAL_MOTION_MODEL,
    maxCostUsd: FAL_MOTION_MAX_COST_USD,
    input: {
      prompt: input.prompt.trim(),
      image_url: imageUrl.toString(),
      resolution: '720p',
      duration: '5',
      generate_audio: false,
      multi_shots: false,
      enable_safety_checker: true,
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

export async function generateNarrationDataUrl(env: Env, text: string, voiceId: string = DEFAULT_MOTIONBRIEF_VOICE_ID): Promise<string> {
  if (!text.trim()) throw new Error('narration_required')
  const words = countWords(text)
  if (words < NARRATION_TARGET_MIN_WORDS || words > NARRATION_HARD_MAX_WORDS) {
    throw new Error('narration_must_be_8_to_13_words')
  }
  if (!isMotionBriefVoiceId(voiceId)) throw new Error('narration_voice_not_allowed')
  const response = asObject(await callIntegration(env, 'elevenlabs/generate-speech', {
    text: text.trim(),
    voice_id: voiceId,
    model_id: ELEVENLABS_MODEL_ID,
    output_format: ELEVENLABS_OUTPUT_FORMAT,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
    },
  }))
  const data = asObject(response?.data) ?? response
  if (typeof data?.audioUrl !== 'string') throw new Error('elevenlabs_response_missing_audio')
  return data.audioUrl
}

function publicAppAssetUrl(env: Env, key: string): string {
  return `https://${env.APP_NAME}.app.space${appFileUrl(key)}`
}

async function inspectPublicAsset(kind: AssetPreflight['kind'], url: string, signal?: AbortSignal): Promise<AssetPreflight> {
  try {
    const response = await fetch(url, { method:'GET', headers:{ Range:'bytes=0-0' }, redirect:'follow', signal })
    const contentRange = response.headers.get('content-range')
    const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1]
    return validateAssetResponse({
      kind, url, status:response.status,
      contentType:response.headers.get('content-type')?.split(';')[0]??'',
      contentLength:totalFromRange ? Number(totalFromRange) : Number(response.headers.get('content-length')) || null,
      acceptsRanges:response.status===206||response.headers.get('accept-ranges')==='bytes',
    })
  } catch (error) {
    return { kind, url, ok:false, status:0, contentType:'', contentLength:null, acceptsRanges:false, error:error instanceof Error?error.message:'asset_fetch_failed' }
  }
}

export async function preflightShotstackAssets(
  env: Env,
  input: { videoKey: string; audioKey?: string; signal?: AbortSignal },
): Promise<RenderPreflight> {
  const checks = [inspectPublicAsset('video',publicAppAssetUrl(env,input.videoKey),input.signal)]
  if(input.audioKey) checks.push(inspectPublicAsset('audio',publicAppAssetUrl(env,input.audioKey),input.signal))
  const assets=await Promise.all(checks)
  return {ok:assets.every(asset=>asset.ok),assets,checkedAt:new Date().toISOString()}
}

export async function submitShotstackRender(
  env: Env,
  input: { headline: string; videoKey: string; videoLength?: number; audioKey?: string; audioLength?: number },
): Promise<{ renderId: string }> {
  if (!input.headline.trim()) throw new Error('headline_required')
  if (!input.videoKey.trim()) throw new Error('stored_video_required')
  const edit = buildShotstackEdit({
    headline: input.headline,
    videoUrl: publicAppAssetUrl(env, input.videoKey),
    videoLength: input.videoLength,
    audioUrl: input.audioKey ? publicAppAssetUrl(env, input.audioKey) : undefined,
    audioLength: input.audioLength,
  })
  console.info('[motionbrief] submitting Shotstack edit', JSON.stringify({
    duration: edit.duration,
    tracks: edit.timeline.tracks.map(track => track.clips.map(value => {
      const clip = value as { asset: { type: string; transcode?: boolean }; start: number; length: number }
      return { type: clip.asset.type, start: clip.start, length: clip.length, transcode: clip.asset.transcode }
    })),
    output: edit.output,
  }))
  const response = asObject(await callIntegration(env, 'shotstack/render', edit))
  const data = asObject(response?.data) ?? response
  if (typeof data?.id !== 'string') throw new Error('shotstack_submission_missing_render_id')
  return { renderId: data.id }
}

export async function pollShotstackRender(env: Env, renderId: string): Promise<ShotstackPoll> {
  const response = asObject(await callIntegration(env, 'shotstack/get-render', { id: renderId }))
  const data = asObject(response?.data) ?? response
  const status = typeof data?.status === 'string' ? data.status.toLowerCase() : 'unknown'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    return { status: 'failed', error: typeof data?.error === 'string' ? data.error : 'Shotstack render failed' }
  }
  if (status === 'done' && typeof data?.url === 'string') {
    return { status: 'complete', renderUrl: data.url, costUsd: typeof data?.costUsd === 'number' ? data.costUsd : 0 }
  }
  return { status: 'pending', statusLabel: status }
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
  return storeAssetBytes(env, {
    projectId: input.projectId,
    kind: input.kind,
    bytes,
    mimeType,
    sourceUrl: input.sourceUrl,
  })
}

async function storeAssetBytes(
  env: Env,
  input: { projectId: string; kind: StoredAsset['kind']; bytes: ArrayBuffer; mimeType: string; sourceUrl: string },
): Promise<StoredAsset> {
  if (!env.APP_IDENTITY_TOKEN) throw new Error('app_identity_required_for_asset_storage')
  const key = safeAssetKey(input.projectId, input.kind, input.mimeType)
  const url = new URL('https://platform.invalid/internal/files/upload')
  url.searchParams.set('scope', 'app')
  url.searchParams.set('uploadKey', key)
  const form = new FormData()
  form.append('file', new Blob([input.bytes], { type: input.mimeType }), key.split('/').at(-1) ?? 'asset')
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
    mimeType: input.mimeType,
    sourceUrl: input.sourceUrl,
    storedAt: new Date().toISOString(),
  }
}

export async function storeNarrationDataUrl(
  env: Env,
  input: { projectId: string; dataUrl: string },
): Promise<StoredAsset> {
  requirePaidIntegrations(env)
  if (!env.APP_IDENTITY_TOKEN) throw new Error('app_identity_required_for_asset_storage')
  const { mimeType, bytes } = decodeBase64DataUrl(input.dataUrl)
  return storeAssetBytes(env, {
    projectId: input.projectId,
    kind: 'audio',
    bytes,
    mimeType,
    sourceUrl: 'elevenlabs:data-url',
  })
}
