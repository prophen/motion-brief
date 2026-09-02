const RENDER_SECONDS = 5

function requireHttpsUrl(value: string, error: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error(error)
  return url.toString()
}

export function buildShotstackEdit(input: { headline: string; videoUrl: string; videoLength?: number; audioUrl?: string; audioLength?: number }) {
  if (!input.headline.trim()) throw new Error('headline_required')
  // Stay below the measured media boundary and on a predictable tenth-second
  // boundary. Provider probes can report a source a frame shorter than browsers.
  const measuredVideoSeconds = Math.min(RENDER_SECONDS, Math.max(0.1, input.videoLength ?? RENDER_SECONDS))
  const renderSeconds = Math.max(0.1, Math.floor((measuredVideoSeconds - 0.05) * 10) / 10)
  const tracks: Array<{ clips: unknown[] }> = [{
    clips: [{
      asset: {
        type: 'text', text: input.headline.trim(), width: 900, height: 300,
        font: { family: 'Open Sans', color: '#ffffff', size: 72, weight: 700, lineHeight: 1 },
        alignment: { horizontal: 'center', vertical: 'center' },
        stroke: { width: 2, color: '#000000' },
      },
      start: 0, length: renderSeconds, position: 'center',
    }],
  }]
  if (input.audioUrl) {
    const measuredAudioSeconds = Math.min(renderSeconds, Math.max(0.1, input.audioLength ?? renderSeconds))
    const audioLength = Math.max(0.1, Math.floor((measuredAudioSeconds - 0.05) * 10) / 10)
    tracks.push({ clips: [{ asset: { type: 'audio', src: requireHttpsUrl(input.audioUrl, 'audio_asset_must_use_https'), volume: 1 }, start: 0, length: audioLength }] })
  }
  tracks.push({ clips: [{ asset: { type: 'video', src: requireHttpsUrl(input.videoUrl, 'video_asset_must_use_https'), transcode: true, volume: 0 }, start: 0, length: renderSeconds, fit: 'crop' }] })
  return {
    timeline: { background: '#000000', tracks },
    output: { format: 'mp4', resolution: 'hd', aspectRatio: '9:16' },
    duration: renderSeconds,
  }
}

export function buildShotstackTextOnlySmokeEdit() {
  return {
    timeline: {
      background: '#111111',
      tracks: [{ clips: [{ asset: { type: 'text', text: 'Provider smoke test' }, start: 0, length: 1 }] }],
    },
    output: { format: 'mp4', resolution: 'sd' },
    duration: 1,
  }
}
