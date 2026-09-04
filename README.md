# MotionBrief

MotionBrief turns one rough creator prompt into a finished multimedia concept package: an editable creative brief, a portrait campaign visual, a headline, and a selectable-voice narration.

## DeepSpace integrations

- **OpenAI / chat-completion** shapes the prompt into editable strategy, copy, and generation prompts.
- **FAL / run-model** generates the portrait campaign visual with Seedream v5 Lite.
- **ElevenLabs / generate-speech** records the short narration in the creator's selected voice.

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

The original prototype also explored FAL image-to-video and Shotstack MP4 composition. Both endpoints repeatedly returned upstream gateway failures during development. The submission scope deliberately favors a complete, reliable three-integration concept workflow. The dormant video implementation remains preserved on the `main` branch for later provider recovery.

See [docs/submission-notes.md](docs/submission-notes.md) for the evaluation handoff.
