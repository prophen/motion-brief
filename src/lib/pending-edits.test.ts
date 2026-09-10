import { describe, expect, it } from 'vitest'
import { PendingEdits } from './pending-edits'
import { freshMotionProject, type MotionProject } from './motion-project'

describe('saving edits from independent tabs', () => {
  it('preserves a newer headline when a stale tab saves only its audience', () => {
    const first = new PendingEdits<MotionProject>()
    const second = new PendingEdits<MotionProject>()
    let stored = { ...freshMotionProject(), headline: 'Original' }
    first.set('headline', 'Headline from tab 1')
    stored = { ...stored, ...first.snapshot().patch }
    second.set('audience', 'Audience from tab 2')
    stored = { ...stored, ...second.snapshot().patch }
    expect(stored.headline).toBe('Headline from tab 1')
    expect(stored.audience).toBe('Audience from tab 2')
    expect(second.snapshot().patch).toEqual({ audience: 'Audience from tab 2' })
  })

  it('does not resubmit acknowledged edits over later remote changes', () => {
    const edits = new PendingEdits<MotionProject>()
    edits.set('headline', 'First edit')
    edits.snapshot().acknowledge()
    edits.set('audience', 'Next edit')
    expect(edits.snapshot().patch).toEqual({ audience: 'Next edit' })
  })

  it('preserves edits made while a save is awaiting confirmation', () => {
    const edits = new PendingEdits<MotionProject>()
    edits.set('headline', 'Submitted')
    const saving = edits.snapshot()
    edits.set('headline', 'Still typing')
    edits.set('audience', 'New audience')
    saving.acknowledge()
    expect(saving.patch).toEqual({ headline: 'Submitted' })
    expect(edits.snapshot().patch).toEqual({
      headline: 'Still typing', audience: 'New audience',
    })
  })

  it('retains a failed save for retry and supports clearing fields', () => {
    const edits = new PendingEdits<MotionProject>()
    edits.set('headline', '')
    const failed = edits.snapshot()
    expect(edits.snapshot().patch).toEqual(failed.patch)
    expect(failed.patch).toEqual({ headline: '' })
  })

  it('does not send stored media or completed job metadata on an untouched save', () => {
    expect(new PendingEdits<MotionProject>().snapshot().patch).toEqual({})
  })
})
