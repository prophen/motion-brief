import { describe, expect, it } from 'vitest'
import { sanitizeDiagnosticBody } from './provider-diagnostics'

describe('provider diagnostic sanitization', () => {
  it('redacts credentials and data URLs while retaining response details', () => {
    const result = sanitizeDiagnosticBody(
      JSON.stringify({
        status: 'failed',
        requestId: 'req_1',
        token: 'secret',
        audioUrl: 'data:audio/mpeg;base64,abc',
        detail: 'upstream unavailable',
      }),
    )
    expect(result).toEqual({
      status: 'failed',
      requestId: 'req_1',
      token: '[redacted]',
      audioUrl: '[redacted]',
      detail: 'upstream unavailable',
    })
  })

  it('strips query strings from response URLs', () => {
    expect(
      sanitizeDiagnosticBody(
        JSON.stringify({
          url: 'https://example.com/file.mp4?signature=secret',
        }),
      ),
    ).toEqual({ url: 'https://example.com/file.mp4' })
  })
})
