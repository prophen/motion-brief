export type StoredAsset = {
  kind: 'image' | 'video' | 'audio' | 'render'
  key: string
  url: string
  mimeType: string
  sourceUrl: string
  storedAt: string
}

function isStoredAsset(value: unknown): value is StoredAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return ['image', 'video', 'audio', 'render'].includes(String(asset.kind))
    && ['key', 'url', 'mimeType', 'sourceUrl', 'storedAt'].every(field => typeof asset[field] === 'string')
}

export function parseAssetManifest(value: string): StoredAsset[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter(isStoredAsset) : []
  } catch {
    return []
  }
}

export function normalizeAssetManifest(value: string): string {
  const unique = new Map<string, StoredAsset>()
  for (const asset of parseAssetManifest(value)) unique.set(asset.key, asset)
  return JSON.stringify([...unique.values()])
}

export function upsertAssetManifest(value: string, asset: StoredAsset): string {
  const assets = parseAssetManifest(value).filter(existing => existing.key !== asset.key)
  return JSON.stringify([...assets, asset])
}

export function latestStoredAsset(value: string, kind: StoredAsset['kind']): StoredAsset | undefined {
  return parseAssetManifest(value).reverse().find(asset => asset.kind === kind && Boolean(asset.key))
}

export function decodeBase64DataUrl(dataUrl: string): { mimeType: string; bytes: ArrayBuffer } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/s.exec(dataUrl)
  if (!match) throw new Error('narration_audio_data_url_invalid')
  try {
    const binary = atob(match[2].replace(/\s/g, ''))
    return {
      mimeType: match[1],
      bytes: Uint8Array.from(binary, character => character.charCodeAt(0)).buffer,
    }
  } catch {
    throw new Error('narration_audio_data_url_invalid')
  }
}
