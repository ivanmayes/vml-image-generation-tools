# Gemini Image Generation

The `GeminiImageService` handles all image generation and editing through Google's Gemini API. It uses the `gemini-3-pro-image-preview` model (internally called "Nano Banana Pro") to create images from text prompts and edit existing images.

**Source:** `apps/api/src/image-generation/orchestration/gemini-image.service.ts`

## SDK and Model

The service uses the `@google/genai` SDK (not `@google/generative-ai`, which is for text-only generation). This distinction is important — the image generation capabilities require the newer SDK.

```typescript
import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

**Model:** `gemini-3-pro-image-preview`

**Critical configuration:** The model requires `responseModalities: ['TEXT', 'IMAGE']` in the config. Without this, it returns text only.

## Image Generation

### Single Image

`generateImage(prompt, options)` creates one image:

1. **Pre-fetch reference images** — If `referenceImageUrls` are provided, downloads them as base64
2. **Build contents** — Constructs the API request contents array:
   - Reference images as `inlineData` parts (if any)
   - Instructions to match reference images' visual style
   - The main generation prompt as text
3. **Call API** — `client.models.generateContent()` with the image model
4. **Extract result** — Finds the `inlineData` part in the response candidates and returns the image buffer

```typescript
const result = await this.client.models.generateContent({
  model: "gemini-3-pro-image-preview",
  contents: contents,
  config: {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: "16:9" }, // optional
  },
});
```

### Batch Generation

`generateImages(prompt, count, options)` generates multiple images in parallel:

1. **Pre-fetches** reference images once (to avoid re-downloading per image)
2. Launches N parallel `generateImage()` calls
3. Uses `Promise.allSettled()` to handle partial failures
4. Returns all successful results (fails if any image fails)

Parallel generation significantly reduces total time. Generating 3 images takes roughly the same wall-clock time as generating 1.

## Image Editing

### Single Edit

`editImage(sourceImageBase64, editInstruction, options)` edits an existing image:

1. Sends the source image as `inlineData` with `mimeType: 'image/jpeg'`
2. Sends the edit instruction as text
3. Uses the same model and `responseModalities: ['TEXT', 'IMAGE']` config
4. Returns the edited image

### Batch Edit

`editImages(sourceImageBase64, editInstruction, count, options)` edits the same source image multiple times in parallel. Each edit starts from the SAME source image with the SAME instruction to produce variations while preserving the source foundation.

## Image Options

```typescript
interface GeminiImageOptions {
  aspectRatio?: string; // e.g., "16:9", "1:1", "4:3"
  quality?: string; // "1K", "2K", "4K"
  referenceImageUrls?: string[]; // URLs of reference images to match
}
```

## Reference Images

When reference images are provided, the service:

1. Downloads each URL and converts to base64
2. Includes them in the API request as `inlineData` parts
3. Adds an instruction: _"The above image(s) are reference images. You MUST closely match their visual style, color palette, composition, product appearance, and overall aesthetic."_
4. For batch generation, pre-fetches reference images once to avoid redundant downloads

Reference images are useful for brand consistency — upload a photo of the actual product, and the model tries to match its appearance.

## Output Format

Generated images are returned as JPEG by default:

```typescript
interface GeneratedImageResult {
  imageData: Buffer; // Raw image bytes
  mimeType: string; // Usually 'image/jpeg'
  width?: number;
  height?: number;
}
```

Always use `.jpg` extension when saving these images.

## Mock Mode

For testing without calling the real Gemini API, set `IMAGE_GEN_MOCK=true` in your environment:

```bash
IMAGE_GEN_MOCK=true
```

In mock mode:

- API calls are replaced with a 100ms delay
- Returns a 1x1 pixel red PNG
- All batch operations work normally (just fast)
- Useful for testing the orchestration pipeline without consuming API credits

## Error Handling

The service logs extensively and handles common failure modes:

- **No API key** — Logs a warning at startup; all calls will fail
- **No image in response** — Throws with debug info about what the API did return
- **Network errors** — Propagated to the caller (the orchestration service handles retries)
- **Edit failures** — The orchestration service catches these and falls back to regeneration

## Configuration

| Environment Variable | Required          | Description                         |
| -------------------- | ----------------- | ----------------------------------- |
| `GEMINI_API_KEY`     | Yes (unless mock) | Google Gemini API key               |
| `IMAGE_GEN_MOCK`     | No                | Set to `"true"` to enable mock mode |

## Known Limitations

1. **Image quality plateau at ~70–75%** — The model struggles with precise product shapes, label text, and proportions. This is a model limitation, not a prompt issue.

2. **Edit mode inconsistency** — Sometimes the model significantly changes aspects of the image that should be preserved. The system falls back to regeneration when edits fail.

3. **Rate limits** — Gemini has per-minute and per-day rate limits. The orchestration service's retry logic handles transient 429 errors with exponential backoff.

4. **Image size for edits** — Source images over 2MB may be compressed by Gemini, potentially reducing quality. The service logs a warning for large source images.
