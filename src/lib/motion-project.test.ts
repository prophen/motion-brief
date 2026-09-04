import { describe, expect, it } from 'vitest'
import { freshMotionProject } from './motion-project'

describe('fresh motion projects', () => {
  it('starts AI-authored brief fields empty', () => {
    const project = freshMotionProject()
    expect(project).toMatchObject({
      title: '',
      prompt: '',
      audience: '',
      objective: '',
      visualDirection: '',
      motionDirection: '',
      narration: '',
      headline: '',
      stillPrompt: '',
      motionPrompt: '',
      motionPreset: 'push-in',
    })
  })
})
