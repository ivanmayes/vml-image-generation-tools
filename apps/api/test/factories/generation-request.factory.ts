import { DataSource } from 'typeorm';
import {
	GenerationRequest,
	GenerationRequestStatus,
	GenerationMode,
} from '../../src/image-generation/entities/generation-request.entity';

let requestCounter = 0;

/**
 * Create and persist a real GenerationRequest entity.
 * Requires existing organizationId and at least one agentId for judgeIds.
 */
export async function createGenerationRequest(
	ds: DataSource,
	organizationId: string,
	judgeIds: string[],
	overrides: Partial<GenerationRequest> = {},
): Promise<GenerationRequest> {
	requestCounter++;
	const repo = ds.getRepository(GenerationRequest);

	const request = repo.create({
		organizationId,
		brief: `Test generation brief ${requestCounter}`,
		judgeIds,
		imageParams: { imagesPerGeneration: 3 },
		threshold: 75,
		maxIterations: 5,
		generationMode: GenerationMode.REGENERATION,
		status: GenerationRequestStatus.PENDING,
		currentIteration: 0,
		iterations: [],
		costs: {
			llmTokens: 0,
			imageGenerations: 0,
			embeddingTokens: 0,
			totalEstimatedCost: 0,
		},
		...overrides,
	});

	return repo.save(request);
}
