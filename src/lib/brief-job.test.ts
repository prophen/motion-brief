import { describe, expect, it } from 'vitest'
import { briefJobPatch, type GeneratedBrief } from './brief-job'
import { freshMotionProject } from './motion-project'

const brief: GeneratedBrief = {
  title: 'Bravery Starts Small',
  audience: 'Animal lovers',
  objective: 'Celebrate curiosity',
  visualDirection: 'A hamster at sunrise',
  motionDirection: 'A gentle push in',
  narration: 'Every tiny peek can become a brave beginning.',
  headline: 'Bravery Starts Small',
  stillPrompt: 'A golden hamster in a mossy burrow',
  motionPrompt: 'Push in slowly',
}
const job = {
  id: 'brief-job-1',
  status: 'succeeded',
  payload: { projectId: 'project-1', requestId: 'request-1' },
  result: { projectId: 'project-1', brief },
}

describe('brief job persistence', () => {
  it('preserves saved edits when a completed job is replayed after reload', () => {
    const initial = { ...freshMotionProject(), briefRequestId: 'request-1' }
    const generated = {
      ...initial,
      ...briefJobPatch(initial, 'project-1', job),
    }
    const saved = {
      ...generated,
      title: 'My edited project',
      headline: 'One small peek. One brave beginning.',
      narration: 'Take one tiny step toward a brave new beginning.',
      motionPreset: 'pan-right' as const,
    }
    const reopened = JSON.parse(JSON.stringify(saved))
    expect(briefJobPatch(reopened, 'project-1', job)).toBeNull()
    expect(reopened).toEqual(saved)
  })

  it('recovers a requested regeneration that finishes while the page is closed', () => {
    const saved = {
      ...freshMotionProject(),
      ...brief,
      briefRequestId: 'request-2',
      appliedBriefJobId: job.id,
    }
    const completed = {
      ...job,
      id: 'brief-job-2',
      payload: { projectId: 'project-1', requestId: 'request-2' },
      result: {
        projectId: 'project-1',
        brief: { ...brief, title: 'New concept' },
      },
    }
    const patch = briefJobPatch(saved, 'project-1', completed)
    expect(patch).toMatchObject({
      title: 'New concept',
      appliedBriefJobId: 'brief-job-2',
    })
    expect(
      briefJobPatch({ ...saved, ...patch }, 'project-1', completed),
    ).toBeNull()
  })

  it('ignores an older result when another request has superseded it', () => {
    const project = { ...freshMotionProject(), briefRequestId: 'request-2' }
    expect(briefJobPatch(project, 'project-1', job)).toBeNull()
  })

  it('adopts a legacy completed job without overwriting edited fields or completion status', () => {
    const project = {
      ...freshMotionProject(),
      title: 'My existing project',
      headline: 'My saved headline',
      status: 'complete' as const,
    }
    const legacy = { ...job, payload: { projectId: 'project-1' } }
    const patch = briefJobPatch(project, 'project-1', legacy)
    expect(patch).toEqual({ appliedBriefJobId: job.id })
    const reopened = JSON.parse(
      JSON.stringify({ ...project, ...patch, title: '', headline: '' }),
    )
    expect(briefJobPatch(reopened, 'project-1', legacy)).toBeNull()
  })

  it('recovers a legacy first generation into an empty brief', () => {
    const project = { ...freshMotionProject(), prompt: 'A hamster at sunrise' }
    const legacy = { ...job, payload: { projectId: 'project-1' } }
    expect(briefJobPatch(project, 'project-1', legacy)).toMatchObject({
      ...brief,
      appliedBriefJobId: job.id,
    })
  })

  it('does not reapply a legacy result over a newly requested generation', () => {
    const project = { ...freshMotionProject(), briefRequestId: 'request-2' }
    expect(
      briefJobPatch(project, 'project-1', {
        ...job,
        payload: { projectId: 'project-1' },
      }),
    ).toBeNull()
  })

  it('ignores unfinished jobs, missing results, and results belonging to another project', () => {
    const project = { ...freshMotionProject(), briefRequestId: 'request-1' }
    expect(
      briefJobPatch(project, 'project-1', { ...job, status: 'running' }),
    ).toBeNull()
    expect(
      briefJobPatch(project, 'project-1', { ...job, result: undefined }),
    ).toBeNull()
    expect(briefJobPatch(project, 'project-2', job)).toBeNull()
    expect(
      briefJobPatch(project, 'project-1', {
        ...job,
        result: { projectId: 'project-2', brief },
      }),
    ).toBeNull()
  })

  it('applies only brief fields and its marker, preserving media and voice settings', () => {
    const project = {
      ...freshMotionProject(),
      briefRequestId: 'request-1',
      voiceId: 'selected-voice',
      assetManifest: '[{"kind":"render"}]',
      renderUrl: '/saved-render.mp4',
    }
    const patch = briefJobPatch(project, 'project-1', job)!
    expect(patch).not.toHaveProperty('assetManifest')
    expect(patch).not.toHaveProperty('voiceId')
    expect({ ...project, ...patch }).toMatchObject({
      voiceId: 'selected-voice',
      assetManifest: project.assetManifest,
      renderUrl: project.renderUrl,
    })
  })
})
