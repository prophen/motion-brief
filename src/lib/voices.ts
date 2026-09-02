export const MOTIONBRIEF_VOICES = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', style: 'Warm British storyteller' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', style: 'Warm, confident professional' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', style: 'Energetic social creator' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', style: 'Relaxed and neutral' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', style: 'Playful, bright, and warm' },
] as const

export const DEFAULT_MOTIONBRIEF_VOICE_ID = MOTIONBRIEF_VOICES[0].id

export function isMotionBriefVoiceId(value: string): boolean {
  return MOTIONBRIEF_VOICES.some(voice => voice.id === value)
}
