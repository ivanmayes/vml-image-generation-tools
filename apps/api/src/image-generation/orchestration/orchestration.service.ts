import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as AWS from 'aws-sdk';

import { AgentService } from '../../agent/agent.service';
import { GenerationRequestService } from '../generation-request/generation-request.service';
import { PromptOptimizerService } from '../prompt-optimizer/prompt-optimizer.service';
import {
	GenerationRequestStatus,
	CompletionReason,
	IterationSnapshot,
	GeneratedImage,
	GenerationMode,
} from '../entities';
import { JobQueueService } from '../jobs/job-queue.service';

import {
	GeminiImageService,
	GeneratedImageResult,
} from './gemini-image.service';
import {
	EvaluationService,
	EvaluationResult,
	IterationContext,
} from './evaluation.service';
import { DebugOutputService, DebugIterationData } from './debug-output.service';
import {
	GenerationEventsService,
	GenerationEventType,
} from './generation-events.service';

/** Maximum time for an entire orchestration run (10 minutes) */
const MAX_ORCHESTRATION_TIME_MS = 10 * 60 * 1000;

@Injectable()
export class OrchestrationService {
	private readonly logger = new Logger(OrchestrationService.name);
	private readonly s3: AWS.S3;

	constructor(
		private readonly agentService: AgentService,
		private readonly requestService: GenerationRequestService,
		private readonly promptOptimizerService: PromptOptimizerService,
		private readonly geminiImageService: GeminiImageService,
		private readonly evaluationService: EvaluationService,
		private readonly debugOutputService: DebugOutputService,
		private readonly jobQueueService: JobQueueService,
		private readonly generationEventsService: GenerationEventsService,
	) {
		this.s3 = new AWS.S3({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			region: process.env.AWS_REGION || 'us-east-1',
		});
	}

	/**
	 * Execute a full generation request through all iterations
	 */
	public async executeRequest(requestId: string): Promise<void> {
		const startTime = Date.now();
		this.logger.log(
			`[ORCHESTRATION_START] RequestID: ${requestId} - Beginning orchestration`,
		);

		const request = await this.requestService.findOne({
			where: { id: requestId },
		});

		if (!request) {
			this.logger.error(
				`[ORCHESTRATION_ERROR] RequestID: ${requestId} - Request not found`,
			);
			throw new Error(`Request ${requestId} not found`);
		}

		// Determine starting iteration for continuations
		// On fresh runs currentIteration is 0; on continuations it reflects completed iterations
		const startIteration = (request.currentIteration ?? 0) + 1;

		this.logger.log(
			`[REQUEST_LOADED] RequestID: ${requestId} | ` +
				`Brief: "${request.brief.substring(0, 50)}..." | ` +
				`MaxIterations: ${request.maxIterations} | ` +
				`StartIteration: ${startIteration} | ` +
				`Threshold: ${request.threshold} | ` +
				`JudgeCount: ${request.judgeIds.length}`,
		);

		// Load the judge agents
		this.logger.debug(
			`[AGENTS_LOADING] RequestID: ${requestId} - Loading ${request.judgeIds.length} judge agents`,
		);
		const agents = await this.agentService.findByIds(
			request.judgeIds,
			request.organizationId,
		);

		if (agents.length !== request.judgeIds.length) {
			this.logger.error(
				`[AGENTS_ERROR] RequestID: ${requestId} - ` +
					`Expected ${request.judgeIds.length} agents, found ${agents.length}`,
			);
			throw new Error('Some judge agents not found');
		}

		// Filter out agents that have had canJudge toggled off since the request was created
		const nonJudges = agents.filter((a) => !a.canJudge);
		if (nonJudges.length > 0) {
			this.logger.warn(
				`[AGENTS_CANJUDGE_FILTER] RequestID: ${requestId} - ` +
					`Filtering out ${nonJudges.length} agent(s) with canJudge=false: ` +
					nonJudges.map((a) => a.name).join(', '),
			);
		}
		const judgeAgents = agents.filter((a) => a.canJudge);
		if (judgeAgents.length === 0) {
			this.logger.error(
				`[AGENTS_ERROR] RequestID: ${requestId} - ` +
					`All ${agents.length} agent(s) have canJudge=false. Cannot evaluate.`,
			);
			throw new Error(
				'No eligible judge agents — all assigned agents have canJudge disabled',
			);
		}

		this.logger.log(
			`[AGENTS_LOADED] RequestID: ${requestId} - Loaded ${judgeAgents.length} judges: ` +
				judgeAgents
					.map((a) => `${a.name}(w:${a.scoringWeight})`)
					.join(', '),
		);

		// Initialize debug output session if enabled
		this.debugOutputService.initSession(
			requestId,
			request.organizationId,
			request.brief,
			request.threshold,
			request.maxIterations,
			judgeAgents.map((a) => ({
				id: a.id,
				name: a.name,
				weight: a.scoringWeight,
			})),
		);

		// Load agents with documents for RAG
		this.logger.debug(
			`[RAG_LOADING] RequestID: ${requestId} - Loading agent documents for RAG`,
		);
		const agentsWithDocs = await Promise.all(
			judgeAgents.map((a) =>
				this.agentService.getWithDocuments(
					a.id,
					request.organizationId,
				),
			),
		);

		const docCounts = agentsWithDocs.map((a) => a?.documents?.length ?? 0);
		this.logger.log(
			`[RAG_LOADED] RequestID: ${requestId} - Document counts per agent: [${docCounts.join(', ')}]`,
		);

		// Helper to log orchestration summary at any exit point
		const logOrchestrationSummary = (
			reason: string,
			finalScore: number,
			iterations: number,
			elapsedMs: number,
			retries: number,
			negativePrompts: string | undefined,
		) => {
			const negLines = (negativePrompts || '')
				.split('\n')
				.filter((l: string) => l.trim()).length;
			const avgIterMs =
				iterations > 0 ? Math.round(elapsedMs / iterations) : 0;
			this.logger.log(
				`[ORCHESTRATION_SUMMARY] RequestID: ${requestId} | ` +
					`Result: ${reason} | ` +
					`FinalScore: ${finalScore.toFixed(2)} | ` +
					`Iterations: ${iterations}/${request.maxIterations} | ` +
					`TotalTime: ${elapsedMs}ms | ` +
					`AvgIterationTime: ${avgIterMs}ms | ` +
					`Retries: ${retries} | ` +
					`NegativePrompts: ${negLines} lines | ` +
					`PlateauConfig: window=${request.imageParams?.plateauWindowSize ?? 3},threshold=${request.imageParams?.plateauThreshold ?? 0.02}`,
			);
		};

		let totalRetries = 0;
		let completedIterations = request.currentIteration ?? 0;
		let bestScore = 0;

		// Reconstruct consecutiveEditCount from last iteration (persists across continuations)
		const lastPersistedIteration =
			request.iterations?.[request.iterations.length - 1];
		let consecutiveEditCount =
			lastPersistedIteration?.consecutiveEditCount ?? 0;

		try {
			let currentPrompt: string | undefined;
			const previousPrompts: string[] = [];
			let bestImageId: string | undefined;
			const latestIterations: typeof request.iterations = [];

			// Seed state from prior iterations (supports continuations)
			if (request.iterations?.length) {
				for (const prevIter of request.iterations) {
					latestIterations.push(prevIter);
					previousPrompts.push(prevIter.optimizedPrompt);
					if (
						prevIter.selectedImageId &&
						prevIter.aggregateScore >= bestScore
					) {
						bestScore = prevIter.aggregateScore;
						bestImageId = prevIter.selectedImageId;
					}
				}
				// Resume from last prompt
				currentPrompt =
					request.iterations[request.iterations.length - 1]
						.optimizedPrompt;
				this.logger.log(
					`[CONTINUATION_SEED] RequestID: ${requestId} | ` +
						`SeededIterations: ${request.iterations.length} | ` +
						`BestScore: ${bestScore.toFixed(2)} | ` +
						`StartIteration: ${startIteration}`,
				);
			}

			// Run iterations
			for (
				let iteration = startIteration;
				iteration <= request.maxIterations;
				iteration++
			) {
				const iterationStartTime = Date.now();

				// Check cancellation
				if (this.jobQueueService.isCancelled(requestId)) {
					const elapsed = Date.now() - startTime;
					this.logger.log(
						`[ORCHESTRATION_CANCELLED] RequestID: ${requestId} | ` +
							`Iteration: ${iteration} | BestScore: ${bestScore}`,
					);
					await this.requestService.cancel(requestId);
					this.debugOutputService.saveFinalResult(
						requestId,
						'cancelled',
						'USER_CANCELLED',
						bestScore,
						bestImageId ?? '',
						elapsed,
					);
					logOrchestrationSummary(
						'CANCELLED',
						bestScore,
						completedIterations,
						elapsed,
						totalRetries,
						request.negativePrompts,
					);
					return;
				}

				// Check orchestration timeout
				if (Date.now() - startTime > MAX_ORCHESTRATION_TIME_MS) {
					const elapsed = Date.now() - startTime;
					this.logger.warn(
						`[ORCHESTRATION_TIMEOUT] RequestID: ${requestId} | ` +
							`Elapsed: ${elapsed}ms | ` +
							`Limit: ${MAX_ORCHESTRATION_TIME_MS}ms`,
					);
					if (bestImageId) {
						await this.requestService.complete(
							requestId,
							bestImageId,
							CompletionReason.MAX_RETRIES_REACHED,
						);
					} else {
						await this.requestService.fail(
							requestId,
							`Orchestration timed out after ${elapsed}ms before completing any iteration`,
						);
					}
					this.debugOutputService.saveFinalResult(
						requestId,
						bestImageId ? 'completed' : 'failed',
						'TIMEOUT',
						bestScore,
						bestImageId ?? '',
						elapsed,
					);
					logOrchestrationSummary(
						'TIMEOUT',
						bestScore,
						completedIterations,
						elapsed,
						totalRetries,
						request.negativePrompts,
					);
					return;
				}

				this.logger.log(
					`[ITERATION_START] RequestID: ${requestId} | ` +
						`Iteration: ${iteration}/${request.maxIterations} | ` +
						`BestScoreSoFar: ${bestScore}`,
				);

				// Determine strategy for this iteration
				const lastIterationEvals =
					latestIterations.length > 0
						? latestIterations[latestIterations.length - 1]
								.evaluations
						: [];
				const topIssueSeverity = lastIterationEvals
					.filter((e) => e.topIssue)
					.sort((a, b) => {
						const order: Record<string, number> = {
							critical: 0,
							major: 1,
							moderate: 2,
							minor: 3,
						};
						return (
							(order[a.topIssue!.severity] ?? 2) -
							(order[b.topIssue!.severity] ?? 2)
						);
					})[0]?.topIssue?.severity;

				const strategy = this.selectIterationStrategy(
					request.generationMode ?? GenerationMode.REGENERATION,
					iteration,
					bestScore,
					latestIterations.map((i) => i.aggregateScore),
					topIssueSeverity,
					consecutiveEditCount,
				);

				this.logger.log(
					`[STRATEGY_SELECTED] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`Mode: ${request.generationMode ?? 'regeneration'} | Strategy: ${strategy} | ` +
						`ConsecutiveEdits: ${consecutiveEditCount}`,
				);

				let optimizedPrompt: string;
				let generatedImages: GeneratedImageResult[];
				let editSourceImageId: string | undefined;
				const imageParams = request.imageParams ?? {
					imagesPerGeneration: 3,
				};
				const imageCount = imageParams.imagesPerGeneration || 3;

				if (strategy === 'edit' && bestImageId) {
					// ═══════════════════════════════════════════════
					// EDIT PATH: Download best image, build edit instruction, edit it
					// ═══════════════════════════════════════════════

					await this.requestService.updateStatus(
						requestId,
						GenerationRequestStatus.OPTIMIZING,
					);
					this.generationEventsService.emit(
						requestId,
						GenerationEventType.STATUS_CHANGE,
						{
							status: GenerationRequestStatus.OPTIMIZING,
							iteration,
						},
					);

					// Use the best image from the LAST iteration specifically
					const lastIteration =
						latestIterations[latestIterations.length - 1];
					editSourceImageId =
						lastIteration?.selectedImageId ?? bestImageId;

					// Build edit instruction from TOP_ISSUE
					const topIssues = lastIterationEvals
						.filter((e) => e.topIssue)
						.map((e) => e.topIssue!);
					const whatWorked = lastIterationEvals
						.flatMap((e) => e.whatWorked ?? [])
						.filter((w, i, arr) => arr.indexOf(w) === i);

					// Parallelize S3 download + edit instruction building
					const [sourceImageBase64, editInstruction] =
						await Promise.all([
							this.downloadImageAsBase64(
								editSourceImageId,
								request.organizationId,
							),
							this.promptOptimizerService.buildEditInstruction({
								originalBrief: request.brief,
								topIssues,
								whatWorked,
							}),
						]);

					optimizedPrompt = editInstruction;

					this.logger.log(
						`[EDIT_INSTRUCTION] RequestID: ${requestId} | Iteration: ${iteration} | ` +
							`Instruction: "${editInstruction.substring(0, 100)}..." | ` +
							`SourceImage: ${editSourceImageId}`,
					);

					// Generate edited images
					await this.requestService.updateStatus(
						requestId,
						GenerationRequestStatus.GENERATING,
					);
					this.generationEventsService.emit(
						requestId,
						GenerationEventType.STATUS_CHANGE,
						{
							status: GenerationRequestStatus.GENERATING,
							iteration,
						},
					);

					const genStartTime = Date.now();
					try {
						generatedImages = await this.withRetry(
							() =>
								this.geminiImageService.editImages(
									sourceImageBase64,
									editInstruction,
									imageCount,
									{
										aspectRatio: imageParams.aspectRatio,
									},
								),
							`ImageEdit:iter${iteration}`,
							3,
							1000,
							() => {
								totalRetries++;
							},
							requestId,
						);
						consecutiveEditCount++;
					} catch (editError) {
						// Edit-to-regeneration fallback
						const message =
							editError instanceof Error
								? editError.message
								: 'Unknown error';
						this.logger.warn(
							`[EDIT_FALLBACK] RequestID: ${requestId} | Iteration: ${iteration} | ` +
								`Edit failed, falling back to regeneration: ${message}`,
						);
						generatedImages = await this.withRetry(
							() =>
								this.geminiImageService.generateImages(
									currentPrompt ?? request.brief,
									imageCount,
									{
										aspectRatio: imageParams.aspectRatio,
										quality: imageParams.quality,
										referenceImageUrls:
											request.referenceImageUrls,
									},
								),
							`ImageGenFallback:iter${iteration}`,
							3,
							1000,
							() => {
								totalRetries++;
							},
							requestId,
						);
						consecutiveEditCount = 0;
						editSourceImageId = undefined;
					}

					this.logger.log(
						`[GENERATION_COMPLETE] RequestID: ${requestId} | Iteration: ${iteration} | ` +
							`Strategy: edit | ImagesGenerated: ${generatedImages.length} | ` +
							`Time: ${Date.now() - genStartTime}ms`,
					);
				} else {
					// ═══════════════════════════════════════════════
					// REGENERATION PATH: Existing behavior (unchanged)
					// ═══════════════════════════════════════════════
					consecutiveEditCount = 0;

					// 1. Optimize prompt
					this.logger.log(
						`[PHASE_OPTIMIZING] RequestID: ${requestId} | Iteration: ${iteration} - Starting prompt optimization`,
					);
					await this.requestService.updateStatus(
						requestId,
						GenerationRequestStatus.OPTIMIZING,
					);
					this.generationEventsService.emit(
						requestId,
						GenerationEventType.STATUS_CHANGE,
						{
							status: GenerationRequestStatus.OPTIMIZING,
							iteration,
						},
					);

					// Get RAG context for optimization
					const ragStartTime = Date.now();
					const ragContext =
						await this.promptOptimizerService.getAgentRagContext(
							agentsWithDocs.filter(Boolean) as any[],
							request.brief,
						);
					this.logger.debug(
						`[RAG_CONTEXT] RequestID: ${requestId} | Iteration: ${iteration} | ` +
							`ContextLength: ${ragContext.length} chars | ` +
							`Time: ${Date.now() - ragStartTime}ms`,
					);

					// Get judge feedback from previous iteration
					const judgeFeedback =
						latestIterations.length > 0
							? latestIterations[
									latestIterations.length - 1
								].evaluations.map((e) => ({
									agentId: e.agentId,
									agentName: e.agentName,
									feedback: e.feedback,
									score: e.overallScore,
									weight: e.weight,
									topIssue: e.topIssue,
									whatWorked: e.whatWorked,
									promptInstructions: e.promptInstructions,
								}))
							: [];

					const optimizeStartTime = Date.now();

					if (request.initialPrompt && iteration === startIteration) {
						optimizedPrompt = request.initialPrompt;
						this.logger.log(
							`[PROMPT_OVERRIDE] RequestID: ${requestId} | Iteration: ${iteration} - Using initial prompt`,
						);
					} else {
						optimizedPrompt =
							await this.promptOptimizerService.optimizePrompt({
								originalBrief: request.brief,
								currentPrompt,
								judgeFeedback,
								previousPrompts,
								negativePrompts: request.negativePrompts,
								referenceContext: ragContext,
								hasReferenceImages:
									!!request.referenceImageUrls?.length,
							});
					}

					this.logger.log(
						`[OPTIMIZATION_COMPLETE] RequestID: ${requestId} | Iteration: ${iteration} | ` +
							`PromptLength: ${optimizedPrompt.length} chars | ` +
							`Time: ${Date.now() - optimizeStartTime}ms`,
					);

					currentPrompt = optimizedPrompt;
					previousPrompts.push(optimizedPrompt);

					// 2. Generate images
					this.logger.log(
						`[PHASE_GENERATING] RequestID: ${requestId} | Iteration: ${iteration} - Starting image generation`,
					);
					await this.requestService.updateStatus(
						requestId,
						GenerationRequestStatus.GENERATING,
					);
					this.generationEventsService.emit(
						requestId,
						GenerationEventType.STATUS_CHANGE,
						{
							status: GenerationRequestStatus.GENERATING,
							iteration,
						},
					);

					const genStartTime = Date.now();
					generatedImages = await this.withRetry(
						() =>
							this.geminiImageService.generateImages(
								optimizedPrompt,
								imageCount,
								{
									aspectRatio: imageParams.aspectRatio,
									quality: imageParams.quality,
									referenceImageUrls:
										request.referenceImageUrls,
								},
							),
						`ImageGeneration:iter${iteration}`,
						3,
						1000,
						() => {
							totalRetries++;
						},
						requestId,
					);

					this.logger.log(
						`[GENERATION_COMPLETE] RequestID: ${requestId} | Iteration: ${iteration} | ` +
							`Strategy: regenerate | ImagesGenerated: ${generatedImages.length} | ` +
							`Time: ${Date.now() - genStartTime}ms`,
					);
				}

				// Upload images to S3 and create database records
				this.logger.debug(
					`[S3_UPLOAD_START] RequestID: ${requestId} | Iteration: ${iteration} - Uploading ${generatedImages.length} images`,
				);
				const uploadStartTime = Date.now();
				const debugImagePaths: (string | null)[] = [];

				// Defensive: validate request has organizationId (should always be set from initial load)
				if (!request.organizationId) {
					throw new Error(
						`Request ${requestId} missing organizationId - cannot upload to S3`,
					);
				}

				// Use Promise.allSettled to avoid unhandled rejections when one upload fails while others are in-flight
				const uploadSettled = await Promise.allSettled(
					generatedImages.map(async (img, imgIndex) => {
						const imageId = uuidv4();
						const s3Key = `image-generation/${request.organizationId}/${requestId}/${imageId}.jpg`;

						// Save to debug output if enabled
						const debugPath = this.debugOutputService.saveImage(
							requestId,
							iteration,
							imageId,
							img.imageData,
							img.mimeType,
						);
						debugImagePaths[imgIndex] = debugPath;

						await this.uploadToS3(
							s3Key,
							img.imageData,
							img.mimeType,
							() => {
								totalRetries++;
							},
							requestId,
						);

						this.logger.debug(
							`[S3_UPLOAD] RequestID: ${requestId} | Iteration: ${iteration} | ` +
								`Image: ${imgIndex + 1}/${generatedImages.length} | ` +
								`Size: ${img.imageData.length} bytes`,
						);

						const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${s3Key}`;

						return this.requestService.createImage({
							requestId,
							iterationNumber: iteration,
							s3Url,
							s3Key,
							promptUsed: optimizedPrompt,
							generationParams: {
								aspectRatio: imageParams.aspectRatio,
								quality: imageParams.quality,
							},
							mimeType: img.mimeType,
							fileSizeBytes: img.imageData.length,
						});
					}),
				);
				const uploadErrors = uploadSettled.filter(
					(r): r is PromiseRejectedResult => r.status === 'rejected',
				);
				if (uploadErrors.length > 0) {
					this.logger.error(
						`[S3_UPLOAD_FAIL] ${uploadErrors.length}/${generatedImages.length} uploads failed`,
					);
					throw uploadErrors[0].reason;
				}
				const imageRecords = uploadSettled.map(
					(r) => (r as PromiseFulfilledResult<GeneratedImage>).value,
				);

				this.logger.log(
					`[S3_UPLOAD_COMPLETE] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`ImagesUploaded: ${imageRecords.length} | ` +
						`Time: ${Date.now() - uploadStartTime}ms`,
				);

				// Update costs
				await this.requestService.updateCosts(requestId, {
					imageGenerations: imageCount,
				});

				// 3. Evaluate images
				this.logger.log(
					`[PHASE_EVALUATING] RequestID: ${requestId} | Iteration: ${iteration} - Starting image evaluation`,
				);
				await this.requestService.updateStatus(
					requestId,
					GenerationRequestStatus.EVALUATING,
				);
				this.generationEventsService.emit(
					requestId,
					GenerationEventType.STATUS_CHANGE,
					{ status: GenerationRequestStatus.EVALUATING, iteration },
				);

				const evalStartTime = Date.now();
				const evaluationsByImage = new Map();

				// Build iteration context for judges
				const iterationContext: IterationContext = {
					currentIteration: iteration,
					maxIterations: request.maxIterations,
					previousScores: latestIterations.map(
						(iter) => iter.aggregateScore,
					),
				};

				// Evaluate all images in parallel for faster throughput
				// Use Promise.allSettled to avoid unhandled rejections when one fails before others complete
				const evalSettled = await Promise.allSettled(
					imageRecords.map(async (image) => {
						this.logger.debug(
							`[EVAL_IMAGE] RequestID: ${requestId} | Iteration: ${iteration} | ` +
								`ImageID: ${image.id} - Evaluating with ${agentsWithDocs.filter(Boolean).length} judges`,
						);
						const evaluations =
							await this.evaluationService.evaluateWithAllJudges(
								agentsWithDocs.filter(Boolean) as any[],
								image,
								request.brief,
								request.organizationId,
								iterationContext,
							);

						// Log individual scores
						const scores = evaluations.map(
							(e) => `${e.agentName}:${e.overallScore}`,
						);
						this.logger.debug(
							`[EVAL_SCORES] RequestID: ${requestId} | Iteration: ${iteration} | ` +
								`ImageID: ${image.id} | Scores: [${scores.join(', ')}]`,
						);

						return [image.id, evaluations] as const;
					}),
				);
				const evalErrors = evalSettled.filter(
					(r): r is PromiseRejectedResult => r.status === 'rejected',
				);
				if (evalErrors.length > 0) {
					this.logger.error(
						`[EVAL_PARALLEL_FAIL] ${evalErrors.length}/${imageRecords.length} evaluations failed`,
					);
					throw evalErrors[0].reason;
				}
				const evaluationEntries = evalSettled.map(
					(r) =>
						(
							r as PromiseFulfilledResult<
								readonly [string, EvaluationResult[]]
							>
						).value,
				);
				for (const [imageId, evaluations] of evaluationEntries) {
					evaluationsByImage.set(imageId, evaluations);
				}

				this.logger.log(
					`[EVAL_COMPLETE] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`ImagesEvaluated: ${imageRecords.length} | ` +
						`Time: ${Date.now() - evalStartTime}ms`,
				);

				// Aggregate and rank
				const aggregated =
					this.evaluationService.aggregateEvaluations(
						evaluationsByImage,
					);

				if (aggregated.length === 0) {
					const errorDetails =
						`RequestID: ${requestId} | Iteration: ${iteration}/${request.maxIterations} | ` +
						`ImagesGenerated: ${imageRecords.length} | ` +
						`JudgeCount: ${judgeAgents.length} | ` +
						`EvaluationMapSize: ${evaluationsByImage.size}`;
					this.logger.error(
						`[EVAL_ERROR] No images evaluated - ${errorDetails}`,
					);
					throw new Error(
						`No images were evaluated after iteration ${iteration}. ` +
							`Generated ${imageRecords.length} images with ${judgeAgents.length} judges, ` +
							`but aggregation returned 0 results. This may indicate an evaluation failure.`,
					);
				}

				const topImage = aggregated[0];
				this.logger.log(
					`[AGGREGATION_RESULT] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`TopImageID: ${topImage.imageId} | ` +
						`AggregateScore: ${topImage.aggregateScore.toFixed(2)} | ` +
						`Ranking: ${aggregated.map((a) => `${a.imageId.substring(0, 8)}:${a.aggregateScore.toFixed(1)}`).join(', ')}`,
				);

				// Create iteration snapshot
				const iterationSnapshot: IterationSnapshot = {
					iterationNumber: iteration,
					optimizedPrompt,
					selectedImageId: topImage.imageId,
					aggregateScore: topImage.aggregateScore,
					evaluations: this.evaluationService.toSnapshots(
						topImage.evaluations,
					),
					createdAt: new Date(),
					mode: strategy === 'edit' ? 'edit' : 'regeneration',
					editSourceImageId:
						strategy === 'edit' ? editSourceImageId : undefined,
					consecutiveEditCount,
				};

				await this.requestService.addIteration(
					requestId,
					iterationSnapshot,
				);

				// Save debug iteration data
				const debugIterationData: DebugIterationData = {
					iterationNumber: iteration,
					optimizedPrompt,
					images: imageRecords.map((img, idx) => ({
						imageId: img.id,
						filePath: debugImagePaths[idx] ?? undefined,
						mimeType: img.mimeType,
						sizeBytes: img.fileSizeBytes ?? 0,
					})),
					evaluations: topImage.evaluations.map((e) => ({
						agentId: e.agentId,
						agentName: e.agentName,
						score: e.overallScore,
						categoryScores: e.categoryScores,
						feedback: e.feedback,
						topIssue: e.topIssue,
						whatWorked: e.whatWorked,
						promptInstructions: e.promptInstructions,
					})),
					aggregateScore: topImage.aggregateScore,
					selectedImageId: topImage.imageId,
					timestamp: new Date().toISOString(),
				};
				this.debugOutputService.saveIteration(
					requestId,
					debugIterationData,
				);

				// Track iterations locally to avoid stale data
				latestIterations.push(iterationSnapshot);

				// Emit SSE event for iteration completion
				this.generationEventsService.emit(
					requestId,
					GenerationEventType.ITERATION_COMPLETE,
					{
						iteration: iterationSnapshot,
						imageIds: imageRecords.map((img) => img.id),
						strategy,
						generationMode: request.generationMode,
					},
				);

				// Extract and accumulate negative prompts from TOP_ISSUE feedback
				const accumulatedNegatives =
					this.extractNegativePromptsFromEvaluations(
						topImage.evaluations,
						request.negativePrompts,
					);
				// Only update if there's a meaningful change (not just undefined -> empty string)
				const existingNormalized = request.negativePrompts || '';
				if (accumulatedNegatives !== existingNormalized) {
					request.negativePrompts = accumulatedNegatives;
					await this.requestService.updateNegativePrompts(
						requestId,
						accumulatedNegatives,
					);
					this.logger.log(
						`[NEGATIVE_PROMPTS_UPDATED] RequestID: ${requestId} | Iteration: ${iteration} | ` +
							`NewLength: ${accumulatedNegatives.length} chars`,
					);
				}

				// Track best result (use >= so ties go to the latest iteration's image)
				const previousBestScore = bestScore;
				if (!bestImageId || topImage.aggregateScore >= bestScore) {
					bestScore = topImage.aggregateScore;
					bestImageId = topImage.imageId;
					this.logger.log(
						`[NEW_BEST] RequestID: ${requestId} | Iteration: ${iteration} | ` +
							`NewBestScore: ${bestScore.toFixed(2)} | ` +
							`PreviousBest: ${previousBestScore.toFixed(2)} | ` +
							`BestImageID: ${bestImageId}`,
					);
				}

				completedIterations = iteration;
				const iterationTime = Date.now() - iterationStartTime;
				const negativeLines = (request.negativePrompts || '')
					.split('\n')
					.filter((l: string) => l.trim()).length;
				this.logger.log(
					`[ITERATION_COMPLETE] RequestID: ${requestId} | ` +
						`Iteration: ${iteration}/${request.maxIterations} | ` +
						`Score: ${topImage.aggregateScore.toFixed(2)} | ` +
						`BestScore: ${bestScore.toFixed(2)} | ` +
						`Strategy: ${strategy} | ` +
						`Time: ${iterationTime}ms`,
				);
				this.logger.log(
					`[ITERATION_TIMING] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`Strategy: ${strategy} | ` +
						`TotalTime: ${iterationTime}ms | ` +
						`NegativePrompts: ${negativeLines}`,
				);

				// 4. Check termination conditions
				this.logger.debug(
					`[TERMINATION_CHECK] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`Score: ${topImage.aggregateScore.toFixed(2)} | ` +
						`Threshold: ${request.threshold}`,
				);

				if (topImage.aggregateScore >= request.threshold) {
					// Success - met threshold
					const totalTime = Date.now() - startTime;
					await this.requestService.complete(
						requestId,
						topImage.imageId,
						CompletionReason.SUCCESS,
					);
					this.generationEventsService.emit(
						requestId,
						GenerationEventType.COMPLETED,
						{
							status: GenerationRequestStatus.COMPLETED,
							completionReason: CompletionReason.SUCCESS,
							finalScore: topImage.aggregateScore,
							finalImageId: topImage.imageId,
							totalIterations: iteration,
						},
					);
					this.debugOutputService.saveFinalResult(
						requestId,
						'completed',
						'THRESHOLD_MET',
						topImage.aggregateScore,
						topImage.imageId,
						totalTime,
					);
					this.logger.log(
						`[ORCHESTRATION_SUCCESS] RequestID: ${requestId} | ` +
							`Reason: THRESHOLD_MET | ` +
							`FinalScore: ${topImage.aggregateScore.toFixed(2)} | ` +
							`Threshold: ${request.threshold} | ` +
							`Iterations: ${iteration} | ` +
							`TotalTime: ${totalTime}ms`,
					);
					logOrchestrationSummary(
						'THRESHOLD_MET',
						topImage.aggregateScore,
						completedIterations,
						totalTime,
						totalRetries,
						request.negativePrompts,
					);
					return;
				}

				// Refresh request to check for plateauing
				const updatedRequest = await this.requestService.findOne({
					where: { id: requestId },
				});

				if (
					updatedRequest?.isScorePlateauing(
						request.imageParams?.plateauWindowSize,
						request.imageParams?.plateauThreshold,
					)
				) {
					const totalTime = Date.now() - startTime;
					await this.requestService.complete(
						requestId,
						bestImageId!,
						CompletionReason.DIMINISHING_RETURNS,
					);
					this.generationEventsService.emit(
						requestId,
						GenerationEventType.COMPLETED,
						{
							status: GenerationRequestStatus.COMPLETED,
							completionReason:
								CompletionReason.DIMINISHING_RETURNS,
							finalScore: bestScore,
							finalImageId: bestImageId,
							totalIterations: iteration,
						},
					);
					this.debugOutputService.saveFinalResult(
						requestId,
						'completed',
						'DIMINISHING_RETURNS',
						bestScore,
						bestImageId!,
						totalTime,
					);
					this.logger.log(
						`[ORCHESTRATION_COMPLETE] RequestID: ${requestId} | ` +
							`Reason: DIMINISHING_RETURNS | ` +
							`FinalScore: ${bestScore.toFixed(2)} | ` +
							`Iterations: ${iteration} | ` +
							`TotalTime: ${totalTime}ms`,
					);
					logOrchestrationSummary(
						'DIMINISHING_RETURNS',
						bestScore,
						completedIterations,
						totalTime,
						totalRetries,
						request.negativePrompts,
					);
					return;
				}

				this.logger.debug(
					`[CONTINUE_ITERATION] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`ScoreBelowThreshold: ${topImage.aggregateScore.toFixed(2)} < ${request.threshold} | ` +
						`NotPlateauing: true`,
				);
			}

			// Max iterations reached
			const totalTime = Date.now() - startTime;
			await this.requestService.complete(
				requestId,
				bestImageId!,
				CompletionReason.MAX_RETRIES_REACHED,
			);
			this.generationEventsService.emit(
				requestId,
				GenerationEventType.COMPLETED,
				{
					status: GenerationRequestStatus.COMPLETED,
					completionReason: CompletionReason.MAX_RETRIES_REACHED,
					finalScore: bestScore,
					finalImageId: bestImageId,
					totalIterations: request.maxIterations,
				},
			);
			this.debugOutputService.saveFinalResult(
				requestId,
				'completed',
				'MAX_ITERATIONS_REACHED',
				bestScore,
				bestImageId!,
				totalTime,
			);
			this.logger.log(
				`[ORCHESTRATION_COMPLETE] RequestID: ${requestId} | ` +
					`Reason: MAX_ITERATIONS_REACHED | ` +
					`FinalScore: ${bestScore.toFixed(2)} | ` +
					`Iterations: ${request.maxIterations} | ` +
					`TotalTime: ${totalTime}ms`,
			);
			logOrchestrationSummary(
				'MAX_ITERATIONS_REACHED',
				bestScore,
				completedIterations,
				totalTime,
				totalRetries,
				request.negativePrompts,
			);
		} catch (error) {
			const totalTime = Date.now() - startTime;
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`[ORCHESTRATION_FAILED] RequestID: ${requestId} | ` +
					`Error: ${message} | ` +
					`TotalTime: ${totalTime}ms`,
			);
			logOrchestrationSummary(
				'ERROR',
				bestScore,
				completedIterations,
				totalTime,
				totalRetries,
				request.negativePrompts,
			);
			await this.requestService.fail(requestId, message);
			this.generationEventsService.emit(
				requestId,
				GenerationEventType.FAILED,
				{
					status: GenerationRequestStatus.FAILED,
					error: message,
					bestScore,
				},
			);
			throw error;
		}
	}

	/**
	 * Retry a function with exponential backoff
	 * @param fn Function to retry
	 * @param label Operation label for logging
	 * @param maxRetries Maximum retry attempts (default: 3)
	 * @param baseDelayMs Base delay in ms (default: 1000)
	 * @param onRetry Optional callback on each retry
	 * @param requestId Optional request ID for correlation logging (Issue #5)
	 */
	private async withRetry<T>(
		fn: () => Promise<T>,
		label: string,
		maxRetries: number = 3,
		baseDelayMs: number = 1000,
		onRetry?: () => void,
		requestId?: string,
	): Promise<T> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Unknown';
				if (attempt === maxRetries) throw error;
				const delay = baseDelayMs * Math.pow(2, attempt - 1);
				const requestPrefix = requestId
					? `RequestID: ${requestId} | `
					: '';
				this.logger.warn(
					`[RETRY] ${requestPrefix}${label} | Attempt: ${attempt}/${maxRetries} | ` +
						`Error: ${message} | RetryIn: ${delay}ms`,
				);
				onRetry?.();
				await new Promise((r) => setTimeout(r, delay));
			}
		}
		throw new Error('Unreachable');
	}

	/**
	 * Upload a buffer to S3 with retry
	 */
	private async uploadToS3(
		key: string,
		buffer: Buffer,
		contentType: string,
		onRetry?: () => void,
		requestId?: string,
	): Promise<void> {
		// Fix #3: Validate AWS_S3_BUCKET env var
		const bucketName = process.env.AWS_S3_BUCKET;
		if (!bucketName) {
			throw new Error(
				'AWS_S3_BUCKET environment variable is not configured',
			);
		}

		try {
			await this.withRetry(
				() =>
					this.s3
						.putObject({
							Bucket: bucketName,
							Key: key,
							Body: buffer,
							ContentType: contentType,
						})
						.promise(),
				`S3Upload:${key}`,
				3,
				1000,
				onRetry,
				requestId,
			);
		} catch (error) {
			// Fix #3: Provide specific error messages for different S3 failures
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			if (message.includes('AccessDenied')) {
				throw new Error(
					`Access denied to S3 bucket: ${bucketName}. Check AWS credentials and bucket permissions.`,
				);
			} else if (message.includes('NoSuchBucket')) {
				throw new Error(
					`S3 bucket not found: ${bucketName}. Verify AWS_S3_BUCKET configuration.`,
				);
			} else if (message.includes('EntityTooLarge')) {
				throw new Error(
					`File too large for S3 upload: ${buffer.length} bytes`,
				);
			}
			// Re-throw with original error for debugging
			throw new Error(`Failed to upload to S3 (${key}): ${message}`);
		}
	}

	/**
	 * Extract negative prompts from TOP_ISSUE feedback in evaluations
	 * Accumulates unique problems from judge feedback to avoid repeating mistakes
	 */
	private extractNegativePromptsFromEvaluations(
		evaluations: EvaluationResult[],
		existingNegatives?: string,
	): string {
		// Severity priority for sorting
		const severityOrder: Record<string, number> = {
			critical: 0,
			major: 1,
			moderate: 2,
			minor: 3,
		};

		// Extract issues with severity from evaluations
		const issues = evaluations
			.filter((e) => e.topIssue?.problem)
			.map((e) => ({
				problem: e.topIssue!.problem,
				fix: e.topIssue!.fix,
				severity: e.topIssue!.severity || 'moderate',
				agentName: e.agentName,
			}))
			.sort((a, b) => {
				// Default to 'moderate' priority (2) for unknown severities
				const aOrder = severityOrder[a.severity] ?? 2;
				const bOrder = severityOrder[b.severity] ?? 2;
				return aOrder - bOrder;
			});

		if (issues.length === 0) {
			return existingNegatives || '';
		}

		// Parse existing negatives to avoid duplicates
		// Format is: "AVOID: [problem] - [fix] (from [agent])"
		const existingSet = new Set<string>();
		if (existingNegatives) {
			existingNegatives.split('\n').forEach((line) => {
				// Extract just the problem portion from formatted lines
				// Format: "AVOID: [problem] - [fix] (from [agent])"
				const avoidMatch = line.match(/^AVOID:\s*(.+?)\s*-\s*.+$/i);
				if (avoidMatch) {
					existingSet.add(avoidMatch[1].toLowerCase().trim());
				} else {
					// Fallback for non-formatted lines (legacy data)
					const cleaned = line
						.replace(/^-\s*/, '')
						.trim()
						.toLowerCase();
					if (cleaned) {
						existingSet.add(cleaned);
					}
				}
			});
		}

		// Take top 3 issues, deduplicate
		const newIssues: string[] = [];
		for (const issue of issues) {
			if (newIssues.length >= 3) break;

			const normalized = issue.problem.toLowerCase().trim();
			if (!existingSet.has(normalized)) {
				// Format: "AVOID: [problem] - [fix] (from [agent])"
				const entry = `AVOID: ${issue.problem} - ${issue.fix} (from ${issue.agentName})`;
				newIssues.push(entry);
				existingSet.add(normalized);
			}
		}

		if (newIssues.length === 0) {
			return existingNegatives || '';
		}

		// Combine existing and new negatives
		const combined = existingNegatives
			? `${existingNegatives}\n${newIssues.join('\n')}`
			: newIssues.join('\n');

		// Cap total negative prompts to prevent unbounded growth
		const MAX_NEGATIVE_PROMPTS = 10;
		const lines = combined.split('\n').filter((l) => l.trim());
		const capped =
			lines.length > MAX_NEGATIVE_PROMPTS
				? lines.slice(-MAX_NEGATIVE_PROMPTS).join('\n')
				: combined;

		this.logger.debug(
			`[NEGATIVE_EXTRACT] Found ${issues.length} issues, added ${newIssues.length} new negatives | ` +
				`TotalLines: ${lines.length} | Capped: ${lines.length > MAX_NEGATIVE_PROMPTS}`,
		);

		return capped;
	}

	/**
	 * Select the iteration strategy (regenerate vs edit) based on mode and heuristics
	 */
	private selectIterationStrategy(
		mode: GenerationMode,
		iteration: number,
		currentScore: number,
		previousScores: number[],
		topIssueSeverity: string | undefined,
		consecutiveEditCount: number,
	): 'regenerate' | 'edit' {
		// Forced modes
		if (mode === GenerationMode.REGENERATION) return 'regenerate';
		if (mode === GenerationMode.EDIT && iteration > 1) {
			// Even in pure edit mode, warn after 5 consecutive edits
			if (consecutiveEditCount >= 5) {
				this.logger.warn(
					`[EDIT_DEGRADATION] ${consecutiveEditCount} consecutive edits — quality may degrade`,
				);
			}
			return 'edit';
		}

		// Mixed mode: adaptive strategy
		// Always regenerate iteration 1 (no image to edit yet)
		if (iteration <= 1) return 'regenerate';

		// Regenerate if score is too low (bad foundation, editing won't help)
		if (currentScore < 50) return 'regenerate';

		// Regenerate after 3 consecutive edits (prevent degradation — research Section 7)
		if (consecutiveEditCount >= 3) return 'regenerate';

		// Regenerate if TOP_ISSUE is critical or major (fundamental problem needs fresh start)
		if (topIssueSeverity === 'critical' || topIssueSeverity === 'major') {
			return 'regenerate';
		}

		// Edit mode for moderate/minor fixes when score is decent
		if (
			currentScore >= 50 &&
			(topIssueSeverity === 'moderate' || topIssueSeverity === 'minor')
		) {
			return 'edit';
		}

		// Edit mode for plateau breaking
		const recentScores = previousScores.slice(-3);
		const isPlateauing =
			recentScores.length >= 3 &&
			Math.max(...recentScores) - Math.min(...recentScores) < 3;
		if (isPlateauing && currentScore >= 65) return 'edit';

		// Default: regenerate
		return 'regenerate';
	}

	/**
	 * Download an image from S3 and return as base64 string
	 * @param imageId Image ID to download
	 * @param organizationId Organization ID for access validation (Fix #2: prevents cross-org access)
	 */
	private async downloadImageAsBase64(
		imageId: string,
		organizationId: string,
	): Promise<string> {
		// Fix #2: Organization scoping is already applied via getImage()
		const image = await this.requestService.getImage(
			imageId,
			organizationId,
		);
		if (!image?.s3Key) {
			throw new Error(
				`Image ${imageId} not found or access denied for organization ${organizationId}`,
			);
		}

		this.logger.debug(
			`[EDIT_DOWNLOAD] Downloading image ${imageId} from S3 | OrgID: ${organizationId}`,
		);

		// Fix #3: Validate AWS_S3_BUCKET env var
		const bucketName = process.env.AWS_S3_BUCKET;
		if (!bucketName) {
			throw new Error(
				'AWS_S3_BUCKET environment variable is not configured',
			);
		}

		let s3Object;
		try {
			s3Object = await this.s3
				.getObject({
					Bucket: bucketName,
					Key: image.s3Key,
				})
				.promise();
		} catch (error) {
			// Fix #3: Provide specific error messages for different S3 failures
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			if (message.includes('NoSuchKey')) {
				throw new Error(`Image file not found in S3: ${image.s3Key}`);
			} else if (message.includes('AccessDenied')) {
				throw new Error(`Access denied to S3 bucket: ${bucketName}`);
			} else if (message.includes('NoSuchBucket')) {
				throw new Error(`S3 bucket not found: ${bucketName}`);
			}
			throw new Error(`Failed to download image from S3: ${message}`);
		}

		// Fix #4: Properly handle all AWS SDK body types (no unsafe 'as any' cast)
		const body = s3Object.Body;
		let buffer: Buffer;

		if (Buffer.isBuffer(body)) {
			buffer = body;
		} else if (body instanceof Uint8Array) {
			buffer = Buffer.from(body);
		} else if (typeof body === 'string') {
			buffer = Buffer.from(body, 'utf-8');
		} else if (body && typeof (body as any).read === 'function') {
			// Handle Readable stream (should not happen with .promise(), but defensive coding)
			throw new Error(
				'Unexpected Readable stream returned from S3 getObject',
			);
		} else {
			throw new Error(`Unexpected S3 body type: ${typeof body}`);
		}

		// Check size — keep under 2MB to avoid Gemini's automatic compression
		const sizeMB = buffer.length / (1024 * 1024);
		if (sizeMB > 2) {
			this.logger.warn(
				`[EDIT_SIZE_WARNING] Image ${imageId} is ${sizeMB.toFixed(1)}MB (recommended < 2MB)`,
			);
		}

		return buffer.toString('base64');
	}
}
