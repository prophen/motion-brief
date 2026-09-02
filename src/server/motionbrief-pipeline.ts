import { apiWorkerFetch, platformWorkerFetch } from 'deepspace/worker'
import type { Env } from '../../worker.js'

export const MOTIONBRIEF_PIPELINE_VERSION = 1
export const OPENAI_BRIEF_MODEL = 'gpt-5.6-terra'

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
  return result
}

export async function generateCreativeBrief(
  env: Env,
  creatorPrompt: string,
): Promise<CreativeBrief> {
  requirePaidIntegrations(env)
  if (!creatorPrompt.trim()) throw new Error('creator_prompt_required')

  const response = await apiWorkerFetch(env, '/api/integrations/openai/chat-completions', {
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
          content: 'You are a creative director for short-form vertical video. Return only valid JSON with these non-empty string fields: title, audience, objective, visualDirection, motionDirection, narration, headline, stillPrompt, motionPrompt. Keep narration under 55 words and headline under 8 words.',
        },
        { role: 'user', content: creatorPrompt.trim() },
      ],
    }),
  })
  if (!response.ok) throw new Error(`openai_brief_failed_${response.status}`)
  return parseCreativeBrief(extractChatContent(await response.json()))
}

function safeAssetKey(projectId: string, kind: StoredAsset['kind'], mimeType: string): string {
  const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `motionbrief/${safeProjectId}/${kind}-${crypto.randomUUID()}.${extension}`
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
    url: result.url,
    mimeType,
    sourceUrl: input.sourceUrl,
    storedAt: new Date().toISOString(),
  }
}
