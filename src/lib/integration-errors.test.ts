import { describe, expect, it } from 'vitest'
import { formatIntegrationError } from './integration-errors'

describe('integration errors', () => {
  it('extracts nested provider validation messages and request IDs', () => {
    const body = JSON.stringify({ error:'upstream_provider_error', message:'Shotstack API error 400: {"response":{"request_id":"req_1","errors":[{"message":"output requires resolution"}]}}' })
    expect(formatIntegrationError('shotstack/render',502,body)).toBe('shotstack_render_failed_502: output requires resolution (request req_1)')
  })

  it('retains a plain upstream message', () => {
    expect(formatIntegrationError('fal/run-model',502,'upstream unavailable')).toBe('fal_run-model_failed_502: upstream unavailable')
  })
})
