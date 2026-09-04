# MotionBrief submission notes

## What I built

MotionBrief is an interactive creative-concept studio. A creator enters one rough prompt, saves it to a synchronized project, and uses AI to produce an editable campaign brief. They can refine every field, generate a portrait visual, select a narration voice, listen to the result, and export the completed package as Markdown together with its stored media assets.

## DeepSpace integrations

1. **OpenAI `chat-completion`** — creates the structured, editable brief, headline, narration, and image direction.
2. **FAL `run-model` / `get-result`** — generates and polls for the Seedream portrait visual.
3. **ElevenLabs `generate-speech`** — turns the edited narration into audio using a user-selected voice.

The app also uses DeepSpace records, confirmed mutations, background jobs, authentication, realtime job progress, and app-scoped file storage. Provider outputs are copied into durable storage rather than depending on expiring URLs.

## Main tradeoff

I originally planned a five-second animated-video pipeline using FAL image-to-video and Shotstack rendering. Repeated minimal requests to both endpoints failed at the upstream integration gateway. I reported the failures, added asset preflight and diagnostic handling, and stopped retrying paid requests without new evidence. I then narrowed the submission to a polished multimedia concept package using the three integrations that worked reliably.

This kept the important path complete and demonstrable. The next phase is to restore animation and final MP4 composition after the provider issues are confirmed fixed. That implementation is preserved separately on `main`.

## Work completed with Codex

Codex helped inspect the DeepSpace integration schemas, implement the job-backed provider pipeline, add durable asset handling, diagnose upstream failures, create unit tests, and refocus the interface after the scope decision.

I directed when paid smoke tests were allowed, manually tested the generated brief, FAL still, voice selection, narration, persistence, and deployed behavior, and verified provider usage/refunds during failure investigation.

## Final verification checklist

- [ ] Start from a freshly saved creator prompt.
- [ ] Confirm OpenAI produces an editable brief.
- [ ] Edit and save at least one generated field.
- [ ] Confirm FAL generates and durably stores the visual.
- [ ] Choose a different ElevenLabs voice and generate narration.
- [ ] Reload and verify that the project and media persist.
- [ ] Mark the creative package ready.
- [ ] Copy and download the Markdown package.
- [ ] Download the visual and narration assets.
- [ ] Check the deployed app on desktop and mobile widths.
- [ ] Confirm `/` redirects to `/home`.
