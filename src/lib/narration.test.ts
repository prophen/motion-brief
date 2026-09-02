import { describe, expect, it } from 'vitest'
import { countWords, narrationFitsFiveSeconds } from './narration'

describe('five-second narration', () => {
  it('counts words across whitespace', () => expect(countWords('One  idea\nstarts here.')).toBe(4))
  it('accepts silence and an 8–13 word read', () => {
    expect(narrationFitsFiveSeconds('')).toBe(true)
    expect(narrationFitsFiveSeconds('Small moments become cinematic when you choose to notice them.')).toBe(true)
  })
  it('rejects scripts outside the timing window', () => {
    expect(narrationFitsFiveSeconds('Too short.')).toBe(false)
    expect(narrationFitsFiveSeconds('One two three four five six seven eight nine ten eleven twelve thirteen fourteen.')).toBe(false)
  })
})
