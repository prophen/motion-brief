import type { MotionProject } from './motion-project'

export type GeneratedBrief = Pick<
  MotionProject,
  | 'title'
  | 'audience'
  | 'objective'
  | 'visualDirection'
  | 'motionDirection'
  | 'narration'
  | 'headline'
  | 'stillPrompt'
  | 'motionPrompt'
>

type BriefJob = {
  id: string
  status: string
  payload?: unknown
  result?: { projectId: string; brief?: GeneratedBrief } | null
}

// Return a partial record patch: job reconciliation must not overwrite
// unrelated saved settings or media using an old snapshot of the draft.
export function briefJobPatch(
  project: MotionProject,
  projectId: string,
  job: BriefJob,
): Partial<MotionProject> | null {
  const payload = job.payload as
    { projectId?: string; requestId?: string } | undefined
  if (
    job.status !== 'succeeded' ||
    !job.result?.brief ||
    payload?.projectId !== projectId ||
    job.result.projectId !== projectId ||
    project.appliedBriefJobId === job.id
  )
    return null

  if (payload.requestId || project.briefRequestId) {
    // A new request is saved before enqueueing. This also lets a result
    // finish while the page is closed without accepting superseded jobs.
    if (!payload.requestId || payload.requestId !== project.briefRequestId)
      return null
  } else if (
    project.appliedBriefJobId ||
    Object.keys(job.result.brief).some(
      (key) => project[key as keyof GeneratedBrief].trim() !== '',
    )
  ) {
    // Existing projects predate the markers. Adopt their completed job
    // without replacing the owner's saved (possibly edited) brief.
    return { appliedBriefJobId: job.id }
  }

  return {
    ...job.result.brief,
    appliedBriefJobId: job.id,
    status: 'ready',
  }
}
