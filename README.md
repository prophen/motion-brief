# MotionBrief

MotionBrief turns one rough creator prompt into a finished five-second campaign video: an editable creative brief, a portrait campaign visual, a selectable camera move, narration, and a final vertical MP4.

## DeepSpace integrations

- **OpenAI / chat-completion** shapes the prompt into editable strategy, copy, and generation prompts.
- **FAL / run-model** generates the portrait campaign visual with Seedream v5 Lite.
- **ElevenLabs / generate-speech** records the short narration in the creator's selected voice.
- **Shotstack / render** applies the selected camera move and combines the visual and narration into a 9:16 MP4.

Generated assets are copied into durable, app-scoped DeepSpace storage and exported as shareable links. Anyone with a media link can access that generated asset; the editable project record remains restricted to its owner. Project data is synchronized through the DeepSpace records layer, and longer provider operations run as background jobs.

## Local development

```sh
npm install
npx deepspace dev start
```

Run the verification suite with:

```sh
npm run validate
npm run lint
```

Paid provider calls require explicit confirmation in the UI. Tests and ordinary page loads do not invoke integrations.

## Product tradeoff

The original prototype used generative image-to-video. Live tests were slow, expensive, and inconsistent with the edited motion direction. The finished scope uses deterministic camera moves—push in, pull back, and horizontal pans—so the browser preview is immediate and the Shotstack output is predictable. Generative motion remains intentionally disabled outside the core path.

See [docs/submission-notes.md](docs/submission-notes.md) for the evaluation handoff.
