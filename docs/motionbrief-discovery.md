# MotionBrief integration discovery

_Discovery date: 2026-09-01. Source: bundled DeepSpace 0.30.0 skill, repository scaffold, official DeepSpace External APIs/File Uploads guides, and free `npx deepspace integrations list|info` metadata. No integration was invoked and no generation job was created._

## Repository fit

This is an otherwise unmodified DeepSpace 0.30.0 React/Cloudflare Workers scaffold. `src/jobs.ts` already provides the intended durable background-job seam for long AI/render pipelines (progress, cancellation, retries, and continuation), but its handler is a no-op. `src/integrations.ts` currently makes unlisted integrations developer-billed by default. There is no MotionBrief schema, orchestration, or integration code yet.

## Available endpoints

### OpenAI — brief and copy

`openai/chat-completion` is the available text endpoint. Billing is `per_token`, base **$0.000039/token**, with input-dependent variation.

Request: `{ messages, model?, max_tokens?, temperature? }`. `messages` is required and contains `{ role: "user" | "system" | "assistant", content: string }[]`. Defaults: `model: "gpt-5.6-terra"`, `max_tokens: 1024`; `max_tokens` is 1–16,384 and `temperature` is 0–2. The metadata does not enumerate model IDs; the only confirmed model option is the default/example `gpt-5.6-terra`. No curated output schema is published by `info`, so the exact response nesting remains unconfirmed without an approved paid test.

### FAL — still image and image-to-video

- `fal/list-models`: free (`$0/request`). Request `{ q?, category?, status?: "active" | "deprecated", limit?: 1..100, cursor? }`, default `limit: 20`. Returns `{ models: [{ endpoint_id, display_name, category, description, status, model_url, thumbnail_url }], next_cursor?, has_more? }`.
- `fal/get-model`: free (`$0/request`). Request `{ model_id: string }`. Returns `{ endpoint_id, metadata, openapi, pricing: { unit_price, unit } | null, runnable }`. This is the authoritative source for each model's exact input schema and price.
- `fal/run-model`: `per_actual_cost`. Request `{ model_id: string, input?: object, maxCostUsd?: number }`; `input` defaults to `{}`, `maxCostUsd` defaults to **$2** (range $0.001–$50). Compute-priced runs reserve at least/default $2 and settle to actual cost. Returns `{ jobId, status }`.
- `fal/get-result`: free polling (`$0/request`). Request `{ request_id: string }`. Returns `{ status?, queuePosition?, output?, costUsd?, error? }`; completion settles the run to actual cost.

Exact still-image and image-to-video model IDs/options are **not exposed by `integrations info` alone**. The user subsequently approved free `fal/list-models` and `fal/get-model` invocations; their shortlist and exact schemas are recorded below. No paid FAL model was run.

### ElevenLabs — narration

`elevenlabs/generate-speech` bills `per_character`, base **$0.000065/character**, with input-dependent variation. Request: required `text` (1–5,000 chars), plus `voice_id`, `model_id`, `output_format`, and optional `voice_settings`. Default voice is `JBFqnCBsd6RMkjVDRZzb`; default model is `eleven_flash_v2_5`; default format is `mp3_44100_128`. It returns `{ audioUrl, voice_id, model_id, output_format }`, where `audioUrl` is a **data URL**, not a hosted asset URL.

Model options: `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_flash_v2`, `eleven_turbo_v2_5`, `eleven_turbo_v2`.

Output formats: MP3 at `22050/32`, or `44100/64|96|128|192`; PCM at `16000|22050|24000|44100`; Opus at `48000/32|64|96|128|192`. Voice settings are `stability` 0–1 (default .5), `similarity_boost` 0–1 (default .75), `style` 0–1 (default 0), and `use_speaker_boost` (default true).

`elevenlabs/generate-speech-with-timestamps` has the same request, models, formats, and price, plus character-level `alignment` and `normalized_alignment`. This is optional for a single headline, but useful if later animation is synchronized to narration.

`elevenlabs/list-voices` costs **$0.0013/request** (not free) and returns voice IDs/names plus category, gender, age, accent, use case, preview URL, and lifecycle fields. Do not call it during free discovery.

### Shotstack — final MP4

`shotstack/render` is asynchronous and `per_actual_cost`, billed per rendered second. Request requires `{ timeline: object, output: object, duration: number > 0 }`, with optional `merge: [{ find, replace }]` and URI `callback`. Returns `{ id, status, message }`. The DeepSpace catalog intentionally leaves nested `timeline` and `output` open-ended, so it does **not** confirm the precise Shotstack clip, audio, title/HTML, 9:16 resolution, codec, or MP4 fields. These must be validated against Shotstack's accepted edit payload before implementation; do not infer them from the empty example.

`shotstack/get-render` is free polling (`$0/request`). Request `{ id }`. Returns `{ id, status, url, error, duration, costUsd, poster, thumbnail }`. A terminal response settles actual rendered length, and its result URL is explicitly **temporary**.

## Smallest technical risks

1. **ElevenLabs → Shotstack is not directly URL-compatible.** ElevenLabs supplies a `data:` URL. A remote renderer generally needs an HTTP(S) URL it can fetch. Decode and persist the audio first, then pass a fetchable URL; confirm Shotstack can fetch that exact URL before any real render.
2. **FAL output lifetime and shape are model-specific.** `fal/get-result.output` is unconstrained metadata. Generated image/video URLs may be signed or temporary, and field names vary. Copy completed assets promptly to durable storage rather than storing upstream URLs as canonical assets.
3. **DeepSpace file scope is a privacy tradeoff.** App-scoped R2 objects have public, directly fetchable URLs suitable for Shotstack; self-scoped objects require auth and will likely be inaccessible to Shotstack. Public app scope must not contain private source material. The free-plan app file quota is 128 MiB; individual files can be up to 1 GiB, with multipart upload above 20 MiB.
4. **Do not construct DeepSpace asset URLs manually.** Persist the returned file key/path and generated serving URL. Physical paths include the app resource ID and `?scope=app`.
5. **Shotstack output must be copied before expiry.** Treat `get-render.url`, poster, and thumbnail as delivery URLs, not durable records; ingest the final MP4 into app storage before marking the job complete.
6. **Asynchronous IDs differ.** `fal/run-model` returns `jobId`, while polling requires `request_id`; confirm they are the same value in an approved test or map the actual envelope explicitly. Shotstack uses `render.id` consistently for polling.
7. **Duration/cost alignment.** Narration length, FAL animation duration, Shotstack timeline duration, and headline timing must be reconciled before render submission. Otherwise clips may truncate, freeze, or add silence and billing may exceed the intended short duration.
8. **Owner-paid abuse and retries.** All four integrations default to developer billing in this scaffold. Authentication alone is not a spend cap. Add per-user limits, idempotent state transitions, disabled duplicate submits, bounded polling, and never automatically retry a paid creation call when the upstream outcome is unknown.
9. **No model list guarantees yet.** OpenAI accepts a free-form model string with one confirmed default; FAL requires free endpoint invocations for its live catalog. Model availability should be treated as runtime-configured, not hard-coded from memory.

## Recommended approval-gated next discovery

Free FAL discovery was approved and completed after the initial report. No paid model was run. The remaining pre-code task is to consult/validate the Shotstack edit JSON contract. The first paid smoke test should use one minimal asset chain with an explicit FAL `maxCostUsd`, very short narration, and the shortest practical Shotstack duration.

## Approved FAL model discovery

The active catalog is large and paginated. The following candidates were selected for a five-day vertical-video MVP based on runnable status, 9:16 support, short duration, and cost clarity.

### Still-image shortlist

**Recommended: `bytedance/seedream/v5/lite/text-to-image`** — active, commercial, runnable; **$0.035/image**.

- Required: `prompt: string`.
- Optional: `image_size` (named presets including `portrait_16_9`, or `{ width, height }`; default `auto_2K`), `num_images` 1–6 (default 1), `max_images` 1–6 (default 1), `sync_mode` (default false), `enable_safety_checker` (default true), `return_byteplus_urls` (default false).
- Output: `{ images: [{ url, content_type?, file_name?, file_size?, width?, height? }], seed }`.
- Important URL detail: `return_byteplus_urls: true` produces trusted Seedance URLs that expire in **24 hours**. Keep it false unless that handoff is deliberately used, and persist generated media promptly either way.

**Alternative: `fal-ai/recraft/v4.1/utility/text-to-image`** — active, commercial, runnable; **$0.035/image**. It is explicitly positioned for high-volume creative workflows and exposes palette control.

- Required: `prompt` (1–10,000 chars).
- Optional: `image_size` (`portrait_16_9` is available, or `{ width, height }`; default `square_hd`), `colors: [{ r, g, b }]`, `background_color: { r, g, b } | null`, `enable_safety_checker` (default true).
- Output: `{ images: [{ url, content_type?, file_name?, file_size? }] }`.

**Typography-oriented alternative: `ideogram/v4/instant`** — active, commercial, runnable; **$0.00007/compute-second** (actual total is runtime-dependent).

- Required: `prompt`.
- Optional: `image_size` including `portrait_16_9` or custom dimensions, `num_images` 1–4, `seed`, `expansion_model: "None" | "Medium"`, `sync_mode`, safety checker, and `output_format: "jpeg" | "png"`.
- Output includes `images`, `timings`, `seed`, safety flags, and the expanded/used prompt.

`google/nano-banana-2-lite` was also inspected and has direct `9:16`, 1–4 images, PNG/JPEG/WebP output, and sub-two-second positioning. However, DeepSpace reports `runnable: false` and pricing as `1 units`, so it is not a viable integration choice today.

### Image-to-video shortlist

**Initial recommendation (superseded after live failures): `luma/agent/ray/v3.2/image-to-video`** — active, commercial, runnable; **$0.50 per 5 seconds**.

- Required: `prompt` (1–6,000 chars).
- For the MVP provide `image_url`; optional `end_image_url` enables first/last-frame interpolation.
- `aspect_ratio`: `3:4 | 4:3 | 1:1 | 9:16 | 16:9 | 21:9` (default `16:9`).
- `resolution`: `540p | 720p | 1080p` (default `540p`; higher costs more).
- `duration`: `5s | 10s` (default `5s`). A single `image_url` supports 5 seconds; 10 seconds requires multi-keyframe mode.
- Optional `loop`; HDR/EXR and multi-keyframes exist but add constraints and are unnecessary for the MVP.
- Output: `{ video: { url, content_type?, file_name?, file_size? }, exr_file? }`.

**Alternative for duration flexibility: `bytedance/seedance-2.0/mini/image-to-video`** — active, commercial, runnable; **$0.007 per 1,000 tokens**. Total dollar cost cannot be predicted from duration alone using the published metadata.

- Required: `prompt`, `image_url` (JPEG/PNG/WebP, maximum 30 MB).
- Optional `end_image_url` (same formats/limit).
- `aspect_ratio`: `auto | 21:9 | 16:9 | 4:3 | 1:1 | 3:4 | 9:16` (default `auto`).
- `duration`: `auto` or 4–15 seconds in one-second increments.
- `resolution`: `480p | 720p` (default `720p`).
- `generate_audio` defaults true and does not change the stated video-generation price. For MotionBrief it should likely be false to avoid competing with the ElevenLabs narration.
- Output: `{ video: { url, content_type?, file_name?, file_size? }, seed }`.

### Proposed model lock for the first paid smoke test

Use `bytedance/seedream/v5/lite/text-to-image` at a portrait size, then `luma/agent/ray/v3.2/image-to-video` at `9:16`, `540p`, `5s`. This gives exact per-unit pricing, the fewest timing branches, and cleanly leaves narration to ElevenLabs. Recraft Utility is the drop-in still alternative if art-direction palette control matters more than Seedream's general image fidelity.

## Approved Shotstack contract discovery

Current official sources: [Shotstack v1 API reference](https://shotstack.io/docs/api/), [Edit JSON conventions](https://shotstack.io/docs/guide/agents/conventions/), and [first-render guide](https://shotstack.io/learn/render-your-first-video-shotstack-api/). No render was submitted.

### Confirmed asset handoff contract

Shotstack render workers fetch all media from the public internet. Every media `src` must be a **publicly accessible HTTPS URL**. Local paths and `data:` URIs are explicitly unsupported, and signed URLs must not expire during the render. This confirms that the ElevenLabs `audioUrl` data URI must be decoded and uploaded before rendering. It also rules out passing short-lived FAL URLs directly as the durable production path.

For MotionBrief, upload the FAL MP4 and decoded ElevenLabs MP3 to DeepSpace app-scoped storage, then pass the resulting public HTTPS URLs to Shotstack. Self-scoped/authenticated URLs are unsuitable unless credentials are embedded in a form Shotstack can use; app scope is the simpler MVP contract but makes the objects world-readable.

### Exact minimal edit shape

Shotstack timelines contain ordered tracks; earlier tracks render above later tracks. Therefore the headline track must come first, followed by narration, then the video background. Each clip requires `asset`, `start`, and `length`. Video and audio clips accept public `src` URLs. The video clip should set `volume: 0` so any FAL-native audio cannot compete with ElevenLabs.

Use `type: "text"` for the one headline. Shotstack's older `title` and `html` asset types are deprecated. `TextAsset` requires `type` and `text`, and supports `width`, `height`, font styling, background, alignment, stroke, and an optional typewriter entrance.

Proposed five-second DeepSpace `shotstack/render` request (placeholders are runtime values):

```json
{
  "timeline": {
    "background": "#000000",
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "text",
              "text": "{{HEADLINE}}",
              "width": 900,
              "height": 300,
              "font": {
                "family": "Open Sans",
                "color": "#ffffff",
                "size": 72,
                "weight": 700,
                "lineHeight": 1
              },
              "alignment": {
                "horizontal": "center",
                "vertical": "center"
              },
              "stroke": {
                "width": 2,
                "color": "#000000"
              }
            },
            "start": 0,
            "length": 5,
            "position": "center"
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "src": "{{PUBLIC_NARRATION_HTTPS_URL}}",
              "volume": 1
            },
            "start": 0,
            "length": 5
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "video",
              "src": "{{PUBLIC_VIDEO_HTTPS_URL}}",
              "volume": 0
            },
            "start": 0,
            "length": 5,
            "fit": "crop"
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "hd",
    "aspectRatio": "9:16",
    "fps": 25,
    "quality": "medium",
    "mute": false
  },
  "duration": 5
}
```

`duration` is required by DeepSpace's wrapper for billing/reservation; `timeline` and `output` are passed as the Shotstack edit. Shotstack supports `mp4`, the `9:16` aspect ratio, and the `hd` resolution preset. Using `fit: "crop"` preserves aspect ratio while filling the vertical viewport; it may crop edges, so keep important visual content inside a portrait-safe area. Do not include both custom `output.size` and `resolution`/`aspectRatio`; Shotstack requires choosing one method.

### Remaining validation before a paid render

The contract itself is no longer ambiguous. The first paid smoke test should still verify three runtime facts with one five-second render: that the exact DeepSpace app-file URLs are externally fetchable by Shotstack, that the chosen font is available without declaring a custom font URL, and that the narration is at most five seconds. If narration is shorter, silence is acceptable; if longer, revise the copy or choose a longer video before rendering rather than truncating it accidentally.

## Motion provider fallback discovery (2026-09-02)

Two submissions to `luma/agent/ray/v3.2/image-to-video` returned `502 upstream_provider_error`. The stored DeepSpace image URL was independently verified as a public HTTPS JPEG (`200`), so the failure is upstream of MotionBrief's asset handoff. The live FAL catalog still marks Luma active, but it should not be retried for this MVP until its provider recovers.

**Recommended fallback: `wan/v2.6/image-to-video/flash`.** It is active, commercial, and runnable, billed at **$0.05 per second**. Required input is `{ prompt, image_url }`. For MotionBrief use `{ duration: "5", resolution: "720p", generate_audio: false, multi_shots: false, enable_safety_checker: true }`. The prompt is limited to 1,500 characters. Output is `{ video: { url, content_type?, file_name?, file_size?, width?, height?, fps?, duration?, num_frames? }, seed, actual_prompt? }`. A five-second run has a published provider ceiling of $0.25 before any documented silent-video discount; retain a `maxCostUsd: 0.25` gate. Based on the observed DeepSpace reservation multiplier for Luma ($0.50 provider price → $0.65 reservation), show an estimated account reservation of $0.325 and let the ledger remain authoritative.

Other live fallbacks inspected without generation: `bytedance/seedance-2.0/mini/image-to-video` remains runnable at $0.007 per 1,000 tokens but lacks a predictable duration-only total; `fal-ai/ltx-2.3/image-to-video/fast` is runnable at $0.06 per second but has a six-second minimum and 1080p minimum, making it a poorer fit for the five-second MVP.
