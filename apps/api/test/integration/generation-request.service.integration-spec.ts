import { DataSource, Repository } from 'typeorm';

import {
	GenerationRequest,
	GenerationRequestStatus,
	CompletionReason,
	GenerationMode,
	IterationSnapshot,
} from '../../src/image-generation/entities/generation-request.entity';
import { GeneratedImage } from '../../src/image-generation/entities/generated-image.entity';
import { GenerationRequestService } from '../../src/image-generation/generation-request/generation-request.service';
import { UserRole } from '../../src/user/user-role.enum';
import { UserContext } from '../../src/_core/interfaces/user-context.interface';
import { TestDatabaseManager } from '../test-database.config';
import {
	createOrganization,
	createUser,
	createAgent,
	createGenerationRequest,
} from '../factories';

/**
 * GenerationRequestService Integration Tests
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 */
describe('GenerationRequestService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let service: GenerationRequestService;
	let requestRepo: Repository<GenerationRequest>;
	let imageRepo: Repository<GeneratedImage>;

	beforeAll(async () => {
		console.log('[GenerationRequestService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[GenerationRequestService] DB connected.');

		requestRepo = ds.getRepository(GenerationRequest);
		imageRepo = ds.getRepository(GeneratedImage);
		service = new GenerationRequestService(requestRepo, imageRepo);
	});

	beforeEach(async () => {
		console.log('[GenerationRequestService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log(
			'[GenerationRequestService] Closing database connection...',
		);
		await dbManager.destroy();
	});

	// ── create() ──────────────────────────────────────────────────────────────

	describe('create()', () => {
		it('should create a generation request with agent and org references', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);

			const request = await service.create({
				organizationId: org.id,
				brief: 'Generate a product image',
				judgeIds: [agent.id],
				imageParams: { imagesPerGeneration: 3 },
				threshold: 85,
				maxIterations: 10,
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
			});

			expect(request.id).toBeDefined();
			expect(request.organizationId).toBe(org.id);
			expect(request.brief).toBe('Generate a product image');
			expect(request.judgeIds).toContain(agent.id);
			expect(request.status).toBe(GenerationRequestStatus.PENDING);

			const found = await requestRepo.findOne({
				where: { id: request.id },
			});
			expect(found).not.toBeNull();
		});
	});

	// ── findByOrganization() ──────────────────────────────────────────────────

	describe('findByOrganization()', () => {
		it('should return requests scoped by organization', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			await createGenerationRequest(ds, org.id, [agent.id]);
			await createGenerationRequest(ds, org.id, [agent.id]);

			const results = await service.findByOrganization(org.id);

			expect(results).toHaveLength(2);
		});

		it('should filter by status', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			await createGenerationRequest(ds, org.id, [agent.id], {
				status: GenerationRequestStatus.PENDING,
			});
			await createGenerationRequest(ds, org.id, [agent.id], {
				status: GenerationRequestStatus.COMPLETED,
			});

			const results = await service.findByOrganization(
				org.id,
				GenerationRequestStatus.PENDING,
			);

			expect(results).toHaveLength(1);
			expect(results[0].status).toBe(GenerationRequestStatus.PENDING);
		});

		it('should scope by userContext for non-admin users', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const user1 = await createUser(ds, org.id, { role: UserRole.User });
			const user2 = await createUser(ds, org.id, { role: UserRole.User });

			await createGenerationRequest(ds, org.id, [agent.id], {
				createdBy: user1.id!,
			});
			await createGenerationRequest(ds, org.id, [agent.id], {
				createdBy: user2.id!,
			});

			const ctx: UserContext = { userId: user1.id!, role: UserRole.User };
			const results = await service.findByOrganization(
				org.id,
				undefined,
				50,
				0,
				undefined,
				undefined,
				ctx,
			);

			expect(results).toHaveLength(1);
		});

		it('should respect limit and offset', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			for (let i = 0; i < 5; i++) {
				await createGenerationRequest(ds, org.id, [agent.id]);
			}

			const page1 = await service.findByOrganization(
				org.id,
				undefined,
				2,
				0,
			);
			const page2 = await service.findByOrganization(
				org.id,
				undefined,
				2,
				2,
			);

			expect(page1).toHaveLength(2);
			expect(page2).toHaveLength(2);
		});
	});

	// ── updateStatus() ────────────────────────────────────────────────────────

	describe('updateStatus()', () => {
		it('should transition status from PENDING to GENERATING', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			const updated = await service.updateStatus(
				request.id,
				GenerationRequestStatus.GENERATING,
			);

			expect(updated.status).toBe(GenerationRequestStatus.GENERATING);
		});

		it('should set completedAt for terminal states', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			const completed = await service.updateStatus(
				request.id,
				GenerationRequestStatus.COMPLETED,
			);

			expect(completed.completedAt).toBeDefined();
			expect(completed.completedAt).not.toBeNull();
		});

		it('should throw for non-existent request', async () => {
			await expect(
				service.updateStatus(
					'00000000-0000-4000-8000-000000000099',
					GenerationRequestStatus.COMPLETED,
				),
			).rejects.toThrow('not found');
		});
	});

	// ── addIteration() ────────────────────────────────────────────────────────

	describe('addIteration()', () => {
		it('should add iteration snapshots and update currentIteration', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			const iteration: IterationSnapshot = {
				iterationNumber: 1,
				optimizedPrompt: 'Optimized prompt for iteration 1',
				aggregateScore: 72,
				evaluations: [],
				createdAt: new Date(),
			};

			const updated = await service.addIteration(request.id, iteration);

			expect(updated.iterations).toHaveLength(1);
			expect(updated.currentIteration).toBe(1);
			expect(updated.iterations[0].aggregateScore).toBe(72);

			// Add second iteration
			const iteration2: IterationSnapshot = {
				iterationNumber: 2,
				optimizedPrompt: 'Improved prompt',
				aggregateScore: 85,
				evaluations: [],
				createdAt: new Date(),
			};

			const updated2 = await service.addIteration(request.id, iteration2);
			expect(updated2.iterations).toHaveLength(2);
			expect(updated2.currentIteration).toBe(2);
		});
	});

	// ── complete() / fail() / cancel() ────────────────────────────────────────

	describe('complete() / fail() / cancel()', () => {
		it('should mark as completed with finalImageId', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			const fakeImageId = '00000000-0000-4000-8000-000000000001';
			const completed = await service.complete(
				request.id,
				fakeImageId,
				CompletionReason.SUCCESS,
			);

			expect(completed.status).toBe(GenerationRequestStatus.COMPLETED);
			expect(completed.finalImageId).toBe(fakeImageId);
			expect(completed.completionReason).toBe(CompletionReason.SUCCESS);
			expect(completed.completedAt).toBeDefined();
		});

		it('should mark as failed with error message', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			const failed = await service.fail(request.id, 'API quota exceeded');

			expect(failed.status).toBe(GenerationRequestStatus.FAILED);
			expect(failed.errorMessage).toBe('API quota exceeded');
			expect(failed.completionReason).toBe(CompletionReason.ERROR);
		});

		it('should mark as cancelled', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			const cancelled = await service.cancel(request.id);

			expect(cancelled.status).toBe(GenerationRequestStatus.CANCELLED);
			expect(cancelled.completionReason).toBe(CompletionReason.CANCELLED);
		});
	});

	// ── Image CRUD ────────────────────────────────────────────────────────────

	describe('createImage() / getImage() / getImagesByRequest()', () => {
		it('should create and retrieve an image', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			const image = await service.createImage({
				requestId: request.id,
				iterationNumber: 1,
				s3Url: 'https://s3.example.com/images/test.jpg',
				s3Key: 'images/test.jpg',
				promptUsed: 'A test prompt',
				generationParams: {},
				mimeType: 'image/jpeg',
			});

			expect(image.id).toBeDefined();
			expect(image.requestId).toBe(request.id);

			const found = await service.getImage(image.id);
			expect(found).not.toBeNull();
			expect(found!.s3Url).toBe('https://s3.example.com/images/test.jpg');
		});

		it('should get images by request ID', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			await service.createImage({
				requestId: request.id,
				iterationNumber: 1,
				s3Url: 'https://s3.example.com/1.jpg',
				s3Key: 'images/1.jpg',
				promptUsed: 'Prompt 1',
				generationParams: {},
				mimeType: 'image/jpeg',
			});
			await service.createImage({
				requestId: request.id,
				iterationNumber: 1,
				s3Url: 'https://s3.example.com/2.jpg',
				s3Key: 'images/2.jpg',
				promptUsed: 'Prompt 2',
				generationParams: {},
				mimeType: 'image/jpeg',
			});

			const images = await service.getImagesByRequest(request.id);
			expect(images).toHaveLength(2);
		});

		it('should scope image access by organization', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const agent1 = await createAgent(ds, org1.id);
			const request1 = await createGenerationRequest(ds, org1.id, [
				agent1.id,
			]);

			const image = await service.createImage({
				requestId: request1.id,
				iterationNumber: 1,
				s3Url: 'https://s3.example.com/org1.jpg',
				s3Key: 'images/org1.jpg',
				promptUsed: 'Org1 prompt',
				generationParams: {},
				mimeType: 'image/jpeg',
			});

			// Org1 can access
			const found1 = await service.getImage(image.id, org1.id);
			expect(found1).not.toBeNull();

			// Org2 cannot access
			const found2 = await service.getImage(image.id, org2.id);
			expect(found2).toBeNull();
		});
	});

	// ── getPendingRequests() ──────────────────────────────────────────────────

	describe('getPendingRequests()', () => {
		it('should return only pending requests ordered by createdAt ASC', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);

			await createGenerationRequest(ds, org.id, [agent.id], {
				status: GenerationRequestStatus.PENDING,
			});
			await createGenerationRequest(ds, org.id, [agent.id], {
				status: GenerationRequestStatus.COMPLETED,
			});
			await createGenerationRequest(ds, org.id, [agent.id], {
				status: GenerationRequestStatus.PENDING,
			});

			const pending = await service.getPendingRequests();
			expect(pending).toHaveLength(2);
			pending.forEach((r) =>
				expect(r.status).toBe(GenerationRequestStatus.PENDING),
			);
		});
	});

	// ── prepareForContinuation() ──────────────────────────────────────────────

	describe('prepareForContinuation()', () => {
		it('should reset terminal state and extend iterations budget', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(
				ds,
				org.id,
				[agent.id],
				{
					status: GenerationRequestStatus.COMPLETED,
					currentIteration: 5,
					maxIterations: 5,
					finalImageId: '00000000-0000-4000-8000-000000000002',
					completionReason: CompletionReason.MAX_RETRIES_REACHED,
				},
			);

			const continued = await service.prepareForContinuation(
				request.id,
				5,
			);

			expect(continued.status).toBe(GenerationRequestStatus.PENDING);
			expect(continued.maxIterations).toBe(10); // 5 + 5
			expect(continued.completedAt).toBeNull();
		});

		it('should swap judges when provided', async () => {
			const org = await createOrganization(ds);
			const agent1 = await createAgent(ds, org.id);
			const agent2 = await createAgent(ds, org.id);
			const request = await createGenerationRequest(
				ds,
				org.id,
				[agent1.id],
				{
					status: GenerationRequestStatus.COMPLETED,
				},
			);

			const continued = await service.prepareForContinuation(
				request.id,
				3,
				[agent2.id],
			);

			expect(continued.judgeIds).toEqual([agent2.id]);
		});
	});

	// ── updateCosts() ─────────────────────────────────────────────────────────

	describe('updateCosts()', () => {
		it('should accumulate costs across multiple calls', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const request = await createGenerationRequest(ds, org.id, [
				agent.id,
			]);

			await service.updateCosts(request.id, {
				llmTokens: 100,
				imageGenerations: 1,
			});
			const updated = await service.updateCosts(request.id, {
				llmTokens: 200,
				imageGenerations: 2,
			});

			expect(updated.costs.llmTokens).toBe(300);
			expect(updated.costs.imageGenerations).toBe(3);
		});
	});

	// ── Cross-org isolation ───────────────────────────────────────────────────

	describe('Cross-org isolation', () => {
		it('should not return requests from different organizations', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const agent1 = await createAgent(ds, org1.id);
			const agent2 = await createAgent(ds, org2.id);

			await createGenerationRequest(ds, org1.id, [agent1.id]);
			await createGenerationRequest(ds, org2.id, [agent2.id]);

			const org1Results = await service.findByOrganization(org1.id);
			const org2Results = await service.findByOrganization(org2.id);

			expect(org1Results).toHaveLength(1);
			expect(org2Results).toHaveLength(1);
			expect(org1Results[0].organizationId).toBe(org1.id);
			expect(org2Results[0].organizationId).toBe(org2.id);
		});
	});
});
