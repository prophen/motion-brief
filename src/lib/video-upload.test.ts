import { describe, expect, it } from 'vitest'
import {
  MAX_UPLOADED_VIDEO_BYTES,
  validateUploadedMotion,
} from './video-upload'

describe('uploaded motion validation', () => {
  const valid = {
    type: 'video/mp4',
    size: 2_000_000,
    duration: 5,
    width: 1080,
    height: 1920,
  }

  it('accepts a five-second 9:16 MP4', () =>
    expect(validateUploadedMotion(valid)).toBeNull())
  it('rejects wrong formats and oversized files', () => {
    expect(
      validateUploadedMotion({ ...valid, type: 'video/quicktime' }),
    ).toContain('MP4')
    expect(
      validateUploadedMotion({ ...valid, size: MAX_UPLOADED_VIDEO_BYTES + 1 }),
    ).toContain('100 MB')
  })
  it('rejects wrong duration and aspect ratio', () => {
    expect(validateUploadedMotion({ ...valid, duration: 8 })).toContain('4.95')
    expect(
      validateUploadedMotion({ ...valid, width: 1920, height: 1080 }),
    ).toContain('vertical')
    expect(
      validateUploadedMotion({ ...valid, width: 900, height: 1200 }),
    ).toContain('9:16')
  })
})
