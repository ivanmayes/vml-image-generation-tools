import { Test, TestingModule } from '@nestjs/testing';
import {
	INestApplication,
	ValidationPipe,
	CanActivate,
	ExecutionContext,
} from '@nestjs/common';
import request from 'supertest';
import { AuthGuard } from '@nestjs/passport';

import { AgentController } from '../src/agent/agent.controller';
import { AgentService } from '../src/agent/agent.service';
import {
	Agent,
	AgentStatus,
	AgentType,
	ModelTier,
	ThinkingLevel,
} from '../src/agent/agent.entity';
import { TeamCycleValidator } from '../src/agent/validators/team-cycle.validator';
import { AgentExportService } from '../src/agent/export/agent-export.service';
import { AgentImportService } from '../src/agent/import/agent-import.service';
import { RolesGuard } from '../src/user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../src/organization/guards/has-organization-access.guard';
import { UserRole } from '../src/user/user-role.enum';

/**
 * Agent E2E Tests
 *
 * These tests use a mock-based approach to avoid the full AppModule bootstrap
 * (which requires DB, AWS, Passport, etc.). We test the controller layer
 * with mocked services to verify request handling, validation, and response shapes.
 *
 * For true integration tests hitting a real DB, run these with a test DB config.
 */

const TEST_ORG_ID = 'org-e2e-test-id';
const TEST_USER = {
	id: 'user-e2e-test',
	role: UserRole.Admin,
	organizationId: TEST_ORG_ID,
};

function createMockAgentEntity(overrides: Partial<Agent> = {}): Agent {
	const agent = new Agent({
		id: 'agent-e2e-' + Math.random().toString(36).slice(2, 8),
		organizationId: TEST_ORG_ID,
		name: 'E2E Test Agent',
		systemPrompt: 'You are an e2e test agent.',
		evaluationCategories: undefined,
		optimizationWeight: 50,
		scoringWeight: 50,
		ragConfig: { topK: 5, similarityThreshold: 0.7 },
		templateId: undefined,
		canJudge: true,
		description: undefined,
		teamPrompt: undefined,
		aiSummary: undefined,
		agentType: undefined,
		modelTier: undefined,
		thinkingLevel: undefined,
		status: AgentStatus.ACTIVE,
		capabilities: [],
		teamAgentIds: [],
		temperature: undefined,
		maxTokens: undefined,
		avatarUrl: undefined,
		createdBy: TEST_USER.id,
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
		...overrides,
	});
	return agent;
}

describe('Agent Controller (e2e)', () => {
	let app: INestApplication;

	const mockAgentService = {
		find: jest.fn(),
		findOne: jest.fn(),
		create: jest.fn(),
		update: jest.fn(),
		softDelete: jest.fn(),
		restore: jest.fn(),
		findByOrganization: jest.fn(),
		findByIds: jest.fn(),
		findOneWithTeam: jest.fn(),
		getWithDocuments: jest.fn(),
		addDocument: jest.fn(),
		getDocuments: jest.fn(),
		getDocument: jest.fn(),
		deleteDocument: jest.fn(),
	};

	const mockTeamCycleValidator = {
		validate: jest.fn().mockResolvedValue(undefined),
	};

	const mockAgentExportService = {
		exportToAgentFile: jest.fn(),
	};

	const mockAgentImportService = {
		importFromAgentFile: jest.fn(),
		validateAgentFile: jest.fn(),
	};

	// Guard mock that injects test user and always allows access
	const mockGuard: CanActivate = {
		canActivate(context: ExecutionContext) {
			const req = context.switchToHttp().getRequest();
			req.user = TEST_USER;
			return true;
		},
	};

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			controllers: [AgentController],
			providers: [
				{ provide: AgentService, useValue: mockAgentService },
				{
					provide: TeamCycleValidator,
					useValue: mockTeamCycleValidator,
				},
				{
					provide: AgentExportService,
					useValue: mockAgentExportService,
				},
				{
					provide: AgentImportService,
					useValue: mockAgentImportService,
				},
			],
		})
			.overrideGuard(AuthGuard())
			.useValue(mockGuard)
			.overrideGuard(RolesGuard)
			.useValue(mockGuard)
			.overrideGuard(HasOrganizationAccessGuard)
			.useValue(mockGuard)
			.compile();

		app = moduleFixture.createNestApplication();

		// Enable validation pipes like the real app
		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true,
				forbidNonWhitelisted: true,
				transform: true,
			}),
		);

		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('POST /organization/:orgId/agents (Create)', () => {
		it('should create agent with minimal fields (name + systemPrompt)', async () => {
			const dto = {
				name: 'Minimal Agent',
				systemPrompt: 'Minimal prompt.',
			};

			const created = createMockAgentEntity({
				name: dto.name,
				systemPrompt: dto.systemPrompt,
			});
			mockAgentService.create.mockResolvedValue(created);

			const response = await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send(dto)
				.expect(201);

			expect(response.body.status).toBe('success');
			expect(response.body.data.name).toBe('Minimal Agent');
			expect(response.body.data.systemPrompt).toBe('Minimal prompt.');
			expect(mockAgentService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: TEST_ORG_ID,
					name: 'Minimal Agent',
					systemPrompt: 'Minimal prompt.',
				}),
			);
		});

		it('should create agent with all optional fields populated', async () => {
			const dto = {
				name: 'Full Agent',
				systemPrompt: 'Full prompt.',
				evaluationCategories: 'composition,lighting',
				optimizationWeight: 60,
				scoringWeight: 70,
				ragConfig: { topK: 10, similarityThreshold: 0.9 },
				templateId: 'tmpl-1',
				canJudge: false,
				description: 'A fully configured agent',
				teamPrompt: 'Team prompt context',
				aiSummary: 'AI summary text',
				agentType: 'EXPERT',
				modelTier: 'PRO',
				thinkingLevel: 'HIGH',
				status: 'INACTIVE',
				capabilities: ['evaluate', 'summarize'],
				temperature: 0.8,
				maxTokens: 4096,
				avatarUrl: 'https://example.com/avatar.png',
			};

			const created = createMockAgentEntity({
				...dto,
				agentType: AgentType.EXPERT,
				modelTier: ModelTier.PRO,
				thinkingLevel: ThinkingLevel.HIGH,
				status: AgentStatus.INACTIVE,
			});
			mockAgentService.create.mockResolvedValue(created);

			const response = await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send(dto)
				.expect(201);

			expect(response.body.status).toBe('success');
			expect(response.body.data).toBeDefined();
		});

		it('should apply default values for optional fields', async () => {
			const dto = {
				name: 'Default Agent',
				systemPrompt: 'Default prompt.',
			};

			const created = createMockAgentEntity({
				name: dto.name,
				systemPrompt: dto.systemPrompt,
			});
			mockAgentService.create.mockResolvedValue(created);

			await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send(dto)
				.expect(201);

			const createCall = mockAgentService.create.mock.calls[0][0];
			expect(createCall.optimizationWeight).toBe(50);
			expect(createCall.scoringWeight).toBe(50);
			expect(createCall.ragConfig).toEqual({
				topK: 5,
				similarityThreshold: 0.7,
			});
		});

		it('should return 400 for missing required fields', async () => {
			// Missing name
			await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send({ systemPrompt: 'Only prompt' })
				.expect(400);

			// Missing systemPrompt
			await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send({ name: 'Only name' })
				.expect(400);

			// Empty body
			await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send({})
				.expect(400);
		});

		it('should return 500 when service create fails', async () => {
			mockAgentService.create.mockResolvedValue(null);

			await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send({ name: 'Fail Agent', systemPrompt: 'Fail' })
				.expect(500);
		});
	});

	describe('GET /organization/:orgId/agents/:id (Get Agent)', () => {
		it('should return agent by id', async () => {
			const agent = createMockAgentEntity({ id: 'agent-get-1' });
			mockAgentService.getWithDocuments.mockResolvedValue(agent);

			const response = await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents/agent-get-1`)
				.expect(200);

			expect(response.body.status).toBe('success');
			expect(response.body.data.id).toBe('agent-get-1');
		});

		it('should return 404 for non-existent agent', async () => {
			mockAgentService.getWithDocuments.mockResolvedValue(null);

			await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents/non-existent`)
				.expect(404);
		});

		it('should include all fields in toPublic() response', async () => {
			const agent = createMockAgentEntity({
				id: 'agent-full',
				name: 'Full Agent',
				canJudge: true,
				description: 'Full desc',
				teamPrompt: 'Team',
				aiSummary: 'AI Summary',
				agentType: AgentType.EXPERT,
				modelTier: ModelTier.PRO,
				thinkingLevel: ThinkingLevel.HIGH,
				status: AgentStatus.ACTIVE,
				capabilities: ['eval'],
				teamAgentIds: ['other-1'],
				temperature: 0.5,
				maxTokens: 2048,
				avatarUrl: 'https://example.com/a.png',
			});
			mockAgentService.getWithDocuments.mockResolvedValue(agent);

			const response = await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents/agent-full`)
				.expect(200);

			const data = response.body.data;
			expect(data.id).toBe('agent-full');
			expect(data.name).toBe('Full Agent');
			expect(data.canJudge).toBe(true);
			expect(data.description).toBe('Full desc');
			expect(data.teamPrompt).toBe('Team');
			expect(data.aiSummary).toBe('AI Summary');
			expect(data.agentType).toBe('EXPERT');
			expect(data.modelTier).toBe('PRO');
			expect(data.thinkingLevel).toBe('HIGH');
			expect(data.status).toBe('ACTIVE');
			expect(data.capabilities).toEqual(['eval']);
			expect(data.teamAgentIds).toEqual(['other-1']);
			expect(data.temperature).toBe(0.5);
			expect(data.maxTokens).toBe(2048);
			expect(data.avatarUrl).toBe('https://example.com/a.png');
			expect(data.ragConfig).toBeDefined();
			expect(data.optimizationWeight).toBeDefined();
			expect(data.scoringWeight).toBeDefined();
			expect(data.createdAt).toBeDefined();
			expect(data.updatedAt).toBeDefined();
		});
	});

	describe('GET /organization/:orgId/agents (List Agents)', () => {
		it('should return all agents for organization', async () => {
			const agents = [
				createMockAgentEntity({ name: 'Agent A' }),
				createMockAgentEntity({ name: 'Agent B' }),
			];
			mockAgentService.findByOrganization.mockResolvedValue(agents);

			const response = await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents`)
				.expect(200);

			expect(response.body.status).toBe('success');
			expect(response.body.data).toHaveLength(2);
		});

		it('should pass query param for search', async () => {
			mockAgentService.findByOrganization.mockResolvedValue([]);

			await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents?query=test`)
				.expect(200);

			expect(mockAgentService.findByOrganization).toHaveBeenCalledWith(
				TEST_ORG_ID,
				'test',
				undefined,
				undefined,
				undefined,
				undefined,
				expect.any(Object),
			);
		});

		it('should pass sortBy and order params', async () => {
			mockAgentService.findByOrganization.mockResolvedValue([]);

			await request(app.getHttpServer())
				.get(
					`/organization/${TEST_ORG_ID}/agents?sortBy=name&order=ASC`,
				)
				.expect(200);

			expect(mockAgentService.findByOrganization).toHaveBeenCalledWith(
				TEST_ORG_ID,
				undefined,
				'name',
				'ASC',
				undefined,
				undefined,
				expect.any(Object),
			);
		});

		it('should pass status filter', async () => {
			mockAgentService.findByOrganization.mockResolvedValue([]);

			await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents?status=ACTIVE`)
				.expect(200);

			expect(mockAgentService.findByOrganization).toHaveBeenCalledWith(
				TEST_ORG_ID,
				undefined,
				undefined,
				undefined,
				'ACTIVE',
				undefined,
				expect.any(Object),
			);
		});

		it('should pass canJudge filter', async () => {
			mockAgentService.findByOrganization.mockResolvedValue([]);

			await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents?canJudge=true`)
				.expect(200);

			expect(mockAgentService.findByOrganization).toHaveBeenCalledWith(
				TEST_ORG_ID,
				undefined,
				undefined,
				undefined,
				undefined,
				true,
				expect.any(Object),
			);
		});

		it('should return empty array when no agents found', async () => {
			mockAgentService.findByOrganization.mockResolvedValue([]);

			const response = await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents`)
				.expect(200);

			expect(response.body.data).toEqual([]);
		});
	});

	describe('PUT /organization/:orgId/agents/:id (Update Agent)', () => {
		it('should update single field', async () => {
			const existing = createMockAgentEntity({ id: 'agent-upd-1' });
			mockAgentService.getWithDocuments.mockResolvedValue(existing);

			const updated = createMockAgentEntity({
				id: 'agent-upd-1',
				name: 'Updated Name',
			});
			mockAgentService.update.mockResolvedValue(updated);

			const response = await request(app.getHttpServer())
				.put(`/organization/${TEST_ORG_ID}/agents/agent-upd-1`)
				.send({ name: 'Updated Name' })
				.expect(200);

			expect(response.body.status).toBe('success');
			expect(response.body.data.name).toBe('Updated Name');
		});

		it('should update all fields', async () => {
			const existing = createMockAgentEntity({ id: 'agent-upd-all' });
			mockAgentService.getWithDocuments.mockResolvedValue(existing);

			const updateDto = {
				name: 'Updated All',
				systemPrompt: 'Updated prompt',
				description: 'Updated desc',
				canJudge: false,
				status: 'INACTIVE',
				agentType: 'AUDIENCE',
				modelTier: 'FLASH',
				thinkingLevel: 'LOW',
				capabilities: ['new-cap'],
				temperature: 1.5,
				maxTokens: 8192,
			};

			const updated = createMockAgentEntity({
				id: 'agent-upd-all',
				...updateDto,
				agentType: AgentType.AUDIENCE,
				modelTier: ModelTier.FLASH,
				thinkingLevel: ThinkingLevel.LOW,
				status: AgentStatus.INACTIVE,
			});
			mockAgentService.update.mockResolvedValue(updated);

			const response = await request(app.getHttpServer())
				.put(`/organization/${TEST_ORG_ID}/agents/agent-upd-all`)
				.send(updateDto)
				.expect(200);

			expect(response.body.status).toBe('success');
		});

		it('should merge ragConfig (partial update preserves existing values)', async () => {
			const existing = createMockAgentEntity({
				id: 'agent-rag',
				ragConfig: { topK: 5, similarityThreshold: 0.7 },
			});
			mockAgentService.getWithDocuments.mockResolvedValue(existing);

			const updated = createMockAgentEntity({
				id: 'agent-rag',
				ragConfig: { topK: 10, similarityThreshold: 0.7 },
			});
			mockAgentService.update.mockResolvedValue(updated);

			await request(app.getHttpServer())
				.put(`/organization/${TEST_ORG_ID}/agents/agent-rag`)
				.send({ ragConfig: { topK: 10 } })
				.expect(200);

			const updateCall = mockAgentService.update.mock.calls[0][1];
			expect(updateCall.ragConfig.topK).toBe(10);
			// Should preserve existing similarityThreshold
			expect(updateCall.ragConfig.similarityThreshold).toBe(0.7);
		});

		it('should return 404 for non-existent agent', async () => {
			mockAgentService.getWithDocuments.mockResolvedValue(null);

			await request(app.getHttpServer())
				.put(`/organization/${TEST_ORG_ID}/agents/non-existent`)
				.send({ name: 'Nope' })
				.expect(404);
		});
	});

	describe('DELETE /organization/:orgId/agents/:id (Delete Agent)', () => {
		it('should soft delete agent', async () => {
			const existing = createMockAgentEntity({ id: 'agent-del-1' });
			mockAgentService.getWithDocuments.mockResolvedValue(existing);
			mockAgentService.softDelete.mockResolvedValue(undefined);

			const response = await request(app.getHttpServer())
				.delete(`/organization/${TEST_ORG_ID}/agents/agent-del-1`)
				.expect(200);

			expect(response.body.status).toBe('success');
			expect(response.body.message).toContain('deleted');
			expect(mockAgentService.softDelete).toHaveBeenCalledWith(
				'agent-del-1',
				TEST_ORG_ID,
			);
		});

		it('should return 404 for non-existent agent', async () => {
			mockAgentService.getWithDocuments.mockResolvedValue(null);

			await request(app.getHttpServer())
				.delete(`/organization/${TEST_ORG_ID}/agents/non-existent`)
				.expect(404);
		});
	});

	describe('Team Validation', () => {
		it('should call team cycle validator when teamAgentIds provided on create', async () => {
			const dto = {
				name: 'Team Agent',
				systemPrompt: 'Prompt',
				teamAgentIds: [
					'a0000000-0000-4000-8000-000000000001',
					'a0000000-0000-4000-8000-000000000002',
				],
			};

			const created = createMockAgentEntity(dto);
			mockAgentService.create.mockResolvedValue(created);
			mockTeamCycleValidator.validate.mockResolvedValue(undefined);

			await request(app.getHttpServer())
				.post(`/organization/${TEST_ORG_ID}/agents`)
				.send(dto)
				.expect(201);

			expect(mockTeamCycleValidator.validate).toHaveBeenCalledWith(
				'__new__',
				dto.teamAgentIds,
				TEST_ORG_ID,
			);
		});

		it('should call team cycle validator when teamAgentIds provided on update', async () => {
			const existing = createMockAgentEntity({ id: 'agent-team' });
			mockAgentService.getWithDocuments.mockResolvedValue(existing);

			const updated = createMockAgentEntity({ id: 'agent-team' });
			mockAgentService.update.mockResolvedValue(updated);
			mockTeamCycleValidator.validate.mockResolvedValue(undefined);

			const teamIds = ['a0000000-0000-4000-8000-000000000003'];

			await request(app.getHttpServer())
				.put(`/organization/${TEST_ORG_ID}/agents/agent-team`)
				.send({ teamAgentIds: teamIds })
				.expect(200);

			expect(mockTeamCycleValidator.validate).toHaveBeenCalledWith(
				'agent-team',
				teamIds,
				TEST_ORG_ID,
			);
		});
	});

	describe('Null Safety', () => {
		it('should return safe defaults for legacy agents with missing nullable fields', async () => {
			// Simulate a legacy agent with missing new fields
			const legacyAgent = new Agent({
				id: 'legacy-1',
				organizationId: TEST_ORG_ID,
				name: 'Legacy Agent',
				systemPrompt: 'Old prompt',
				optimizationWeight: 50,
				scoringWeight: 50,
				createdAt: new Date(),
				updatedAt: new Date(),
				deletedAt: null,
				// Intentionally omit new fields to test null safety
			});
			mockAgentService.getWithDocuments.mockResolvedValue(legacyAgent);

			const response = await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents/legacy-1`)
				.expect(200);

			const data = response.body.data;
			expect(data.canJudge).toBe(true); // default
			expect(data.status).toBe('ACTIVE'); // default
			expect(data.capabilities).toEqual([]); // default
			expect(data.teamAgentIds).toEqual([]); // default
			expect(data.ragConfig).toEqual({
				topK: 5,
				similarityThreshold: 0.7,
			}); // default
		});
	});

	describe('Documents', () => {
		it('should list documents for an agent', async () => {
			mockAgentService.findOne.mockResolvedValue(
				createMockAgentEntity({ id: 'agent-doc' }),
			);

			const doc = {
				id: 'doc-1',
				agentId: 'agent-doc',
				filename: 'test.pdf',
				mimeType: 'application/pdf',
				version: 1,
				chunkCount: 5,
				createdAt: new Date(),
				toPublic: function () {
					return {
						id: this.id,
						agentId: this.agentId,
						filename: this.filename,
						mimeType: this.mimeType,
						version: this.version,
						chunkCount: this.chunkCount,
						createdAt: this.createdAt,
					};
				},
			};
			mockAgentService.getDocuments.mockResolvedValue([doc]);

			const response = await request(app.getHttpServer())
				.get(`/organization/${TEST_ORG_ID}/agents/agent-doc/documents`)
				.expect(200);

			expect(response.body.status).toBe('success');
			expect(response.body.data).toHaveLength(1);
			expect(response.body.data[0].filename).toBe('test.pdf');
		});

		it('should return 404 when listing documents for non-existent agent', async () => {
			mockAgentService.findOne.mockResolvedValue(null);

			await request(app.getHttpServer())
				.get(
					`/organization/${TEST_ORG_ID}/agents/non-existent/documents`,
				)
				.expect(404);
		});
	});
});
