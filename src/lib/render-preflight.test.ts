import { describe, expect, it } from 'vitest'
import { validateAssetResponse } from './render-preflight'

describe('render asset preflight', () => {
  const base = {
    kind: 'video' as const,
    url: 'https://example.com/video.mp4',
    status: 206,
    contentType: 'video/mp4',
    contentLength: 1,
    acceptsRanges: true,
  }
  it('accepts a public ranged video response', () =>
    expect(validateAssetResponse(base).ok).toBe(true))
  it('rejects inaccessible assets', () =>
    expect(validateAssetResponse({ ...base, status: 403 }).error).toContain(
      '403',
    ))
  it('rejects incorrect content types', () =>
    expect(
      validateAssetResponse({ ...base, contentType: 'text/html' }).error,
    ).toContain('text/html'))
})
