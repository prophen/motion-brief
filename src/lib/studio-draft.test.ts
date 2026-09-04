import { describe, expect, it } from 'vitest'
import {
  clearCreatorPromptDraft,
  readCreatorPromptDraft,
  writeCreatorPromptDraft,
} from './studio-draft'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  }
}

describe('creator prompt draft', () => {
  it('survives a page-level auth redirect in session storage', () => {
    const storage = memoryStorage()

    writeCreatorPromptDraft(storage, 'A tiny camera on a night train')

    expect(readCreatorPromptDraft(storage)).toBe(
      'A tiny camera on a night train',
    )
  })

  it('removes empty and saved drafts', () => {
    const storage = memoryStorage()
    writeCreatorPromptDraft(storage, 'temporary idea')
    writeCreatorPromptDraft(storage, '')
    expect(readCreatorPromptDraft(storage)).toBe('')

    writeCreatorPromptDraft(storage, 'saved idea')
    clearCreatorPromptDraft(storage)
    expect(readCreatorPromptDraft(storage)).toBe('')
  })
})
