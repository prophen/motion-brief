import { DEFAULT_MOTIONBRIEF_VOICE_ID } from './voices'

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
  pipelineVersion: number
  assetManifest: string
  imageUrl: string
  videoUrl: string
  audioUrl: string
  renderUrl: string
  status: 'draft' | 'ready' | 'rendering' | 'complete'
}

export const newMotionProject: MotionProject = {
  title: 'Untitled creative brief',
  prompt: '',
  audience: 'Curious creators building for short-form platforms',
  objective: 'Turn one clear idea into a campaign-ready concept.',
  visualDirection: 'Editorial still, tactile light, one decisive focal point, portrait-safe composition.',
  motionDirection: 'Use the still and narration as the foundation for a future motion treatment.',
  narration: 'One clear idea becomes a campaign people can feel.',
  voiceId: DEFAULT_MOTIONBRIEF_VOICE_ID,
  headline: 'MAKE THE IDEA VISIBLE',
  stillPrompt: '',
  motionPrompt: '',
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
