import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as AWS from 'aws-sdk';

import { AgentService } from '../agent/agent.service';
import { GenerationRequestService } from '../generation-request/generation-request.service';
import { PromptOptimizerService } from '../prompt-optimizer/prompt-optimizer.service';
import {
	GenerationRequestStatus,
	CompletionReason,
	IterationSnapshot,
	GeneratedImage,
} from '../entities';
import { JobQueueService } from '../jobs/job-queue.service';

import { GeminiImageService } from './gemini-image.service';
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

		this.logger.log(
			`[REQUEST_LOADED] RequestID: ${requestId} | ` +
				`Brief: "${request.brief.substring(0, 50)}..." | ` +
				`MaxIterations: ${request.maxIterations} | ` +
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

		this.logger.log(
			`[AGENTS_LOADED] RequestID: ${requestId} - Loaded ${agents.length} agents: ` +
				agents.map((a) => `${a.name}(w:${a.scoringWeight})`).join(', '),
		);

		// Initialize debug output session if enabled
		this.debugOutputService.initSession(
			requestId,
			request.organizationId,
			request.brief,
			request.threshold,
			request.maxIterations,
			agents.map((a) => ({
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
			agents.map((a) =>
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
		let completedIterations = 0;
		let bestScore = 0;

		try {
			let currentPrompt: string | undefined;
			const previousPrompts: string[] = [];
			let bestImageId: string | undefined;
			const latestIterations: typeof request.iterations = [];

			// Run iterations
			for (
				let iteration = 1;
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
					{ status: GenerationRequestStatus.OPTIMIZING, iteration },
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

				// Get judge feedback from previous iteration (use local tracking)
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

				this.logger.debug(
					`[OPTIMIZATION_INPUT] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`FeedbackCount: ${judgeFeedback.length} | ` +
						`PreviousPrompts: ${previousPrompts.length} | ` +
						`HasNegativePrompts: ${!!request.negativePrompts}`,
				);

				const optimizeStartTime = Date.now();
				let optimizedPrompt: string;

				if (request.initialPrompt && iteration === 1) {
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
				this.logger.debug(
					`[OPTIMIZED_PROMPT] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`Prompt: "${optimizedPrompt.substring(0, 100)}..."`,
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
					{ status: GenerationRequestStatus.GENERATING, iteration },
				);

				// Safely access imageParams with defaults
				const imageParams = request.imageParams ?? {
					imagesPerGeneration: 3,
				};
				const imageCount = imageParams.imagesPerGeneration || 3;
				this.logger.debug(
					`[GENERATION_CONFIG] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`ImageCount: ${imageCount} | ` +
						`AspectRatio: ${imageParams.aspectRatio ?? 'default'} | ` +
						`Quality: ${imageParams.quality ?? 'default'}`,
				);

				const genStartTime = Date.now();
				const generatedImages = await this.withRetry(
					() =>
						this.geminiImageService.generateImages(
							optimizedPrompt,
							imageCount,
							{
								aspectRatio: imageParams.aspectRatio,
								quality: imageParams.quality,
								referenceImageUrls: request.referenceImageUrls,
							},
						),
					`ImageGeneration:iter${iteration}`,
					3,
					1000,
					() => {
						totalRetries++;
					},
				);

				this.logger.log(
					`[GENERATION_COMPLETE] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`ImagesGenerated: ${generatedImages.length} | ` +
						`Time: ${Date.now() - genStartTime}ms`,
				);

				// Upload images to S3 and create database records
				this.logger.debug(
					`[S3_UPLOAD_START] RequestID: ${requestId} | Iteration: ${iteration} - Uploading ${generatedImages.length} images`,
				);
				const uploadStartTime = Date.now();
				const debugImagePaths: (string | null)[] = [];
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
					this.logger.error(
						`[EVAL_ERROR] RequestID: ${requestId} | Iteration: ${iteration} - No images evaluated`,
					);
					throw new Error(
						'No images were evaluated - image generation may have failed',
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
				// Phase durations: each phase starts where the previous ended
				const optimizeMs = genStartTime - ragStartTime;
				const generateMs = uploadStartTime - genStartTime;
				const uploadMs = evalStartTime - uploadStartTime;
				const evalMs =
					iterationTime - optimizeMs - generateMs - uploadMs;
				const negativeLines = (request.negativePrompts || '')
					.split('\n')
					.filter((l: string) => l.trim()).length;
				this.logger.log(
					`[ITERATION_COMPLETE] RequestID: ${requestId} | ` +
						`Iteration: ${iteration}/${request.maxIterations} | ` +
						`Score: ${topImage.aggregateScore.toFixed(2)} | ` +
						`BestScore: ${bestScore.toFixed(2)} | ` +
						`Time: ${iterationTime}ms`,
				);
				this.logger.log(
					`[ITERATION_TIMING] RequestID: ${requestId} | Iteration: ${iteration} | ` +
						`Optimize: ${optimizeMs}ms | ` +
						`Generate: ${generateMs}ms (${imageCount} parallel) | ` +
						`Upload: ${uploadMs}ms (${imageCount} parallel) | ` +
						`Evaluate: ${evalMs}ms (${imageCount}×${agents.length} parallel) | ` +
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
	 */
	private async withRetry<T>(
		fn: () => Promise<T>,
		label: string,
		maxRetries: number = 3,
		baseDelayMs: number = 1000,
		onRetry?: () => void,
	): Promise<T> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Unknown';
				if (attempt === maxRetries) throw error;
				const delay = baseDelayMs * Math.pow(2, attempt - 1);
				this.logger.warn(
					`[RETRY] ${label} | Attempt: ${attempt}/${maxRetries} | ` +
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
	): Promise<void> {
		await this.withRetry(
			() =>
				this.s3
					.putObject({
						Bucket: process.env.AWS_S3_BUCKET!,
						Key: key,
						Body: buffer,
						ContentType: contentType,
						ACL: 'public-read',
					})
					.promise(),
			`S3Upload:${key}`,
			3,
			1000,
			onRetry,
		);
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
}
