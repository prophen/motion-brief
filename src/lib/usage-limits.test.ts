import { describe, expect, it } from 'vitest'
import { paidUsageStage, usageStageLabel, utcDayStart } from './usage-limits'

describe('usage limits', () => {
  it.each([
    ['motionbrief-generate-brief', 'brief'],
    ['motionbrief-generate-still', 'visual'],
    ['motionbrief-generate-narration', 'narration'],
    ['motionbrief-render-final', 'render'],
  ])('maps %s to its paid stage', (jobType, stage) => {
    expect(paidUsageStage(jobType)).toBe(stage)
  })

  it('does not charge free recovery or preflight jobs', () => {
    expect(paidUsageStage('motionbrief-preflight-render')).toBeNull()
    expect(paidUsageStage('motionbrief-store-render')).toBeNull()
  })

  it('uses a UTC boundary for the global daily ceiling', () => {
    expect(utcDayStart(Date.parse('2026-09-04T23:59:59.000Z'))).toBe(
      Date.parse('2026-09-04T00:00:00.000Z'),
    )
  })

  it('provides readable stage names', () => {
    expect(usageStageLabel('brief')).toBe('AI brief')
    expect(usageStageLabel('render')).toBe('final render')
  })
})
