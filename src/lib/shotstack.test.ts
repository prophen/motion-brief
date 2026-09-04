import { describe, expect, it } from 'vitest'
import { buildShotstackEdit, buildShotstackTextOnlySmokeEdit } from './shotstack'

describe('Shotstack edit contract', () => {
  it('builds a silent five-second vertical timeline', () => {
    const edit = buildShotstackEdit({ headline: 'MAKE IT MOVE', videoUrl: 'https://motionbrief.app.space/api/files/clip.mp4' })
    expect(edit.duration).toBe(4.9)
    expect(edit.output).toMatchObject({ format: 'mp4', aspectRatio: '9:16', resolution: 'hd' })
    expect(edit.timeline.tracks).toHaveLength(1)
    expect(edit.timeline.tracks[0].clips[0]).toMatchObject({ asset: { type: 'video', transcode: true, volume: 0 }, length: 4.9, fit: 'crop' })
    expect(JSON.stringify(edit)).not.toContain('MAKE IT MOVE')
  })

  it('adds narration before the video track', () => {
    const edit = buildShotstackEdit({ headline: 'MOVE', videoUrl: 'https://example.com/video.mp4', audioUrl: 'https://example.com/audio.mp3', audioLength: 3.9 })
    expect(edit.timeline.tracks).toHaveLength(2)
    expect(edit.timeline.tracks[0].clips[0]).toMatchObject({ asset: { type: 'audio', src: 'https://example.com/audio.mp3', volume: 1 }, length: 3.8 })
  })

  it('never declares clips longer than the measured source video', () => {
    const edit = buildShotstackEdit({ headline:'MOVE', videoUrl:'https://example.com/video.mp4', videoLength:4.97, audioUrl:'https://example.com/audio.mp3', audioLength:5 })
    expect(edit.duration).toBe(4.9)
    expect(edit.timeline.tracks.every(track => (track.clips[0] as {length:number}).length <= 4.9)).toBe(true)
  })

  it('rejects non-public asset protocols', () => {
    expect(() => buildShotstackEdit({ headline: 'MOVE', videoUrl: '/api/files/video.mp4' })).toThrow('Invalid URL')
    expect(() => buildShotstackEdit({ headline: 'MOVE', videoUrl: 'http://example.com/video.mp4' })).toThrow('video_asset_must_use_https')
  })

  it('builds a one-second text-only provider control with no external assets', () => {
    const edit = buildShotstackTextOnlySmokeEdit()
    expect(edit.duration).toBe(1)
    expect(JSON.stringify(edit)).not.toContain('src')
    expect(edit.output).toEqual({ format: 'mp4', resolution: 'sd' })
  })
})
