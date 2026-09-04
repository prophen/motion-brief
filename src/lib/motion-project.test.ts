import { describe, expect, it } from 'vitest'
import { displayedProjectStatus, freshMotionProject } from './motion-project'

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

  it('treats a stored final render as completion evidence', () => {
    const project = freshMotionProject()
    project.status = 'ready'
    project.assetManifest = JSON.stringify([
      {
        kind: 'render',
        projectId: 'project-2',
        key: 'apps/app/project-2/final.mp4',
        url: '/api/files/final.mp4',
        mimeType: 'video/mp4',
        sourceUrl: 'https://cdn.example.com/final.mp4',
        storedAt: '2026-09-04T00:00:00.000Z',
      },
    ])

    expect(displayedProjectStatus(project)).toBe('complete')
  })
})
