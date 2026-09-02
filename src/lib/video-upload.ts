export const MAX_UPLOADED_VIDEO_BYTES = 100 * 1024 * 1024

export function validateUploadedMotion(input: { type: string; size: number; duration: number; width: number; height: number }): string | null {
  if (input.type !== 'video/mp4') return 'Choose an MP4 video.'
  if (input.size > MAX_UPLOADED_VIDEO_BYTES) return 'Choose an MP4 smaller than 100 MB.'
  if (!Number.isFinite(input.duration) || input.duration < 4.5 || input.duration > 5.5) return 'Choose a video between 4.5 and 5.5 seconds.'
  if (input.width <= 0 || input.height <= input.width) return 'Choose a vertical video.'
  const aspectRatio = input.width / input.height
  if (aspectRatio < 0.5 || aspectRatio > 0.625) return 'Choose a vertical video close to 9:16.'
  return null
}

export function readVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('video_metadata_unreadable'))
    }
    video.src = url
  })
}
