export const NARRATION_TARGET_MIN_WORDS = 8
export const NARRATION_TARGET_MAX_WORDS = 11
export const NARRATION_HARD_MAX_WORDS = 13

export function countWords(value: string): number {
  const normalized = value.trim()
  return normalized ? normalized.split(/\s+/u).length : 0
}

/** Manual briefs may intentionally use no narration; spoken briefs need 8–13 words. */
export function narrationFitsFiveSeconds(value: string): boolean {
  const words = countWords(value)
  return words === 0 || (words >= NARRATION_TARGET_MIN_WORDS && words <= NARRATION_HARD_MAX_WORDS)
}

