export type AssetPreflight = {
  kind: 'video' | 'audio'
  url: string
  ok: boolean
  status: number
  contentType: string
  contentLength: number | null
  acceptsRanges: boolean
  error?: string
}

export type RenderPreflight = {
  ok: boolean
  assets: AssetPreflight[]
  checkedAt: string
}

export function validateAssetResponse(
  input: Omit<AssetPreflight, 'ok' | 'error'>,
): AssetPreflight {
  const expected = input.kind === 'video' ? 'video/' : 'audio/'
  const error = ![200, 206].includes(input.status)
    ? `Public ${input.kind} returned HTTP ${input.status}.`
    : !input.contentType.toLowerCase().startsWith(expected)
      ? `Public ${input.kind} returned ${input.contentType || 'no content type'}.`
      : undefined
  return { ...input, ok: !error, error }
}
