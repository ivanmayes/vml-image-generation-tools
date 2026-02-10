import { DataSource, Repository } from 'typeorm';

import {
	Agent,
	AgentStatus,
	AgentType,
	ModelTier,
	ThinkingLevel,
} from '../../src/agent/agent.entity';
import { AgentDocument } from '../../src/agent/agent-document.entity';
import { AgentService } from '../../src/agent/agent.service';
import { UserRole } from '../../src/user/user-role.enum';
import { UserContext } from '../../src/_core/interfaces/user-context.interface';
import { TestDatabaseManager } from '../test-database.config';
import { createOrganization, createUser, createAgent } from '../factories';

/**
 * AgentService Integration Tests
 *
 * Tests hit a REAL PostgreSQL database. Zero mocks.
 * Uses TestDatabaseManager for connection management.
 */
describe('AgentService (Integration)', () => {
	let dbManager: TestDatabaseManager;
	let ds: DataSource;
	let agentService: AgentService;
	let agentRepo: Repository<Agent>;
	let documentRepo: Repository<AgentDocument>;

	beforeAll(async () => {
		console.log('[AgentService] Initializing test database...');
		dbManager = new TestDatabaseManager();
		ds = await dbManager.initialize();
		console.log('[AgentService] DB connected. Schema synced.');

		agentRepo = ds.getRepository(Agent);
		documentRepo = ds.getRepository(AgentDocument);
		agentService = new AgentService(agentRepo, documentRepo);
	});

	beforeEach(async () => {
		console.log('[AgentService] Truncating tables...');
		await dbManager.reset();
	});

	afterAll(async () => {
		console.log('[AgentService] Closing database connection...');
		await dbManager.destroy();
	});

	// ── create() ──────────────────────────────────────────────────────────────

	describe('create()', () => {
		it('should create an agent with all fields persisted', async () => {
			const org = await createOrganization(ds);

			const agent = await agentService.create({
				organizationId: org.id,
				name: 'Integration Test Agent',
				systemPrompt: 'You are a test agent.',
				evaluationCategories: 'quality,composition',
				optimizationWeight: 60,
				scoringWeight: 40,
			});

			expect(agent.id).toBeDefined();
			expect(agent.organizationId).toBe(org.id);
			expect(agent.name).toBe('Integration Test Agent');
			expect(agent.systemPrompt).toBe('You are a test agent.');
			expect(agent.evaluationCategories).toBe('quality,composition');
			expect(agent.optimizationWeight).toBe(60);
			expect(agent.scoringWeight).toBe(40);
			expect(agent.canJudge).toBe(true); // default
			expect(agent.status).toBe(AgentStatus.ACTIVE); // default
			expect(agent.capabilities).toEqual([]); // default
			expect(agent.teamAgentIds).toEqual([]); // default
			expect(agent.ragConfig).toEqual({
				topK: 5,
				similarityThreshold: 0.7,
			}); // default

			// Verify actually in DB
			const found = await agentRepo.findOne({ where: { id: agent.id } });
			expect(found).not.toBeNull();
			expect(found!.name).toBe('Integration Test Agent');
		});

		it('should create agent with all optional fields', async () => {
			const org = await createOrganization(ds);
			const user = await createUser(ds, org.id);

			const agent = await agentService.create({
				organizationId: org.id,
				name: 'Full Agent',
				systemPrompt: 'Full prompt',
				canJudge: false,
				description: 'A test description',
				teamPrompt: 'Team prompt',
				aiSummary: 'AI summary',
				agentType: AgentType.EXPERT,
				modelTier: ModelTier.PRO,
				thinkingLevel: ThinkingLevel.HIGH,
				status: AgentStatus.INACTIVE,
				capabilities: ['evaluate', 'summarize'],
				temperature: 0.8,
				maxTokens: 4096,
				avatarUrl: 'https://example.com/avatar.png',
				judgePrompt: 'Judge this image',
				createdBy: user.id!,
			});

			expect(agent.canJudge).toBe(false);
			expect(agent.description).toBe('A test description');
			expect(agent.agentType).toBe(AgentType.EXPERT);
			expect(agent.modelTier).toBe(ModelTier.PRO);
			expect(agent.thinkingLevel).toBe(ThinkingLevel.HIGH);
			expect(agent.status).toBe(AgentStatus.INACTIVE);
			expect(agent.capabilities).toEqual(['evaluate', 'summarize']);
			expect(agent.temperature).toBe(0.8);
			expect(agent.maxTokens).toBe(4096);
			expect(agent.judgePrompt).toBe('Judge this image');
			expect(agent.createdBy).toBe(user.id!);
		});
	});

	// ── findOne() ─────────────────────────────────────────────────────────────

	describe('findOne()', () => {
		it('should find an agent by ID', async () => {
			const org = await createOrganization(ds);
			const created = await createAgent(ds, org.id, { name: 'FindMe' });

			const found = await agentService.findOne({
				where: { id: created.id },
			});

			expect(found).not.toBeNull();
			expect(found!.id).toBe(created.id);
			expect(found!.name).toBe('FindMe');
		});

		it('should return null for non-existent agent', async () => {
			const found = await agentService.findOne({
				where: { id: '00000000-0000-4000-8000-000000000099' },
			});

			expect(found).toBeNull();
		});
	});

	// ── find() ────────────────────────────────────────────────────────────────

	describe('find()', () => {
		it('should list agents by organization', async () => {
			const org = await createOrganization(ds);
			await createAgent(ds, org.id, { name: 'Agent A' });
			await createAgent(ds, org.id, { name: 'Agent B' });

			const agents = await agentService.find({
				where: { organizationId: org.id },
			});

			expect(agents).toHaveLength(2);
			const names = agents.map((a) => a.name);
			expect(names).toContain('Agent A');
			expect(names).toContain('Agent B');
		});
	});

	// ── update() ──────────────────────────────────────────────────────────────

	describe('update()', () => {
		it('should partial-update only changed fields', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id, {
				name: 'Before',
				systemPrompt: 'Original prompt',
				optimizationWeight: 50,
			});

			const updated = await agentService.update(
				agent.id,
				{ name: 'After', optimizationWeight: 80 },
				org.id,
			);

			expect(updated.name).toBe('After');
			expect(updated.optimizationWeight).toBe(80);
			expect(updated.systemPrompt).toBe('Original prompt'); // unchanged
		});

		it('should throw NotFoundException for non-existent agent', async () => {
			const org = await createOrganization(ds);

			await expect(
				agentService.update(
					'00000000-0000-4000-8000-000000000099',
					{ name: 'X' },
					org.id,
				),
			).rejects.toThrow('not found');
		});

		it('should scope update by organizationId', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const agent = await createAgent(ds, org1.id, {
				name: 'Org1 Agent',
			});

			// Trying to update with org2 should fail
			await expect(
				agentService.update(agent.id, { name: 'Hacked' }, org2.id),
			).rejects.toThrow('not found');

			// Confirm original is untouched
			const found = await agentRepo.findOne({ where: { id: agent.id } });
			expect(found!.name).toBe('Org1 Agent');
		});
	});

	// ── softDelete() / restore() ──────────────────────────────────────────────

	describe('softDelete() / restore()', () => {
		it('should soft delete an agent (set deletedAt)', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);

			await agentService.softDelete(agent.id, org.id);

			// Not found without withDeleted
			const found = await agentRepo.findOne({ where: { id: agent.id } });
			expect(found).toBeNull();

			// Found with withDeleted
			const deleted = await agentRepo.findOne({
				where: { id: agent.id },
				withDeleted: true,
			});
			expect(deleted).not.toBeNull();
			expect(deleted!.deletedAt).not.toBeNull();
		});

		it('should restore a soft-deleted agent', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);

			await agentService.softDelete(agent.id, org.id);
			const restored = await agentService.restore(agent.id, org.id);

			expect(restored.deletedAt).toBeNull();

			// Should be findable again without withDeleted
			const found = await agentRepo.findOne({ where: { id: agent.id } });
			expect(found).not.toBeNull();
		});

		it('should remove deleted agent from other agents teamAgentIds', async () => {
			const org = await createOrganization(ds);
			const agentA = await createAgent(ds, org.id, { name: 'Agent A' });
			const agentB = await createAgent(ds, org.id, {
				name: 'Agent B',
				teamAgentIds: [agentA.id],
			});

			await agentService.softDelete(agentA.id, org.id);

			const refreshedB = await agentRepo.findOne({
				where: { id: agentB.id },
			});
			expect(refreshedB!.teamAgentIds).not.toContain(agentA.id);
		});
	});

	// ── findByOrganization() ──────────────────────────────────────────────────

	describe('findByOrganization()', () => {
		it('should return agents for a specific organization', async () => {
			const org = await createOrganization(ds);
			await createAgent(ds, org.id, { name: 'Org Agent 1' });
			await createAgent(ds, org.id, { name: 'Org Agent 2' });

			const agents = await agentService.findByOrganization(org.id);

			expect(agents).toHaveLength(2);
		});

		it('should filter by name query', async () => {
			const org = await createOrganization(ds);
			await createAgent(ds, org.id, { name: 'Alpha Judge' });
			await createAgent(ds, org.id, { name: 'Beta Agent' });

			const results = await agentService.findByOrganization(
				org.id,
				'Alpha',
			);

			expect(results).toHaveLength(1);
			expect(results[0].name).toBe('Alpha Judge');
		});

		it('should filter by status', async () => {
			const org = await createOrganization(ds);
			await createAgent(ds, org.id, {
				name: 'Active',
				status: AgentStatus.ACTIVE,
			});
			await createAgent(ds, org.id, {
				name: 'Inactive',
				status: AgentStatus.INACTIVE,
			});

			const results = await agentService.findByOrganization(
				org.id,
				undefined,
				undefined,
				undefined,
				AgentStatus.ACTIVE,
			);

			expect(results).toHaveLength(1);
			expect(results[0].name).toBe('Active');
		});

		it('should filter by canJudge', async () => {
			const org = await createOrganization(ds);
			await createAgent(ds, org.id, { name: 'Judge', canJudge: true });
			await createAgent(ds, org.id, {
				name: 'Non-Judge',
				canJudge: false,
			});

			const results = await agentService.findByOrganization(
				org.id,
				undefined,
				undefined,
				undefined,
				undefined,
				true,
			);

			expect(results).toHaveLength(1);
			expect(results[0].name).toBe('Judge');
		});

		it('should sort by specified field', async () => {
			const org = await createOrganization(ds);
			await createAgent(ds, org.id, { name: 'Zebra' });
			await createAgent(ds, org.id, { name: 'Alpha' });

			const results = await agentService.findByOrganization(
				org.id,
				undefined,
				'name',
				'ASC',
			);

			expect(results[0].name).toBe('Alpha');
			expect(results[1].name).toBe('Zebra');
		});

		it('should scope by userContext for non-admin users', async () => {
			const org = await createOrganization(ds);
			const user1 = await createUser(ds, org.id, { role: UserRole.User });
			const user2 = await createUser(ds, org.id, { role: UserRole.User });

			await createAgent(ds, org.id, {
				name: 'User1 Agent',
				createdBy: user1.id!,
			});
			await createAgent(ds, org.id, {
				name: 'User2 Agent',
				createdBy: user2.id!,
			});

			const userContext: UserContext = {
				userId: user1.id!,
				role: UserRole.User,
			};
			const results = await agentService.findByOrganization(
				org.id,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				userContext,
			);

			expect(results).toHaveLength(1);
			expect(results[0].name).toBe('User1 Agent');
		});

		it('should not exclude soft-deleted agents (they are excluded by WHERE clause)', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id, {
				name: 'WillBeDeleted',
			});
			await createAgent(ds, org.id, { name: 'StillActive' });

			await agentService.softDelete(agent.id, org.id);

			const results = await agentService.findByOrganization(org.id);
			expect(results).toHaveLength(1);
			expect(results[0].name).toBe('StillActive');
		});
	});

	// ── findOneWithTeam() ─────────────────────────────────────────────────────

	describe('findOneWithTeam()', () => {
		it('should return agent with team agents loaded', async () => {
			const org = await createOrganization(ds);
			const teamAgent = await createAgent(ds, org.id, {
				name: 'Team Member',
			});
			const leadAgent = await createAgent(ds, org.id, {
				name: 'Lead',
				teamAgentIds: [teamAgent.id],
			});

			const result = await agentService.findOneWithTeam(
				leadAgent.id,
				org.id,
			);

			expect(result.name).toBe('Lead');
			expect(result.teamAgents).toHaveLength(1);
			expect(result.teamAgents[0].name).toBe('Team Member');
		});

		it('should return empty teamAgents when none configured', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id, { teamAgentIds: [] });

			const result = await agentService.findOneWithTeam(agent.id, org.id);

			expect(result.teamAgents).toHaveLength(0);
		});

		it('should throw NotFoundException for non-existent agent', async () => {
			const org = await createOrganization(ds);

			await expect(
				agentService.findOneWithTeam(
					'00000000-0000-4000-8000-000000000099',
					org.id,
				),
			).rejects.toThrow('not found');
		});
	});

	// ── Document CRUD ─────────────────────────────────────────────────────────

	describe('addDocument() / getDocuments() / deleteDocument()', () => {
		it('should add and retrieve documents for an agent', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);

			const doc = await agentService.addDocument(agent.id, {
				filename: 'brandguide.pdf',
				mimeType: 'application/pdf',
				s3Key: 'docs/brandguide.pdf',
				version: 1,
				chunkCount: 0,
				chunks: [],
			});

			expect(doc.id).toBeDefined();
			expect(doc.agentId).toBe(agent.id);
			expect(doc.filename).toBe('brandguide.pdf');

			const docs = await agentService.getDocuments(agent.id);
			expect(docs).toHaveLength(1);
			expect(docs[0].filename).toBe('brandguide.pdf');
		});

		it('should delete a document', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);

			const doc = await agentService.addDocument(agent.id, {
				filename: 'toDelete.pdf',
				mimeType: 'application/pdf',
				s3Key: 'docs/toDelete.pdf',
				version: 1,
				chunkCount: 0,
				chunks: [],
			});

			await agentService.deleteDocument(doc.id);

			const docs = await agentService.getDocuments(agent.id);
			expect(docs).toHaveLength(0);
		});

		it('should support multiple documents per agent', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);

			await agentService.addDocument(agent.id, {
				filename: 'doc1.pdf',
				mimeType: 'application/pdf',
				s3Key: 'docs/doc1.pdf',
				version: 1,
				chunkCount: 0,
				chunks: [],
			});
			await agentService.addDocument(agent.id, {
				filename: 'doc2.pdf',
				mimeType: 'application/pdf',
				s3Key: 'docs/doc2.pdf',
				version: 1,
				chunkCount: 0,
				chunks: [],
			});

			const docs = await agentService.getDocuments(agent.id);
			expect(docs).toHaveLength(2);
		});
	});

	// ── Cross-org isolation ───────────────────────────────────────────────────

	describe('Cross-org isolation', () => {
		it('should not return agents from a different organization', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);

			await createAgent(ds, org1.id, { name: 'Org1 Only' });
			await createAgent(ds, org2.id, { name: 'Org2 Only' });

			const org1Agents = await agentService.findByOrganization(org1.id);
			const org2Agents = await agentService.findByOrganization(org2.id);

			expect(org1Agents).toHaveLength(1);
			expect(org1Agents[0].name).toBe('Org1 Only');
			expect(org2Agents).toHaveLength(1);
			expect(org2Agents[0].name).toBe('Org2 Only');
		});

		it('should not allow updating agent from different org', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const agent = await createAgent(ds, org1.id, {
				name: 'Org1 Agent',
			});

			await expect(
				agentService.update(agent.id, { name: 'Hijacked' }, org2.id),
			).rejects.toThrow('not found');
		});

		it('should not allow findOneWithTeam across orgs', async () => {
			const org1 = await createOrganization(ds);
			const org2 = await createOrganization(ds);
			const agent = await createAgent(ds, org1.id);

			await expect(
				agentService.findOneWithTeam(agent.id, org2.id),
			).rejects.toThrow('not found');
		});
	});

	// ── findByIds() ───────────────────────────────────────────────────────────

	describe('findByIds()', () => {
		it('should return agents matching IDs within an org', async () => {
			const org = await createOrganization(ds);
			const a1 = await createAgent(ds, org.id, { name: 'A1' });
			const a2 = await createAgent(ds, org.id, { name: 'A2' });
			await createAgent(ds, org.id, { name: 'A3' });

			const results = await agentService.findByIds(
				[a1.id, a2.id],
				org.id,
			);

			expect(results).toHaveLength(2);
			const names = results.map((a) => a.name);
			expect(names).toContain('A1');
			expect(names).toContain('A2');
		});

		it('should return empty array for empty ids', async () => {
			const org = await createOrganization(ds);
			const results = await agentService.findByIds([], org.id);
			expect(results).toEqual([]);
		});
	});

	// ── updateDocumentChunks() ────────────────────────────────────────────────

	describe('updateDocumentChunks()', () => {
		it('should update document chunks and chunkCount', async () => {
			const org = await createOrganization(ds);
			const agent = await createAgent(ds, org.id);
			const doc = await agentService.addDocument(agent.id, {
				filename: 'chunked.pdf',
				mimeType: 'application/pdf',
				s3Key: 'docs/chunked.pdf',
				version: 1,
				chunkCount: 0,
				chunks: [],
			});

			const chunks = [
				{
					id: 'chunk-1',
					content: 'Hello world',
					embedding: [0.1, 0.2],
					chunkIndex: 0,
				},
				{
					id: 'chunk-2',
					content: 'Second chunk',
					embedding: [0.3, 0.4],
					chunkIndex: 1,
				},
			];

			await agentService.updateDocumentChunks(doc.id, chunks);

			const updated = await documentRepo.findOne({
				where: { id: doc.id },
			});
			expect(updated!.chunkCount).toBe(2);
			expect(updated!.chunks).toHaveLength(2);
			expect(updated!.metadata?.processingStatus).toBe('completed');
		});
	});
});
