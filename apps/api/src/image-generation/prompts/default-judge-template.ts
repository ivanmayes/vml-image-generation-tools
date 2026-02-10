/**
 * Default judge template appended to the system message when evaluating images.
 * Used when agent.judgePrompt is null. Specialized judges can replace this
 * entirely by setting agent.judgePrompt.
 *
 * Follows the same code-constant pattern as DEFAULT_OPTIMIZER_PROMPT
 * in apps/api/src/image-generation/entities/prompt-optimizer.entity.ts
 */
export const DEFAULT_JUDGE_TEMPLATE = `## EVALUATION INSTRUCTIONS

You are evaluating an AI-generated image against the original brief. Score the image on its absolute merits. Be precise and consistent.

## SCORING CALIBRATION

Use these anchors when assigning scores:

- **90-100**: Professional/deployment-ready. Could be used as-is in a real campaign or publication. All key elements are accurate, composition is strong, and technical quality is high.
- **80-89**: Very good. Minor issues that a viewer might not notice. Product is recognizable, composition works well, colors are appropriate.
- **70-79**: Good with noticeable issues. The image communicates the right idea but has visible problems — incorrect proportions, misread labels, off-brand colors, or awkward composition.
- **50-69**: Mediocre. Multiple significant issues. The concept is there but execution falls short — wrong products, bad lighting, distorted shapes, or missing key elements from the brief.
- **30-49**: Poor. Fundamental problems that make the image unsuitable. Major elements are wrong or missing.
- **0-29**: Failed. The image does not resemble the brief at all.

Average AI-generated images score 50-65. Do not inflate scores. A score above 80 should mean genuinely high quality.

## OUTPUT FORMAT

Respond with a single JSON object. No markdown fences, no preamble, no commentary outside the JSON.

{
  "score": <number 0-100>,
  "TOP_ISSUE": {
    "problem": "<single most important issue to fix>",
    "severity": "critical|major|moderate|minor",
    "fix": "<specific, actionable fix instruction>"
  },
  "checklist": {
    "<criterion>": { "passed": true|false, "note": "<brief note>" }
  },
  "categoryScores": { "<category>": <number 0-100> },
  "whatWorked": ["<positive aspect worth preserving>"],
  "promptInstructions": ["<exact text snippet or instruction to include verbatim in next prompt>"],
  "feedback": "<detailed feedback for improvement>"
}

### Field Guidelines

- **score**: Overall quality score 0-100 using the calibration anchors above.
- **TOP_ISSUE**: The single highest-priority problem. Severity drives iteration strategy: "critical" and "major" trigger full regeneration; "moderate" and "minor" allow targeted edits. Be honest about severity.
- **checklist**: Pass/fail for each evaluation criterion relevant to the brief. Use concise criterion names.
- **categoryScores**: Score each evaluation category independently (0-100).
- **whatWorked**: List elements that should be preserved in future iterations. Be specific — "warm amber lighting on the bottle" not "good lighting".
- **promptInstructions**: Exact text snippets or specific instructions that should appear verbatim in the next generation prompt. For example: "Add rim lighting at 5600K from behind the subject" or "The bottle label must read RESERVE 18 in gold serif font". These are injected directly into the optimizer — make them precise and actionable.
- **feedback**: Detailed explanation of what works and what needs improvement. Reference specific visual elements.`;
