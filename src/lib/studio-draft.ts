const CREATOR_PROMPT_DRAFT_KEY = 'motionbrief:creator-prompt-draft'

export function readCreatorPromptDraft(storage: Storage): string {
  return storage.getItem(CREATOR_PROMPT_DRAFT_KEY) ?? ''
}

export function writeCreatorPromptDraft(storage: Storage, prompt: string) {
  if (prompt) storage.setItem(CREATOR_PROMPT_DRAFT_KEY, prompt)
  else storage.removeItem(CREATOR_PROMPT_DRAFT_KEY)
}

export function clearCreatorPromptDraft(storage: Storage) {
  storage.removeItem(CREATOR_PROMPT_DRAFT_KEY)
}
