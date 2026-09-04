import { describe, expect, it } from 'vitest'
import {
  assetFileExtension,
  decodeBase64DataUrl,
  latestStoredAsset,
  normalizeAssetManifest,
  normalizeProjectAssetManifest,
  parseAssetManifest,
  upsertAssetManifest,
  type StoredAsset,
} from './assets'

const image: StoredAsset = {
  kind: 'image',
  key: 'one.png',
  url: '/one',
  mimeType: 'image/png',
  sourceUrl: 'https://example.com/one',
  storedAt: '2026-09-02T00:00:00Z',
}
const updated: StoredAsset = {
  ...image,
  url: '/updated',
  storedAt: '2026-09-02T01:00:00Z',
}

describe('asset manifests', () => {
  it('normalizes duplicate keys and preserves the latest value', () => {
    const assets = parseAssetManifest(
      normalizeAssetManifest(JSON.stringify([image, updated])),
    )
    expect(assets).toEqual([updated])
  })

  it('removes assets inherited from another project', () => {
    const own = {
      ...image,
      key: 'apps/app-id/canonical-image.jpg',
      projectId: 'project-new',
    }
    const inherited = {
      ...updated,
      key: 'apps/app-id/canonical-render.mp4',
      projectId: 'project-old',
      kind: 'render' as const,
    }
    expect(
      parseAssetManifest(
        normalizeProjectAssetManifest(
          JSON.stringify([inherited, own]),
          'project-new',
        ),
      ),
    ).toEqual([own])
  })

  it('keeps only legacy assets confirmed by the active project job history', () => {
    expect(
      parseAssetManifest(
        normalizeProjectAssetManifest(JSON.stringify([image]), 'project-new'),
      ),
    ).toEqual([])
    expect(
      parseAssetManifest(
        normalizeProjectAssetManifest(JSON.stringify([image]), 'project-new', [
          image.key,
        ]),
      ),
    ).toEqual([{ ...image, projectId: 'project-new' }])
  })

  it('upserts without duplicating an asset and finds the latest kind', () => {
    const video: StoredAsset = {
      ...image,
      kind: 'video',
      key: 'clip.mp4',
      mimeType: 'video/mp4',
    }
    const manifest = upsertAssetManifest(
      upsertAssetManifest('[]', image),
      video,
    )
    expect(
      parseAssetManifest(upsertAssetManifest(manifest, updated)),
    ).toHaveLength(2)
    expect(latestStoredAsset(manifest, 'video')).toEqual(video)
  })

  it('decodes a base64 narration data URL and rejects malformed input', () => {
    const decoded = decodeBase64DataUrl('data:audio/mpeg;base64,SGk=')
    expect(decoded.mimeType).toBe('audio/mpeg')
    expect([...new Uint8Array(decoded.bytes)]).toEqual([72, 105])
    expect(() => decodeBase64DataUrl('https://example.com/audio.mp3')).toThrow(
      'narration_audio_data_url_invalid',
    )
  })

  it('stores MPEG audio with the MP3 filename Shotstack accepts', () => {
    expect(assetFileExtension('audio/mpeg')).toBe('mp3')
    expect(assetFileExtension('audio/mpeg; charset=binary')).toBe('mp3')
    expect(assetFileExtension('image/png')).toBe('png')
  })
})
