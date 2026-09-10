# Saved brief persistence

The September 9 live check found that saved title and headline edits reverted after reopening the studio. A completed brief-generation job was replayed on every mount because the only applied-job marker was a React ref.

The project now stores two additional text fields:

- `briefRequestId`: a request identifier persisted before enqueueing generation, also carried in the job payload.
- `appliedBriefJobId`: the completed job applied to the saved brief, written with the brief patch.

The studio accepts a requested result once, ignores superseded requests, and can recover the matching result after the page closes. For older projects without markers, a populated saved brief is retained and the old job is marked as adopted. An empty legacy brief can still recover its first generation.

Job reconciliation sends partial record patches. Image, narration, and render completions no longer send an old copy of unrelated brief fields back to storage. Local updates merge into the current draft.

Eight regression cases cover save/reload preservation, regeneration after closing the page, superseded results, legacy project adoption, legacy first-generation recovery, unfinished jobs, project mismatches, and unrelated media/voice preservation. The full 50-test suite, type checking, lint, and production build pass.

These checks do not establish atomic conflict resolution for simultaneous edits from multiple tabs. Generation still intentionally replaces generated brief fields when explicitly requested by the creator.

## Deployed verification

Released to `https://motion-brief.app.space` as `rel_01M24C5VGMYJS8JSMXE3B6JRYF` on September 9, 2026 (local date). DeepSpace confirmed edge and data-plane serving. The release shipped the local working tree; these changes have not been committed or pushed to GitHub.

On the existing live-check project, changed the title and headline, waited for the confirmed save, and reloaded: both remained intact. Then explicitly generated a new brief, reloaded while it was pending, and observed the new result after reopening. Edited that new brief, saved, and reloaded again: both edited fields remained intact. No image, narration, or render was regenerated in this fix verification.
