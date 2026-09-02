const RENDER_SECONDS = 5

function requireHttpsUrl(value: string, error: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error(error)
  return url.toString()
}

export function buildShotstackEdit(input: { headline: string; videoUrl: string; audioUrl?: string }) {
  if (!input.headline.trim()) throw new Error('headline_required')
  const tracks: Array<{ clips: unknown[] }> = [{
    clips: [{
      asset: {
        type: 'text', text: input.headline.trim(), width: 900, height: 300,
        font: { family: 'Open Sans', color: '#ffffff', size: 72, weight: 700, lineHeight: 1 },
        alignment: { horizontal: 'center', vertical: 'center' },
        stroke: { width: 2, color: '#000000' },
      },
      start: 0, length: RENDER_SECONDS, position: 'center',
    }],
  }]
  if (input.audioUrl) {
    tracks.push({ clips: [{ asset: { type: 'audio', src: requireHttpsUrl(input.audioUrl, 'audio_asset_must_use_https'), volume: 1 }, start: 0, length: RENDER_SECONDS }] })
  }
  tracks.push({ clips: [{ asset: { type: 'video', src: requireHttpsUrl(input.videoUrl, 'video_asset_must_use_https'), volume: 0 }, start: 0, length: RENDER_SECONDS, fit: 'crop' }] })
  return {
    timeline: { background: '#000000', tracks },
    output: { format: 'mp4', resolution: 'hd', aspectRatio: '9:16', fps: 25, quality: 'medium', mute: false },
    duration: RENDER_SECONDS,
  }
}
