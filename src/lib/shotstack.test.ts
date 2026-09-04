import { describe, expect, it } from 'vitest'
import {
  buildShotstackEdit,
  buildShotstackTextOnlySmokeEdit,
} from './shotstack'

describe('Shotstack edit contract', () => {
  it('builds a silent five-second vertical image timeline', () => {
    const edit = buildShotstackEdit({
      headline: 'MAKE IT MOVE',
      imageUrl: 'https://motionbrief.app.space/api/files/visual.jpg',
      motionPreset: 'push-in',
    })
    expect(edit.duration).toBe(5)
    expect(edit.output).toMatchObject({
      format: 'mp4',
      aspectRatio: '9:16',
      resolution: 'hd',
    })
    expect(edit.timeline.tracks).toHaveLength(1)
    expect(edit.timeline.tracks[0].clips[0]).toMatchObject({
      asset: { type: 'image' },
      length: 5,
      fit: 'crop',
      effect: 'zoomIn',
    })
    expect(JSON.stringify(edit)).not.toContain('MAKE IT MOVE')
  })

  it('adds narration before the video track', () => {
    const edit = buildShotstackEdit({
      headline: 'MOVE',
      imageUrl: 'https://example.com/image.jpg',
      motionPreset: 'pan-left',
      audioUrl: 'https://example.com/audio.mp3',
      audioLength: 3.9,
    })
    expect(edit.timeline.tracks).toHaveLength(2)
    expect(edit.timeline.tracks[0].clips[0]).toMatchObject({
      asset: { type: 'audio', src: 'https://example.com/audio.mp3', volume: 1 },
      length: 3.8,
    })
  })

  it('caps narration to the five-second image timeline', () => {
    const edit = buildShotstackEdit({
      headline: 'MOVE',
      imageUrl: 'https://example.com/image.jpg',
      motionPreset: 'pull-back',
      audioUrl: 'https://example.com/audio.mp3',
      audioLength: 8,
    })
    expect(edit.duration).toBe(5)
    expect(
      edit.timeline.tracks.every(
        (track) => (track.clips[0] as { length: number }).length <= 5,
      ),
    ).toBe(true)
  })

  it('rejects non-public asset protocols', () => {
    expect(() =>
      buildShotstackEdit({
        headline: 'MOVE',
        imageUrl: '/api/files/image.jpg',
        motionPreset: 'push-in',
      }),
    ).toThrow('Invalid URL')
    expect(() =>
      buildShotstackEdit({
        headline: 'MOVE',
        imageUrl: 'http://example.com/image.jpg',
        motionPreset: 'push-in',
      }),
    ).toThrow('image_asset_must_use_https')
  })

  it('builds a one-second text-only provider control with no external assets', () => {
    const edit = buildShotstackTextOnlySmokeEdit()
    expect(edit.duration).toBe(1)
    expect(JSON.stringify(edit)).not.toContain('src')
    expect(edit.output).toEqual({ format: 'mp4', resolution: 'sd' })
  })
})
