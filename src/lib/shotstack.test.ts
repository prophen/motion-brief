import { describe, expect, it } from 'vitest'
import { buildShotstackEdit } from './shotstack'

describe('Shotstack edit contract', () => {
  it('builds a silent five-second vertical timeline', () => {
    const edit = buildShotstackEdit({ headline: 'MAKE IT MOVE', videoUrl: 'https://motionbrief.app.space/api/files/clip.mp4' })
    expect(edit.duration).toBe(5)
    expect(edit.output).toMatchObject({ format: 'mp4', aspectRatio: '9:16', resolution: 'hd' })
    expect(edit.timeline.tracks).toHaveLength(2)
    expect(edit.timeline.tracks[1].clips[0]).toMatchObject({ asset: { type: 'video', volume: 0 }, length: 5, fit: 'crop' })
  })

  it('adds narration between the headline and video tracks', () => {
    const edit = buildShotstackEdit({ headline: 'MOVE', videoUrl: 'https://example.com/video.mp4', audioUrl: 'https://example.com/audio.mp3' })
    expect(edit.timeline.tracks).toHaveLength(3)
    expect(edit.timeline.tracks[1].clips[0]).toMatchObject({ asset: { type: 'audio', src: 'https://example.com/audio.mp3', volume: 1 }, length: 5 })
  })

  it('rejects non-public asset protocols', () => {
    expect(() => buildShotstackEdit({ headline: 'MOVE', videoUrl: '/api/files/video.mp4' })).toThrow('Invalid URL')
    expect(() => buildShotstackEdit({ headline: 'MOVE', videoUrl: 'http://example.com/video.mp4' })).toThrow('video_asset_must_use_https')
  })
})
