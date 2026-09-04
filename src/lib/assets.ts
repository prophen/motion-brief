export type StoredAsset = {
  kind: 'image' | 'video' | 'audio' | 'render'
  projectId?: string
  key: string
  url: string
  mimeType: string
  sourceUrl: string
  storedAt: string
}

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
}

export function assetFileExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';')[0].trim()
  return (
    MIME_EXTENSIONS[normalized] ??
    normalized.split('/')[1]?.replace(/[^a-z0-9]/g, '') ??
    'bin'
  )
}

function isStoredAsset(value: unknown): value is StoredAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return (
    ['image', 'video', 'audio', 'render'].includes(String(asset.kind)) &&
    ['key', 'url', 'mimeType', 'sourceUrl', 'storedAt'].every(
      (field) => typeof asset[field] === 'string',
    )
  )
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

export function assetBelongsToProject(
  asset: StoredAsset,
  projectId: string,
): boolean {
  return asset.projectId === projectId
}

export function normalizeProjectAssetManifest(
  value: string,
  projectId: string,
  legacyAssetKeys: Iterable<string> = [],
): string {
  const confirmedLegacyKeys = new Set(legacyAssetKeys)
  return JSON.stringify(
    parseAssetManifest(normalizeAssetManifest(value)).flatMap((asset) => {
      if (assetBelongsToProject(asset, projectId)) return [asset]
      if (!asset.projectId && confirmedLegacyKeys.has(asset.key))
        return [{ ...asset, projectId }]
      return []
    }),
  )
}

export function upsertAssetManifest(value: string, asset: StoredAsset): string {
  const assets = parseAssetManifest(value).filter(
    (existing) => existing.key !== asset.key,
  )
  return JSON.stringify([...assets, asset])
}

export function removeAssetKind(
  value: string,
  kind: StoredAsset['kind'],
): string {
  return JSON.stringify(
    parseAssetManifest(value).filter((asset) => asset.kind !== kind),
  )
}

export function projectAssetKeys(value: string, projectId: string): string[] {
  return [
    ...new Set(
      parseAssetManifest(value)
        .filter((asset) => assetBelongsToProject(asset, projectId))
        .map((asset) => asset.key),
    ),
  ]
}

export function latestStoredAsset(
  value: string,
  kind: StoredAsset['kind'],
): StoredAsset | undefined {
  return parseAssetManifest(value)
    .reverse()
    .find((asset) => asset.kind === kind && Boolean(asset.key))
}

export function decodeBase64DataUrl(dataUrl: string): {
  mimeType: string
  bytes: ArrayBuffer
} {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/s.exec(dataUrl)
  if (!match) throw new Error('narration_audio_data_url_invalid')
  try {
    const binary = atob(match[2].replace(/\s/g, ''))
    return {
      mimeType: match[1],
      bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0))
        .buffer,
    }
  } catch {
    throw new Error('narration_audio_data_url_invalid')
  }
}
