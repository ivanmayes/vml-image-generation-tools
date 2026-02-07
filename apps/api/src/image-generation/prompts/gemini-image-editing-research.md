# Gemini Image Editing — Research & Architecture Guide

Research document for implementing "edit mode" in the iterative image generator. Edit mode passes the previous best image back to Gemini with targeted instructions, preserving what works and fixing what doesn't.

---

## Section 1: Two Approaches to Image Editing with Gemini

### A. Chat-based editing via `generateContent` (Primary — recommended for our use case)

Uses `ai.models.generateContent()` — the same API we already call in `gemini-image.service.ts`. The source image is sent as `inlineData` (base64) alongside a text edit instruction in a single `contents` array.

**Key details:**

- Model: `gemini-2.5-flash-image` or our current `gemini-3-pro-image-preview`
- Config requires `responseModalities: ['TEXT', 'IMAGE']`
- Response returns the edited image as `inlineData.data` (base64) in `candidates[0].content.parts`
- Supports multi-turn chat via `ai.chats.create()` for iterative refinement

**Canonical TypeScript example (from official docs):**

```typescript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';

const ai = new GoogleGenAI({ apiKey: 'GEMINI_API_KEY' });

// Load the source image as base64
const imageBuffer = fs.readFileSync('./source-image.jpg');
const base64Image = imageBuffer.toString('base64');

const response = await ai.models.generateContent({
	model: 'gemini-2.5-flash-image',
	contents: [
		{
			inlineData: {
				mimeType: 'image/jpeg',
				data: base64Image,
			},
		},
		{
			text: 'Change the background to a warm sunset gradient. Keep everything else exactly the same.',
		},
	],
	config: {
		responseModalities: ['TEXT', 'IMAGE'],
	},
});

// Extract the edited image from the response
const parts = response.candidates?.[0]?.content?.parts ?? [];
for (const part of parts) {
	if (part.inlineData) {
		const editedImageBuffer = Buffer.from(part.inlineData.data, 'base64');
		fs.writeFileSync('edited-image.jpg', editedImageBuffer);
		console.log(`Saved edited image (${editedImageBuffer.length} bytes)`);
	}
	if (part.text) {
		console.log('Model commentary:', part.text);
	}
}
```

### B. Dedicated `editImage` API (Advanced / Imagen-based)

A separate endpoint for structured editing operations. Uses Imagen models, not Gemini.

**Key details:**

- Uses `ai.models.editImage()` — a distinct SDK method
- Supports specific edit modes: `BGSWAP`, `INPAINT_REMOVAL`, `INPAINT_INSERTION`, `OUTPAINT`, `STYLE`, `CONTROLLED_EDITING`, `PRODUCT_IMAGE`
- Supports binary masks for region-specific edits
- Has `guidanceScale`, `negativePrompt`, `seed` parameters
- Uses Imagen models (`imagen-3.0-capability-001`), NOT Gemini models

**SDK method signature:**

```typescript
const response = await ai.models.editImage({
	model: 'imagen-3.0-capability-001',
	prompt: 'Remove the person from the background',
	referenceImages: [
		{
			referenceImage: {
				imageBytes: sourceImageBase64,
			},
			referenceType: 'STYLE', // or 'SUBJECT', 'MASK'
		},
	],
	config: {
		editMode: 'INPAINT_REMOVAL', // or BGSWAP, OUTPAINT, etc.
		numberOfImages: 1,
		guidanceScale: 60,
		negativePrompt: 'blurry, low quality',
		seed: 12345,
	},
});
```

### Recommendation: Approach A (chat-based)

Approach A is the right fit for our edit mode because:

1. **We already use `generateContent`** in `gemini-image.service.ts` — minimal code changes
2. **Works with our existing Gemini model** (`gemini-3-pro-image-preview`) — no additional model access needed
3. **Supports the conversational "change this" pattern** naturally — maps directly to TOP_ISSUE feedback
4. **No additional SDK methods needed** — same `@google/genai` client, same response parsing
5. **Multi-turn chat** enables progressive refinement without re-uploading

---

## Section 2: SDK Usage — `@google/genai`

### Current state in our codebase

Our `gemini-image.service.ts` already uses `@google/genai`:

```typescript
// gemini-image.service.ts (existing code)
import { GoogleGenAI } from '@google/genai';

this.client = new GoogleGenAI({ apiKey: apiKey ?? '' });

const result = await this.client.models.generateContent({
	model: this.imageModel, // 'gemini-3-pro-image-preview'
	contents: contents.length === 1 ? prompt : contents,
	config: {
		responseModalities: ['TEXT', 'IMAGE'],
	},
});
```

### What changes for editing

The only difference is including the source image in `contents`:

```typescript
// NEW: editImage method (proposed addition to gemini-image.service.ts)
public async editImage(
  sourceImageBase64: string,
  editInstruction: string,
  options: GeminiImageOptions = {},
): Promise<GeneratedImageResult> {
  const contents: any[] = [
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: sourceImageBase64,
      },
    },
    {
      text: editInstruction,
    },
  ];

  const result = await this.client.models.generateContent({
    model: this.imageModel,
    contents,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(options.aspectRatio && {
        imageConfig: { aspectRatio: options.aspectRatio },
      }),
    },
  });

  // Response parsing is identical to generateImage()
  const imagePart = result.candidates?.[0]?.content?.parts?.find(
    (part: any) => part.inlineData,
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error('No image data in edit response');
  }

  const imageData = Buffer.from(imagePart.inlineData.data as string, 'base64');

  return {
    imageData,
    mimeType: imagePart.inlineData.mimeType || 'image/jpeg',
  };
}
```

### Key observations

- **Nearly identical to `generateImage()`** — the only difference is the first content part being the source image
- **Same response parsing** — iterate `candidates[0].content.parts`, look for `part.inlineData`
- **Same model** — no model change required
- **Same SDK** — `@google/genai` (NOT `@google/generative-ai`, which is the older text-only SDK)

> **Important:** Our `google.client.ts` uses `@google/generative-ai` for text/chat operations. Image generation/editing uses the separate `@google/genai` SDK in `gemini-image.service.ts`. These are different packages.

---

## Section 3: Edit Prompt Best Practices

### Effective edit patterns

**Targeted element changes:**

```
"Change only the background color from white to a warm amber gradient. Keep the product, lighting, and all other elements exactly the same."
```

**Color and lighting adjustments:**

```
"Make the lighting warmer and more diffused, as if shot during golden hour with soft natural light. Maintain all objects and composition."
```

**Object removal:**

```
"Remove the shadow underneath the bottle. Keep the bottle, label, and background exactly as they are."
```

**Object addition:**

```
"Add a few ice cubes scattered around the base of the bottle. Match the existing lighting and surface material."
```

**Style transfer:**

```
"Apply a premium product photography aesthetic — increase contrast slightly, add a subtle vignette, and make colors more saturated. Do not change the product or its position."
```

**Detail refinement (label/text):**

```
"Make the text on the label sharper and more legible. The label should read clearly without distortion. Keep all other aspects identical."
```

**Photographic language yields better results:**

- Use terms like "85mm portrait lens", "soft diffused lighting", "shallow depth of field"
- Describe lighting setups: "three-point studio lighting with key light from upper-left"
- Reference photographic styles: "high-key product photography", "dark and moody still life"

### Critical prompt structure for edits

1. **Always specify what to KEEP:** "Keep the rest of the image exactly the same"
2. **Be specific about the target:** "Change only the blue sofa" not "change the sofa"
3. **Descriptive narratives > keyword lists:** Full sentences describing the desired change outperform comma-separated keywords
4. **Include context for why:** "Make the logo more prominent so it's clearly readable at small sizes"
5. **One change per instruction:** Compound edits risk unintended modifications

### What doesn't work well

- **Complex typography corrections** — AI fundamental limitation; text rendering remains unreliable
- **Precise geometric corrections** — bottle shapes, product contours, exact proportions
- **Many sequential edits on same image** — features drift after approximately 3-5 edits
- **Aspect ratio changes during editing** — model struggles to add/remove canvas space cleanly
- **Multiple simultaneous major changes** — asking for 3+ changes in one edit increases unintended modifications
- **Brand-specific accuracy** — model does not know exact brand logo layouts, font faces, or trade dress

### Product photography specific tips (relevant to our use case)

- **Label/logo edits:** "Ensure the Coca-Cola logo is fully visible, correctly oriented, and undistorted. The script lettering should flow left-to-right without any warping."
- **Bottle shape:** "Maintain the exact contour shape of the glass Coca-Cola bottle — the distinctive hobbleskirt silhouette with its fluted glass ridges."
- **Lighting consistency:** When editing elements, specify the lighting direction: "The key light comes from the upper-left at approximately 45 degrees."
- **Surface materials:** "The bottle is clear glass with visible condensation droplets. Maintain the glass transparency and refraction."

---

## Section 4: Multi-Turn Editing

### Chat-based iterative refinement

The `@google/genai` SDK supports multi-turn chat that maintains context across messages:

```typescript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';

const ai = new GoogleGenAI({ apiKey: 'GEMINI_API_KEY' });

// Create a chat session with image capabilities
const chat = ai.chats.create({
	model: 'gemini-2.5-flash-image',
	config: {
		responseModalities: ['TEXT', 'IMAGE'],
	},
});

// Turn 1: Initial edit
const response1 = await chat.sendMessage([
	{
		inlineData: {
			mimeType: 'image/jpeg',
			data: fs.readFileSync('./source.jpg').toString('base64'),
		},
	},
	{
		text: 'Make the background a soft gradient from navy blue to black. Keep the product exactly as-is.',
	},
]);

// Save intermediate result
const editedPart1 = response1.candidates?.[0]?.content?.parts?.find(
	(p: any) => p.inlineData,
);
if (editedPart1?.inlineData?.data) {
	fs.writeFileSync(
		'edit-round1.jpg',
		Buffer.from(editedPart1.inlineData.data, 'base64'),
	);
}

// Turn 2: Progressive refinement (model remembers Turn 1)
const response2 = await chat.sendMessage([
	{
		text: 'Now add a subtle reflection of the bottle on the surface below it. Keep the gradient background and product unchanged.',
	},
]);

// Turn 3: Final touch
const response3 = await chat.sendMessage([
	{
		text: 'Increase the overall contrast slightly and add a faint rim light on the right edge of the bottle.',
	},
]);
```

### Multi-turn characteristics

- **Context is maintained** — the model remembers previous edits across turns
- **Ideal for progressive refinement** — fix one issue per turn for best results
- **No need to re-upload** — the model tracks the current image state internally
- **Lightweight messages** — subsequent turns only need text instructions, not image re-uploads

### Caveats

- **Character/feature drift** after many turns — if drift occurs, restart with a fresh conversation and a detailed description of the desired final state
- **Context window limits** — very long conversations may degrade output quality
- **Non-deterministic** — same instruction in same chat may produce slightly different results on retry
- **Chat history is ephemeral** — stored in memory per session, not persisted by the SDK

### When to use multi-turn vs. single-turn edits

| Scenario                                       | Approach                                            |
| ---------------------------------------------- | --------------------------------------------------- |
| Single targeted fix from judge feedback        | Single-turn edit (simpler, more predictable)        |
| Multiple related refinements in sequence       | Multi-turn chat (maintains context)                 |
| Image quality has degraded from prior edits    | Fresh single-turn edit from the original best image |
| Debugging/experimenting with edit instructions | Multi-turn chat (faster iteration)                  |

For our pipeline, **single-turn edits per iteration** are likely safer — each iteration gets the best image from the previous round and applies one TOP_ISSUE fix. This avoids context drift and gives judges a clean evaluation target.

---

## Section 5: Generation vs. Editing — When to Use Each

| Dimension              | Full Regeneration (current)                 | Edit Mode (proposed)                              |
| ---------------------- | ------------------------------------------- | ------------------------------------------------- |
| **Input**              | Text prompt only                            | Previous image + edit instruction                 |
| **Best for**           | Initial creation, major composition changes | Targeted fixes, preserving what works             |
| **Speed**              | Full generation time                        | Typically faster (less to change)                 |
| **Consistency**        | Each output is independent                  | Preserves style, lighting, composition            |
| **Risk**               | May lose good elements between iterations   | May not fix fundamental issues                    |
| **Judge feedback fit** | Needs full prompt rewrite                   | Maps directly to TOP_ISSUE fixes                  |
| **Plateau breaking**   | New prompt = fresh attempt at composition   | Surgical fix = may unstick scores stuck at 70-75% |
| **Token cost**         | Text prompt tokens only                     | Image tokens (base64) + text tokens               |
| **Quality ceiling**    | Limited by prompt description accuracy      | Limited by source image quality + edit precision  |
| **Failure mode**       | Completely different image each time        | Subtle degradation over multiple edits            |

### When regeneration wins

- Score < 50% — the image is too far off; editing a bad foundation wastes iterations
- Composition is fundamentally wrong — wrong camera angle, missing key elements, wrong scene
- Multiple critical issues — easier to start fresh than fix everything via edits
- After edit degradation — when artifacts accumulate, regeneration resets quality

### When edit mode wins

- Score 50-75% — the foundations are good, targeted fixes are needed
- Score > 75% but plateauing — surgical fixes for specific TOP_ISSUE items
- TOP_ISSUE severity is "moderate" or "minor" — small fixes, not fundamental rebuilds
- Judges report "what worked" elements — editing preserves those elements
- Lighting/color issues — edits handle these well without disrupting composition

---

## Section 6: Architecture Mapping — How Edit Mode Fits Our System

### Current flow (regeneration only)

```
Judge feedback → Prompt Optimizer → Full new prompt → generateImage(prompt) → New image
                 prompt-optimizer.service.ts          gemini-image.service.ts
```

### Proposed edit mode flow

```
Judge feedback → Edit Instruction Builder → Edit instruction → editImage(prevImage, instruction) → Edited image
                 prompt-optimizer.service.ts (new mode)        gemini-image.service.ts (new method)
```

### Key integration points

**`gemini-image.service.ts` — Add `editImage()` method**

- New method alongside existing `generateImage()`
- Accepts `sourceImageBase64: string` and `editInstruction: string`
- Uses same `this.client.models.generateContent()` call with image in `contents`
- Returns same `GeneratedImageResult` interface

**`orchestration.service.ts` — Strategy selection logic**

- Decide per-iteration whether to regenerate or edit
- Access previous iteration's best image (download from S3 or use in-memory buffer)
- Pass image + edit instruction to `editImage()` when in edit mode
- No changes to S3 upload, evaluation, or termination logic

**`evaluation.service.ts` — No changes needed**

- Judges evaluate images identically regardless of how they were produced
- TOP_ISSUE and feedback structures remain the same

**`prompt-optimizer.service.ts` — Alternate mode for edit instructions**

- Needs a mode that produces concise edit instructions instead of full 500-1000 word prompts
- Edit instructions should be 1-3 sentences, derived from TOP_ISSUE
- Example: instead of a full prompt, output: "Fix the label distortion — ensure the Coca-Cola script is straight and legible. Keep all other elements unchanged."

### Strategy selection heuristic (future implementation)

```typescript
function selectStrategy(
	iterationNumber: number,
	currentScore: number,
	previousScores: number[],
	topIssueSeverity: string | undefined,
	consecutiveEditCount: number,
): 'regenerate' | 'edit' {
	// Always regenerate for first 2 iterations (establish baseline)
	if (iterationNumber <= 2) return 'regenerate';

	// Regenerate if score is too low (bad foundation)
	if (currentScore < 50) return 'regenerate';

	// Regenerate if edits have degraded quality (3+ consecutive edits)
	if (consecutiveEditCount >= 3) return 'regenerate';

	// Regenerate if TOP_ISSUE is critical severity
	if (topIssueSeverity === 'critical') return 'regenerate';

	// Edit mode for moderate/minor fixes when score is decent
	if (
		currentScore >= 50 &&
		(topIssueSeverity === 'moderate' || topIssueSeverity === 'minor')
	) {
		return 'edit';
	}

	// Edit mode for plateau breaking (score stuck in 70-75% range)
	const recentScores = previousScores.slice(-3);
	const isPlateauing =
		recentScores.length >= 3 &&
		Math.max(...recentScores) - Math.min(...recentScores) < 3;
	if (isPlateauing && currentScore >= 65) return 'edit';

	// Default to regeneration
	return 'regenerate';
}
```

---

## Section 7: Iterative Edit Degradation — How Many Rounds Before Artifacts?

This is critical for our edit-mode strategy since we run up to 10 iterations.

### The core problem: generation loss

Each edit round involves: decode source image as base64 → AI processes and transforms → re-encode output as JPEG. This is analogous to the "copy of a copy" problem — each re-encoding cycle introduces compression artifacts and information loss that compound across iterations.

### What degrades and when

| Edit Rounds | Observed Quality                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1-2 edits   | Generally clean. Targeted edits are faithful. Best results.                                                              |
| 3-4 edits   | Subtle drift begins. Fine details (text, edges) soften. Colors may shift slightly.                                       |
| 5+ edits    | Noticeable degradation. Character features drift. JPEG artifacts compound. Unintended changes become more frequent.      |
| 7+ edits    | Significant quality loss. Google recommends restarting with a fresh conversation and detailed description at this point. |

### Specific artifact types reported

- **JPEG compression artifacts compounding** — blocky edges, color banding, posterization in gradients
- **Feature/identity drift** — faces and fine details warp progressively; product shapes subtly change
- **"Scope creep" in edits** — model makes unintended changes beyond the instruction (e.g., removing a door when asked to change furniture color)
- **Resolution reduction** — Google may compress large images on input, and each round compounds this loss
- **Text/label degradation** — already-imperfect text becomes increasingly distorted with each edit pass

### Official Google guidance

Google's prompt engineering guide states that if character features begin to drift after many iterative edits, you should restart a new conversation with a detailed description. The recommendation is to use multi-turn editing for "progressive refinement" with "small adjustments" per turn. No hard maximum is specified, but the drift warning implies a practical limit of approximately 3-5 substantial edits.

### Mitigation strategies for our system

1. **Limit edit-mode iterations to 3-5 per "edit session"** — then fall back to full regeneration with accumulated learnings
2. **Always edit from the best original, not from a previously-edited version** — avoid chaining edits on edits (prevents compounding generation loss)
3. **Single-issue edits** — one TOP_ISSUE fix per edit round, not multiple changes bundled together
4. **Quality checkpointing** — if a judge detects resolution/artifact degradation (score drops after an edit), auto-switch to regeneration mode
5. **Re-upload pattern** — for each edit, re-upload the previous "best" output as a fresh input rather than relying on chat history continuation (avoids context drift)
6. **Keep source images under 2MB** — minimize Google's automatic compression on upload

### Recommended hybrid strategy for our pipeline

```
Iterations 1-2:  Full regeneration (establish a good baseline)
Iterations 3-6:  Edit mode (surgical fixes for TOP_ISSUE items)
                 - Max 3 consecutive edits before forced regeneration
                 - Always edit from the current best image, not from last edit
Iteration 7+:   If still plateauing → regeneration with fresh approach
                 If edit quality degrading → regeneration from best image
                 If score > 80% → continue edits (close to threshold)
```

This balances the strengths of both approaches: regeneration for establishing composition, edit mode for targeted refinement, with degradation-aware fallback. The 3-edit limit per session keeps us well within the safe zone identified by community reports and official guidance.

---

## Section 8: Known Limitations & Gotchas

### Image format and transport

- Images must be sent as base64 `inlineData` — URLs are not supported directly for editing (we already handle base64 conversion)
- Response may include BOTH text and image parts — must iterate all parts to find the image
- JPEG re-encoding is lossy — each edit round loses some information even if the visual change is small
- Max input image size varies by model; keeping source images under 2MB avoids Google's automatic compression

### Model behavior

- **Unintended modifications** — the model sometimes changes elements beyond what was requested. Prompts must explicitly state "keep everything else exactly the same"
- **Safety policy refusals** — the model may refuse edits that involve faces, real people, brands, or sensitive content
- **SynthID watermarking** — automatic on all outputs, invisible to humans but detectable programmatically
- **Non-deterministic outputs** — same input + same prompt can produce slightly different results across calls
- **No pixel-level precision** — edits are semantic ("change the color") not geometric ("move 10 pixels left")

### SDK-specific notes

- `@google/genai` is the correct SDK for image generation and editing
- `@google/generative-ai` is the older text-focused SDK used in our `google.client.ts` — do NOT use it for image editing
- The `editImage()` method on the SDK is for Imagen-based editing, NOT the chat-based approach we want
- Chat-based editing uses `generateContent()` — the same method as generation

### Product photography gotchas

- Brand logos and text are frequently distorted — AI fundamental limitation
- Bottle/glass shapes may subtly change across edits — check contours in judge evaluations
- Condensation and glass refraction effects are hard to maintain through edits
- Color accuracy of brand-specific colors (e.g., Coca-Cola red) may drift

---

## Section 9: Sources & References

- [Gemini API Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation) — official image editing API documentation, includes code examples for both generation and editing
- [How to Prompt Gemini 2.5 Flash Image (Google Developers Blog)](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/) — official prompt engineering guide, covers multi-turn drift guidance and photographic language tips
- [@google/genai JS SDK (GitHub)](https://github.com/googleapis/js-genai) — SDK source with `generateContent`, `editImage`, and `chats.create` methods
- [Gemini Image Editing Next.js Quickstart (GitHub)](https://github.com/google-gemini/gemini-image-editing-nextjs-quickstart) — reference implementation demonstrating chat-based image editing
- [Gemini 2.5 Flash Image on Vertex AI (Google Cloud Blog)](https://cloud.google.com/blog/products/ai-machine-learning/gemini-2-5-flash-image-on-vertex-ai) — capabilities overview and model availability
- [Gemini Flash Image Edit — Degraded (Google AI Forum)](https://discuss.ai.google.dev/t/gemini-flash-image-edit-degraded/84453) — community reports on edit quality degradation over multiple rounds
- [Gemini 2.5 Flash Image Quality Discussion (Google AI Forum)](https://discuss.ai.google.dev/t/gemini-2-5-flash-image-best-way-to-improve-image-quality/101573) — JPEG artifact reports and mitigation strategies
- [Generation Loss (Wikipedia)](https://en.wikipedia.org/wiki/Generation_loss) — foundational concept for understanding iterative re-encoding degradation
