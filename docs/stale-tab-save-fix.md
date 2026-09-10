# Stale-tab Save fix

On September 10, 2026, the live two-tab check reproduced data loss: tab 1 saved a headline, then an older tab 2 saved only its audience. Reload retained the audience but reverted the headline.

Save previously submitted the entire local draft. Existing records now receive only explicitly edited fields, plus the ready status. New projects still receive a complete initial record. Unchanged saves send no mutation; saves never resubmit stale media or generation metadata. Pending edits are acknowledged only after acceptance, and edits made during a pending save survive for the next save. Project navigation resets the edit tracker.

Validation: 55 unit tests passed, TypeScript and ESLint passed, and the deployment build passed. Regression coverage includes independent tab patches, later saves after acknowledgment, typing during a save, failed-save retry, cleared fields, and untouched saves.

Live retest passed: after reloading both tabs to load the new code, the owner saved a new headline in tab 1, then changed only audience in tab 2 without reloading it. Reloading tab 1 retained both changes. Automatic refresh of open editors and same-field conflict resolution are outside this fix; the last accepted explicit edit to the same field wins.

Other live checks confirmed by the user: clipboard contents, Markdown asset links, all media downloads, and successful final MP4 playback. A second account received “Project not found” at the owner's project URL and could not see it in the project list. This verifies those UI read-access paths, not a comprehensive authorization audit.

The owner subsequently reported pushing the latest fix to GitHub. These verification-note updates were made after that push.
