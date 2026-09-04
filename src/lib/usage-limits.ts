export const PUBLIC_DAILY_LIMIT_PER_STAGE = 5
export const PUBLIC_USAGE_COOLDOWN_MS = 15_000

export const usageStages = ['brief', 'visual', 'narration', 'render'] as const
export type UsageStage = (typeof usageStages)[number]

const paidJobStages: Record<string, UsageStage> = {
  'motionbrief-generate-brief': 'brief',
  'motionbrief-generate-still': 'visual',
  'motionbrief-generate-narration': 'narration',
  'motionbrief-render-final': 'render',
}

export function paidUsageStage(jobType: string): UsageStage | null {
  return paidJobStages[jobType] ?? null
}

export function usageStageLabel(stage: UsageStage): string {
  return {
    brief: 'AI brief',
    visual: 'visual',
    narration: 'narration',
    render: 'final render',
  }[stage]
}

export function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}
