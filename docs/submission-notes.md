# MotionBrief submission notes

## What I built

MotionBrief is an interactive creative-concept studio. A creator enters one rough prompt, saves it to a synchronized project, and uses AI to produce an editable campaign brief. They can refine every field, generate a portrait visual, choose and instantly preview a reliable camera move, select a narration voice, and render a final five-second vertical MP4.

## DeepSpace integrations

1. **OpenAI `chat-completion`** — creates the structured, editable brief, headline, narration, and image direction.
2. **FAL `run-model` / `get-result`** — generates and polls for the Seedream portrait visual.
3. **ElevenLabs `generate-speech`** — turns the edited narration into audio using a user-selected voice.
4. **Shotstack `render` / `get-render`** — applies the chosen camera move and combines the still and narration into the final MP4.

The app also uses DeepSpace records, confirmed mutations, background jobs, authentication, realtime job progress, and app-scoped file storage. Provider outputs are copied into durable storage rather than depending on expiring URLs.

## Main tradeoff

I originally planned to generate a five-second animation with FAL image-to-video. Even after provider fixes, that path was slow, unexpectedly expensive on one model, and inconsistent with the creator's edited direction. I replaced it with four selectable camera moves that preview instantly in the browser and map directly to Shotstack effects.

This keeps the important path fast, affordable, and demonstrable while still producing a genuine final MP4. Generative motion can return later as an optional experiment without blocking the reliable core flow.

## Work completed with Codex

Codex helped inspect the DeepSpace integration schemas, implement the job-backed provider pipeline, add durable asset handling, diagnose upstream failures, create unit tests, and refocus the interface after the scope decision.

I directed when paid smoke tests were allowed, manually tested the generated brief, FAL still, voice selection, narration, persistence, and deployed behavior, and verified provider usage/refunds during failure investigation.

## Final verification checklist

- [ ] Start from a freshly saved creator prompt.
- [ ] Confirm OpenAI produces an editable brief.
- [ ] Edit and save at least one generated field.
- [ ] Confirm FAL generates and durably stores the visual.
- [ ] Choose a different ElevenLabs voice and generate narration.
- [ ] Select each motion preset and verify its instant preview.
- [ ] Render and preview the final Shotstack MP4.
- [ ] Reload and verify that the project and media persist.
- [ ] Mark the creative package ready.
- [ ] Copy and download the Markdown package.
- [ ] Download the visual and narration assets.
- [ ] Check the deployed app on desktop and mobile widths.
- [ ] Confirm `/` redirects to `/home`.
