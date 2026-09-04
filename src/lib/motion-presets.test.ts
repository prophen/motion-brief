import { describe, expect, it } from 'vitest'
import {
  normalizeMotionPreset,
  shotstackEffectForPreset,
} from './motion-presets'

describe('motion presets', () => {
  it('maps every UI preset to a Shotstack effect', () => {
    expect(shotstackEffectForPreset('push-in')).toBe('zoomIn')
    expect(shotstackEffectForPreset('pull-back')).toBe('zoomOut')
    expect(shotstackEffectForPreset('pan-left')).toBe('slideLeft')
    expect(shotstackEffectForPreset('pan-right')).toBe('slideRight')
  })

  it('migrates missing or unknown values to the default', () => {
    expect(normalizeMotionPreset(undefined)).toBe('push-in')
    expect(normalizeMotionPreset('orbit')).toBe('push-in')
  })
})
