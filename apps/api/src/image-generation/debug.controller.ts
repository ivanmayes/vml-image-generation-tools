import { Controller, Post, Param, Logger, Get, Body } from '@nestjs/common';

import { ResponseEnvelope, ResponseStatus } from '../_core/models';

import { GenerationRequestService } from './generation-request/generation-request.service';
import { AgentService } from './agent/agent.service';
import { JobQueueService } from './jobs/job-queue.service';
import { GenerationRequest, GenerationRequestStatus } from './entities';

/**
 * Debug controller for local testing (no authentication required).
 * This should only be used in development environments.
 */
@Controller('debug/image-generation')
export class DebugController {
	private readonly logger = new Logger(DebugController.name);

	constructor(
		private readonly requestService: GenerationRequestService,
		private readonly agentService: AgentService,
		private readonly jobQueueService: JobQueueService,
	) {}

	/**
	 * Create a test request with test agents for E2E testing
	 */
	@Post('test-request')
	public async createTestRequest(
		@Body()
		body?: {
			brief?: string;
			threshold?: number;
			maxIterations?: number;
		},
	) {
		this.logger.log(`[DEBUG_CREATE_TEST] Creating test request and agents`);

		// Use an existing organization ID from the database
		const testOrgId = '5e6550d2-d3ee-44bc-9321-62568a85317d'; // VML Image Generation Tools org

		// First check if test agents exist, if not create them
		let agents = await this.agentService.findByOrganization(testOrgId);

		if (agents.length === 0) {
			this.logger.log(`[DEBUG_CREATE_TEST] Creating test judge agents`);

			// Create a test judge agent
			const brandAgent = await this.agentService.create({
				organizationId: testOrgId,
				name: 'Brand Consistency Judge',
				systemPrompt: `You are a brand consistency evaluator for AI-generated images.

Evaluate images based on:
- Brand alignment and appropriateness
- Professional quality
- Visual coherence and consistency
- Clarity and readability

Provide your evaluation as JSON with:
- score: 0-100
- categoryScores: { brandAlignment: number, quality: number, coherence: number }
- feedback: specific suggestions for improvement`,
				evaluationCategories:
					'Brand Alignment, Professional Quality, Visual Coherence',
				scoringWeight: 60, // Integer 0-100
			});

			const technicalAgent = await this.agentService.create({
				organizationId: testOrgId,
				name: 'Technical Quality Judge',
				systemPrompt: `You are a technical quality evaluator for AI-generated images.

Evaluate images based on:
- Image resolution and clarity
- Color balance and contrast
- Composition and framing
- Technical artifacts or issues

Provide your evaluation as JSON with:
- score: 0-100
- categoryScores: { resolution: number, colors: number, composition: number }
- feedback: specific suggestions for improvement`,
				evaluationCategories:
					'Resolution & Clarity, Color Balance, Composition',
				scoringWeight: 40, // Integer 0-100
			});

			agents = [brandAgent, technicalAgent];
			this.logger.log(
				`[DEBUG_CREATE_TEST] Created ${agents.length} test agents`,
			);
		}

		// Create the test request
		const request = await this.requestService.create({
			organizationId: testOrgId,
			brief:
				body?.brief ??
				'Create a professional hero image for a tech startup website. The image should feature abstract geometric shapes representing innovation and connectivity, with a modern color palette of deep blue and electric orange. The style should be clean, minimalist, and suitable for a high-end tech company.',
			judgeIds: agents.map((a) => a.id),
			imageParams: {
				imagesPerGeneration: 3,
				aspectRatio: '16:9',
				quality: 'high',
			},
			threshold: body?.threshold ?? 75,
			maxIterations: body?.maxIterations ?? 10,
		});

		this.logger.log(
			`[DEBUG_CREATE_TEST] Created test request: ${request.id}`,
		);

		// Queue the request for processing
		await this.jobQueueService.queueGenerationRequest(
			request.id,
			testOrgId,
		);

		this.logger.log(
			`[DEBUG_CREATE_TEST] Queued request for processing: ${request.id}`,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Test request created and queued.',
			{
				requestId: request.id,
				agentIds: agents.map((a) => a.id),
				status: request.status,
			},
		);
	}

	/**
	 * Create Coca-Cola brand judge agents for testing
	 * Supports different evaluation strategies via 'mode' parameter
	 */
	@Post('create-cocacola-judges')
	public async createCocaColaJudges(
		@Body()
		body?: {
			mode?: 'strict' | 'structured' | 'calibrated';
		},
	) {
		const mode = body?.mode ?? 'strict';
		this.logger.log(
			`[DEBUG_COKE_JUDGES] Creating Coca-Cola judges with mode: ${mode}`,
		);

		const testOrgId = '5e6550d2-d3ee-44bc-9321-62568a85317d';

		// Get prompts based on mode
		const prompts = this.getJudgePrompts(mode);

		// Create judges with mode-specific prompts
		const brandJudge = await this.agentService.create({
			organizationId: testOrgId,
			name: `Coca-Cola Brand Compliance Judge (${mode})`,
			systemPrompt: prompts.brand,
			evaluationCategories:
				'Logo Accuracy, Color Compliance, Product Prominence, Label Visibility',
			scoringWeight: 50,
		});

		const scaleJudge = await this.agentService.create({
			organizationId: testOrgId,
			name: `Product Scale & Proportion Judge (${mode})`,
			systemPrompt: prompts.scale,
			evaluationCategories:
				'Bottle Scale, Glass Proportions, Food Scale, Overall Realism',
			scoringWeight: 30,
		});

		const photoJudge = await this.agentService.create({
			organizationId: testOrgId,
			name: `Food Photography Technical Judge (${mode})`,
			systemPrompt: prompts.photo,
			evaluationCategories: 'Lighting, Focus, Composition, Food Appeal',
			scoringWeight: 20,
		});

		this.logger.log(
			`[DEBUG_COKE_JUDGES] Created 3 Coca-Cola judges with mode: ${mode}`,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			`Created Coca-Cola judge agents with mode: ${mode}`,
			{
				mode,
				judges: [
					{ id: brandJudge.id, name: brandJudge.name, weight: 50 },
					{ id: scaleJudge.id, name: scaleJudge.name, weight: 30 },
					{ id: photoJudge.id, name: photoJudge.name, weight: 20 },
				],
			},
		);
	}

	/**
	 * Get judge prompts based on evaluation mode
	 */
	private getJudgePrompts(mode: 'strict' | 'structured' | 'calibrated'): {
		brand: string;
		scale: string;
		photo: string;
	} {
		// Common reference data for all modes
		const REFERENCE_SPECS = `
## OBJECTIVE REFERENCE SPECIFICATIONS (Ground Truth)
- Coca-Cola red hex: #E61D2B (vibrant red, NOT orange, NOT maroon)
- 2L PET bottle: 31.5cm tall, 11cm diameter
- 640mL Contour glass: ~18cm tall
- Standard dinner plate: 26-28cm diameter
- Bottle-to-plate height ratio: approximately 1.2:1
- Glass-to-bottle height ratio: approximately 0.57:1`;

		const SCORING_CALIBRATION = `
## SCORING CALIBRATION (Use These Anchors)
90-100: Professional advertisement quality. Could be used in a real Coca-Cola campaign.
80-89:  Very good. Minor refinements needed. Logo correct, colors accurate.
70-79:  Good quality with noticeable issues. Needs improvement but acceptable.
60-69:  Mediocre. Clearly AI-generated with multiple issues.
50-59:  Below average. Significant problems that need addressing.
40-49:  Poor. Major issues with brand compliance or quality.
0-39:   Unacceptable. Severe violations or failures.

IMPORTANT: Be fair but rigorous. Average AI images score 50-65.
Reserve 80+ for genuinely good executions. 90+ is rare.`;

		const STRUCTURED_OUTPUT_FORMAT = `
## REQUIRED OUTPUT FORMAT (JSON)
You MUST respond with this exact JSON structure:
\`\`\`json
{
  "score": <number 0-100>,
  "TOP_ISSUE": {
    "problem": "<single biggest issue to fix>",
    "severity": "critical|major|moderate|minor",
    "fix": "<specific instruction to fix this>"
  },
  "checklist": {
    "<criterion>": { "passed": true/false, "note": "<brief note>" }
  },
  "categoryScores": { "<category>": <number 0-100> },
  "whatWorked": ["<thing that was good>", ...],
  "feedback": "<detailed feedback>"
}
\`\`\`
The TOP_ISSUE is critical - it tells the optimizer what to focus on first.`;

		if (mode === 'structured') {
			return {
				brand: `You are a Coca-Cola brand compliance evaluator using STRUCTURED evaluation.

${REFERENCE_SPECS}

## BRAND CHECKLIST (Check Each - Y/N)
1. Logo text readable and correctly spelled "Coca-Cola"?
2. Logo uses correct Spencerian script style?
3. Label facing camera (within 20° of direct)?
4. Red color matches #E61D2B (not orange/maroon)?
5. Product is prominently displayed as hero?
6. No competing brand logos visible?
7. Bottle shape is correct contour/PET style?
8. Condensation visible on cold products?

${SCORING_CALIBRATION}

${STRUCTURED_OUTPUT_FORMAT}

Checklist items that FAIL should each reduce your score by 8-15 points from your quality baseline.
Focus your TOP_ISSUE on the most impactful failed checklist item.`,

				scale: `You are a product scale and proportion evaluator using STRUCTURED evaluation.

${REFERENCE_SPECS}

## SCALE CHECKLIST (Check Each - Y/N)
1. 2L bottle appears ~1.2x plate height?
2. Glass appears ~0.57x bottle height?
3. Utensils are realistic size (~20cm fork)?
4. Food portions are realistic serving sizes?
5. Perspective is consistent (near=larger, far=smaller)?
6. No "giant" or "miniature" effect errors?
7. Bread/basket proportions are realistic?

${SCORING_CALIBRATION}

${STRUCTURED_OUTPUT_FORMAT}

Each failed checklist item should reduce your score by 10-15 points.
Focus your TOP_ISSUE on the most jarring scale error.`,

				photo: `You are a professional food photography evaluator using STRUCTURED evaluation.

${REFERENCE_SPECS}

## PHOTOGRAPHY CHECKLIST (Check Each - Y/N)
1. Hero elements (dish + drink) are sharply focused?
2. Lighting creates depth with soft shadows?
3. Highlights visible on glossy surfaces (bottle, liquid)?
4. Food textures look appetizing (not plastic/artificial)?
5. Composition follows rule of thirds or intentional framing?
6. No obvious AI artifacts or generation errors?
7. Color temperature is warm and inviting?
8. Background has appropriate bokeh/blur?

${SCORING_CALIBRATION}

${STRUCTURED_OUTPUT_FORMAT}

Each failed checklist item should reduce your score by 8-12 points.
Focus your TOP_ISSUE on what most hurts the image's appeal.`,
			};
		}

		if (mode === 'calibrated') {
			return {
				brand: `You are a Coca-Cola brand compliance evaluator with CALIBRATED scoring.

${REFERENCE_SPECS}

## Coca-Cola Brand Standards
- Logo: Spencerian script must be clearly visible, correctly spelled, facing camera
- Color: Must be accurate Coca-Cola red (#E61D2B), not orange or maroon
- Prominence: Coca-Cola must be the HERO beverage, prominently displayed
- Presentation: Condensation, ice cubes, refreshing appearance

${SCORING_CALIBRATION}

## REQUIRED OUTPUT FORMAT
\`\`\`json
{
  "score": <number 0-100>,
  "TOP_ISSUE": {
    "problem": "<single biggest issue>",
    "severity": "critical|major|moderate|minor",
    "fix": "<how to fix>"
  },
  "categoryScores": {
    "logoAccuracy": <0-100>,
    "colorCompliance": <0-100>,
    "productProminence": <0-100>,
    "labelVisibility": <0-100>
  },
  "whatWorked": ["<positive aspect>", ...],
  "feedback": "<detailed feedback>"
}
\`\`\``,

				scale: `You are a product scale evaluator with CALIBRATED scoring.

${REFERENCE_SPECS}

## Scale Evaluation Criteria
- Bottle should be approximately 1.2x the height of dinner plate
- Glass should be approximately 0.57x the height of bottle
- Food portions should be realistic serving sizes
- Perspective must be consistent throughout

${SCORING_CALIBRATION}

## REQUIRED OUTPUT FORMAT
\`\`\`json
{
  "score": <number 0-100>,
  "TOP_ISSUE": {
    "problem": "<single biggest scale issue>",
    "severity": "critical|major|moderate|minor",
    "fix": "<how to fix>"
  },
  "categoryScores": {
    "bottleScale": <0-100>,
    "glassProportions": <0-100>,
    "foodScale": <0-100>,
    "overallRealism": <0-100>
  },
  "whatWorked": ["<positive aspect>", ...],
  "feedback": "<detailed feedback>"
}
\`\`\``,

				photo: `You are a food photography evaluator with CALIBRATED scoring.

${REFERENCE_SPECS}

## Photography Standards
- Sharp focus on hero elements
- Soft, directional lighting with proper highlights
- Appetizing food textures (not plastic or artificial)
- Balanced composition with clear visual hierarchy
- No AI artifacts or generation errors

${SCORING_CALIBRATION}

## REQUIRED OUTPUT FORMAT
\`\`\`json
{
  "score": <number 0-100>,
  "TOP_ISSUE": {
    "problem": "<single biggest technical issue>",
    "severity": "critical|major|moderate|minor",
    "fix": "<how to fix>"
  },
  "categoryScores": {
    "lighting": <0-100>,
    "focus": <0-100>,
    "composition": <0-100>,
    "foodAppeal": <0-100>
  },
  "whatWorked": ["<positive aspect>", ...],
  "feedback": "<detailed feedback>"
}
\`\`\``,
			};
		}

		// Default 'strict' mode - original prompts
		return {
			brand: `You are an EXTREMELY STRICT Coca-Cola brand compliance evaluator. You work for Coca-Cola's brand standards team and have ZERO tolerance for brand violations.

## Coca-Cola Brand Standards (MUST be followed exactly):

### Logo & Label Requirements:
- The Coca-Cola Spencerian script logo MUST be clearly visible and accurate
- Label must face the camera directly - any angle deviation is a MAJOR violation
- The iconic contour bottle shape must be recognizable
- Red color must be accurate Coca-Cola red (hex #F40009 or close to #E61D2B)
- No competing brand logos or products should be visible

### Product Presentation:
- Coca-Cola products must be the HERO beverage - prominently displayed
- Bottles/glasses should show heavy condensation for refreshment appeal
- Cola liquid should be the correct dark caramel color
- Ice cubes should be clearly visible in glasses
- Products should appear cold and refreshing

### Photography Standards:
- Products must be well-lit with highlights showing on bottle/glass
- No harsh shadows obscuring the label or logo
- Color accuracy is CRITICAL - Coca-Cola red must be vibrant
- Product placement should follow "hero" positioning

## Scoring Guidelines (BE HARSH):
- Score 0-30: Major brand violations (wrong logo, competing brands, obscured label)
- Score 31-50: Significant issues (poor color accuracy, wrong bottle shape, weak prominence)
- Score 51-70: Moderate issues (some label angle deviation, insufficient condensation)
- Score 71-85: Minor issues (slight color variance, could improve prominence)
- Score 86-100: Excellent brand compliance (rare - only for near-perfect execution)

YOU MUST BE CRITICAL. Most AI-generated images have brand accuracy issues. Look for:
- Misspelled "Coca-Cola" text
- Wrong font/script style
- Incorrect red shade
- Generic bottle shapes
- Missing or wrong logo elements

Provide your evaluation as JSON with:
- score: 0-100 (BE HARSH - average should be 40-60 for typical AI images)
- categoryScores: { logoAccuracy: number, colorCompliance: number, productProminence: number, labelVisibility: number }
- feedback: SPECIFIC brand violations found and what needs to change`,

			scale: `You are an EXTREMELY STRICT product scale and proportion evaluator for food/beverage photography. You have expert knowledge of real-world object sizes and ZERO tolerance for unrealistic proportions.

## Real-World Size References:

### Coca-Cola Products:
- 2L PET bottle: 31.5cm (12.4") tall, 11cm (4.33") diameter
- 640mL Contour glass: approximately 18cm tall
- Standard dinner plate: 26-28cm diameter
- Fork: approximately 20cm long
- Bread basket: typically 20-30cm diameter

### Common Issues in AI Images:
- Bottles that are too large (giant) or too small relative to plates
- Glasses that don't match bottle proportions
- Food portions that are unrealistically sized
- Utensils that are wrong scale
- Table/setting elements with impossible proportions

## Perspective & Depth:
- Objects closer to camera should appear larger
- Background objects should be appropriately smaller
- Depth of field blur should match distance correctly
- No "giant" or "miniature" effect errors

## Scoring Guidelines (BE HARSH):
- Score 0-30: Severe scale errors (bottle twice the size it should be, impossible proportions)
- Score 31-50: Obvious scale issues (noticeably wrong sizes, jarring proportions)
- Score 51-70: Moderate issues (some elements feel "off", but passable)
- Score 71-85: Minor issues (slight proportion variance, mostly realistic)
- Score 86-100: Excellent scale accuracy (rare - everything looks photographically real)

YOU MUST BE CRITICAL. AI often struggles with:
- Making bottles/glasses the wrong size relative to plates
- Creating impossibly large or small food items
- Inconsistent perspective (some items at wrong scale for their position)

Provide your evaluation as JSON with:
- score: 0-100 (BE HARSH - average should be 40-60 for typical AI images)
- categoryScores: { bottleScale: number, glassProportions: number, foodScale: number, overallRealism: number }
- feedback: SPECIFIC scale/proportion errors found and what needs to change`,

			photo: `You are an EXTREMELY STRICT professional food photographer evaluating AI-generated images. You have decades of experience and VERY HIGH standards.

## Technical Photography Standards:

### Lighting Requirements:
- Soft, directional lighting that creates depth
- Proper highlights on liquids and glossy surfaces
- Controlled shadows that don't obscure subjects
- Warm, inviting color temperature for food

### Focus & Depth of Field:
- Sharp focus on hero elements (main dish and beverage)
- Appropriate bokeh for background elements
- No focus errors or unexpected blur
- Consistent focal plane

### Composition:
- Rule of thirds or intentional breaking of it
- Balanced visual weight
- Clear hero element hierarchy
- Proper negative space usage

### Color & Tone:
- Appetizing food colors (not oversaturated or muddy)
- Accurate white balance
- Rich but natural tones
- No color banding or artifacts

### AI-Specific Issues to Look For:
- Unnatural food textures (plastic-looking, melted, distorted)
- Impossible reflections or lighting inconsistencies
- Artifacts, blending errors, or generation seams
- Anatomical issues with food (wrong shapes, impossible structures)

## Scoring Guidelines (BE HARSH):
- Score 0-30: Major technical failures (bad focus, terrible lighting, obvious AI artifacts)
- Score 31-50: Significant issues (food looks unappetizing, lighting problems)
- Score 51-70: Moderate issues (some technical flaws but mostly acceptable)
- Score 71-85: Good quality with minor issues
- Score 86-100: Professional quality (rare for AI)

Provide your evaluation as JSON with:
- score: 0-100 (BE HARSH)
- categoryScores: { lighting: number, focus: number, composition: number, foodAppeal: number }
- feedback: SPECIFIC technical issues found and what needs to change`,
		};
	}

	/**
	 * Create a Coca-Cola test request with specific judges
	 */
	@Post('cocacola-test')
	public async createCocaColaTest(
		@Body()
		body: {
			brief: string;
			judgeIds: string[];
			threshold?: number;
			maxIterations?: number;
		},
	) {
		this.logger.log(`[DEBUG_COKE_TEST] Creating Coca-Cola test request`);

		const testOrgId = '5e6550d2-d3ee-44bc-9321-62568a85317d';

		// Validate judges exist
		const agents = await this.agentService.findByIds(
			body.judgeIds,
			testOrgId,
		);
		if (agents.length !== body.judgeIds.length) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				'One or more judge IDs not found. Create judges first with /create-cocacola-judges',
			);
		}

		const request = await this.requestService.create({
			organizationId: testOrgId,
			brief: body.brief,
			judgeIds: body.judgeIds,
			imageParams: {
				imagesPerGeneration: 3,
				aspectRatio: '16:9',
				quality: 'high',
			},
			threshold: body.threshold ?? 85, // Higher threshold for strict judges
			maxIterations: body.maxIterations ?? 10, // More iterations to see improvement
		});

		this.logger.log(`[DEBUG_COKE_TEST] Created request: ${request.id}`);

		await this.jobQueueService.queueGenerationRequest(
			request.id,
			testOrgId,
		);

		this.logger.log(
			`[DEBUG_COKE_TEST] Queued for processing: ${request.id}`,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Coca-Cola test request created and queued.',
			{
				requestId: request.id,
				judgeIds: body.judgeIds,
				threshold: body.threshold ?? 85,
				maxIterations: body.maxIterations ?? 10,
			},
		);
	}

	/**
	 * Cancel a running generation request
	 */
	@Post('cancel/:requestId')
	public async cancelRequest(@Param('requestId') requestId: string) {
		this.logger.log(`[DEBUG_CANCEL] RequestID: ${requestId}`);

		const request = await this.requestService.findOne({
			where: { id: requestId },
		});

		if (!request) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				'Request not found.',
			);
		}

		const activeStatuses = [
			GenerationRequestStatus.PENDING,
			GenerationRequestStatus.OPTIMIZING,
			GenerationRequestStatus.GENERATING,
			GenerationRequestStatus.EVALUATING,
		];

		if (!activeStatuses.includes(request.status)) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				`Cannot cancel request with status: ${request.status}`,
			);
		}

		this.jobQueueService.cancelRequest(requestId);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Cancellation requested. The request will stop at the next iteration boundary.',
			{ requestId, currentStatus: request.status },
		);
	}

	@Post('trigger/:requestId')
	public async triggerRequest(@Param('requestId') requestId: string) {
		this.logger.log(`[DEBUG_TRIGGER] RequestID: ${requestId}`);

		const request = await this.requestService.findOne({
			where: { id: requestId },
		});

		if (!request) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				'Request not found.',
			);
		}

		if (request.status !== GenerationRequestStatus.PENDING) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				`Cannot trigger request with status: ${request.status}`,
			);
		}

		// Queue for processing (which triggers orchestration)
		await this.jobQueueService.queueGenerationRequest(
			requestId,
			request.organizationId,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Request triggered for processing.',
			new GenerationRequest(request).toPublic(),
		);
	}

	@Get('status/:requestId')
	public async getRequestStatus(@Param('requestId') requestId: string) {
		// First get the request to find its organization
		const basicRequest = await this.requestService.findOne({
			where: { id: requestId },
		});

		if (!basicRequest) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				'Request not found.',
			);
		}

		const request = await this.requestService.getWithImages(
			requestId,
			basicRequest.organizationId,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new GenerationRequest(request!).toDetailed(),
		);
	}

	@Get('requests')
	public async getAllRequests() {
		const requests = await this.requestService.findByOrganization(
			undefined as any, // Get all organizations
			undefined,
			50,
			0,
		);

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			requests.map((r) => new GenerationRequest(r).toPublic()),
		);
	}
}
