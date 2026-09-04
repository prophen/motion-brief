import { describe, expect, it } from 'vitest'
import {
  buildCreativePackageMarkdown,
  safePackageFilename,
} from './creative-package'

describe('creative package export', () => {
  it('includes the editable brief and generated assets', () => {
    const result = buildCreativePackageMarkdown({
      title: 'Small Camera',
      prompt: 'Make walks cinematic',
      audience: 'Creators',
      objective: 'Inspire a trial',
      headline: 'Carry the cinema',
      visualDirection: 'Warm editorial light',
      stillPrompt: 'A pocket camera at dusk',
      narration: 'Every ordinary walk can hold a scene worth keeping.',
      imageUrl: 'https://motionbrief.app.space/image.jpg',
      audioUrl: 'https://motionbrief.app.space/voice.mp3',
    })
    expect(result).toContain('# Small Camera')
    expect(result).toContain('## Shareable generated assets')
    expect(result).toContain('Anyone with these media links')
    expect(result).toContain(
      '![Generated campaign visual](https://motionbrief.app.space/image.jpg)',
    )
    expect(result).toContain(
      '[Listen to or download the narration](https://motionbrief.app.space/voice.mp3)',
    )
  })

  it('creates a filesystem-safe filename', () => {
    expect(safePackageFilename('  Make It Move!  ')).toBe(
      'make-it-move-creative-package.md',
    )
    expect(safePackageFilename('***')).toBe('motionbrief-creative-package.md')
  })
})
