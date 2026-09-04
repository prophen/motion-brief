export const MOTION_PRESETS = [
  { id: 'push-in', label: 'Slow push in', shotstackEffect: 'zoomIn' },
  { id: 'pull-back', label: 'Slow pull back', shotstackEffect: 'zoomOut' },
  { id: 'pan-left', label: 'Pan left', shotstackEffect: 'slideLeft' },
  { id: 'pan-right', label: 'Pan right', shotstackEffect: 'slideRight' },
] as const

export type MotionPreset = (typeof MOTION_PRESETS)[number]['id']

export const DEFAULT_MOTION_PRESET: MotionPreset = 'push-in'

export function normalizeMotionPreset(value: unknown): MotionPreset {
  return MOTION_PRESETS.some((preset) => preset.id === value)
    ? (value as MotionPreset)
    : DEFAULT_MOTION_PRESET
}

export function shotstackEffectForPreset(preset: MotionPreset): string {
  return MOTION_PRESETS.find((option) => option.id === preset)!.shotstackEffect
}
