import { DEFAULT_MOTIONBRIEF_VOICE_ID } from './voices'
import { DEFAULT_MOTION_PRESET, type MotionPreset } from './motion-presets'

export type MotionProject = {
  title: string
  prompt: string
  audience: string
  objective: string
  visualDirection: string
  motionDirection: string
  narration: string
  voiceId: string
  headline: string
  stillPrompt: string
  motionPrompt: string
  motionPreset: MotionPreset
  pipelineVersion: number
  assetManifest: string
  imageUrl: string
  videoUrl: string
  audioUrl: string
  renderUrl: string
  status: 'draft' | 'ready' | 'rendering' | 'complete'
}

export const newMotionProject: MotionProject = {
  title: '',
  prompt: '',
  audience: '',
  objective: '',
  visualDirection: '',
  motionDirection: '',
  narration: '',
  voiceId: DEFAULT_MOTIONBRIEF_VOICE_ID,
  headline: '',
  stillPrompt: '',
  motionPrompt: '',
  motionPreset: DEFAULT_MOTION_PRESET,
  pipelineVersion: 1,
  assetManifest: '[]',
  imageUrl: '',
  videoUrl: '',
  audioUrl: '',
  renderUrl: '',
  status: 'draft',
}

export function freshMotionProject(): MotionProject {
  return { ...newMotionProject }
}
