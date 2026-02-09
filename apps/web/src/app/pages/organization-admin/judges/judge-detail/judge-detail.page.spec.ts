import {
	provideZonelessChangeDetection,
	Component,
	input,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
	provideHttpClientTesting,
	HttpTestingController,
} from '@angular/common/http/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';

import { Agent } from '../../../../shared/models/agent.model';
import { environment } from '../../../../../environments/environment';

import { JudgeDetailPage } from './judge-detail.page';

// Stub ImageEvaluatorComponent to avoid importing its full dependency tree
@Component({
	selector: 'app-image-evaluator',
	template: '<div>Mock Evaluator</div>',
})
class MockImageEvaluatorComponent {
	judgeId = input<string>();
	showJudgePicker = input(true);
	showImageSourceOptions = input(true);
}

function createMockAgent(overrides: Partial<Agent> = {}): Agent {
	return {
		id: 'agent-abc-123',
		organizationId: environment.organizationId,
		name: 'Test Agent',
		systemPrompt: 'You are a helpful test agent.',
		evaluationCategories: 'composition,lighting',
		optimizationWeight: 60,
		scoringWeight: 70,
		ragConfig: { topK: 8, similarityThreshold: 0.85 },
		templateId: 'tmpl-1',
		canJudge: true,
		description: 'A test description',
		teamPrompt: 'Team context here',
		aiSummary: 'AI-generated summary',
		agentType: 'EXPERT',
		modelTier: 'PRO',
		thinkingLevel: 'HIGH',
		status: 'ACTIVE',
		capabilities: ['evaluate', 'summarize'],
		teamAgentIds: ['other-agent-1'],
		temperature: 0.8,
		maxTokens: 4096,
		avatarUrl: 'https://example.com/avatar.png',
		createdBy: 'user-1',
		createdAt: '2025-06-01T00:00:00.000Z',
		updatedAt: '2025-06-02T00:00:00.000Z',
		...overrides,
	};
}

function createActivatedRoute(idParam: string) {
	return {
		snapshot: {
			paramMap: {
				get: (key: string) => (key === 'id' ? idParam : null),
			},
		},
	};
}

const baseUrl = environment.apiUrl;
const orgId = environment.organizationId;

describe('JudgeDetailPage', () => {
	let component: JudgeDetailPage;
	let fixture: ComponentFixture<JudgeDetailPage>;
	let httpTesting: HttpTestingController;
	let router: Router;
	let _messageService: MessageService;

	function setup(idParam: string) {
		TestBed.configureTestingModule({
			imports: [JudgeDetailPage],
			providers: [
				provideZonelessChangeDetection(),
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideAnimations(),
				MessageService,
				{
					provide: ActivatedRoute,
					useValue: createActivatedRoute(idParam),
				},
			],
		}).overrideComponent(JudgeDetailPage, {
			remove: { imports: [] },
			add: { imports: [MockImageEvaluatorComponent] },
		});

		httpTesting = TestBed.inject(HttpTestingController);
		router = TestBed.inject(Router);
		_messageService = TestBed.inject(MessageService);
		vi.spyOn(router, 'navigate').mockResolvedValue(true);

		fixture = TestBed.createComponent(JudgeDetailPage);
		component = fixture.componentInstance;
		fixture.detectChanges(); // triggers ngOnInit in zoneless mode
	}

	function flushAvailableAgents(agents: Agent[] = []) {
		// loadAvailableAgents fires on init for both create and edit
		const req = httpTesting.expectOne(
			(r) =>
				r.url === `${baseUrl}/organization/${orgId}/agents` &&
				r.method === 'GET',
		);
		req.flush({ status: 'success', data: agents });
	}

	function flushGetAgent(agent: Agent) {
		const req = httpTesting.expectOne(
			(r) =>
				r.url === `${baseUrl}/organization/${orgId}/agents/${agent.id}`,
		);
		req.flush({ status: 'success', data: agent });
	}

	afterEach(() => {
		httpTesting.verify();
	});

	describe('Create Mode', () => {
		beforeEach(() => {
			setup('new');
		});

		it('should create the component', () => {
			flushAvailableAgents();
			expect(component).toBeTruthy();
		});

		it('should detect create mode when route param is "new"', () => {
			flushAvailableAgents();
			expect(component.isCreateMode()).toBe(true);
		});

		it('should not fetch agent in create mode', () => {
			flushAvailableAgents();
			// Only the getAgents call for availableAgents should fire, no getAgent
			expect(component.agent()).toBeNull();
		});

		it('should initialize form with default values', () => {
			flushAvailableAgents();

			expect(component.form.get('name')?.value).toBe('');
			expect(component.form.get('systemPrompt')?.value).toBe('');
			expect(component.form.get('canJudge')?.value).toBe(true);
			expect(component.form.get('status')?.value).toBe(true);
			expect(component.form.get('optimizationWeight')?.value).toBe(50);
			expect(component.form.get('scoringWeight')?.value).toBe(50);
			expect(component.form.get('ragTopK')?.value).toBe(5);
			expect(component.form.get('ragSimilarityThreshold')?.value).toBe(
				0.7,
			);
			expect(component.form.get('capabilities')?.value).toEqual([]);
			expect(component.form.get('teamAgentIds')?.value).toEqual([]);
			expect(component.form.get('temperature')?.value).toBeNull();
			expect(component.form.get('maxTokens')?.value).toBeNull();
			expect(component.form.get('agentType')?.value).toBeNull();
			expect(component.form.get('modelTier')?.value).toBeNull();
			expect(component.form.get('thinkingLevel')?.value).toBeNull();
		});

		it('should load available agents excluding self', () => {
			const otherAgents = [
				createMockAgent({ id: 'other-1', name: 'Other Agent' }),
			];
			flushAvailableAgents(otherAgents);

			expect(component.availableAgents()).toHaveLength(1);
			expect(component.availableAgents()[0].name).toBe('Other Agent');
		});
	});

	describe('Edit Mode', () => {
		const agentId = 'agent-abc-123';

		beforeEach(() => {
			setup(agentId);
		});

		it('should detect edit mode with UUID route param', () => {
			flushAvailableAgents();
			flushGetAgent(createMockAgent());
			// Also flush documents request
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({ status: 'success', data: [] });

			expect(component.isCreateMode()).toBe(false);
		});

		it('should fetch agent on init and populate form', () => {
			const mockAgent = createMockAgent();
			flushAvailableAgents();
			flushGetAgent(mockAgent);
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({ status: 'success', data: [] });

			expect(component.agent()).toBeTruthy();
			expect(component.agent()?.name).toBe('Test Agent');
		});

		it('should patch all form fields from API response', () => {
			const mockAgent = createMockAgent();
			flushAvailableAgents();
			flushGetAgent(mockAgent);
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({ status: 'success', data: [] });

			expect(component.form.get('name')?.value).toBe('Test Agent');
			expect(component.form.get('systemPrompt')?.value).toBe(
				'You are a helpful test agent.',
			);
			expect(component.form.get('description')?.value).toBe(
				'A test description',
			);
			expect(component.form.get('canJudge')?.value).toBe(true);
			expect(component.form.get('evaluationCategories')?.value).toBe(
				'composition,lighting',
			);
			expect(component.form.get('teamPrompt')?.value).toBe(
				'Team context here',
			);
			expect(component.form.get('agentType')?.value).toBe('EXPERT');
			expect(component.form.get('modelTier')?.value).toBe('PRO');
			expect(component.form.get('thinkingLevel')?.value).toBe('HIGH');
			expect(component.form.get('temperature')?.value).toBe(0.8);
			expect(component.form.get('maxTokens')?.value).toBe(4096);
			expect(component.form.get('capabilities')?.value).toEqual([
				'evaluate',
				'summarize',
			]);
			expect(component.form.get('teamAgentIds')?.value).toEqual([
				'other-agent-1',
			]);
			expect(component.form.get('templateId')?.value).toBe('tmpl-1');
			expect(component.form.get('optimizationWeight')?.value).toBe(60);
			expect(component.form.get('scoringWeight')?.value).toBe(70);
			expect(component.form.get('ragTopK')?.value).toBe(8);
			expect(component.form.get('ragSimilarityThreshold')?.value).toBe(
				0.85,
			);
			expect(component.form.get('avatarUrl')?.value).toBe(
				'https://example.com/avatar.png',
			);
		});

		it('should map status ACTIVE to toggle=true, INACTIVE to toggle=false', () => {
			const inactiveAgent = createMockAgent({ status: 'INACTIVE' });
			flushAvailableAgents();
			flushGetAgent(inactiveAgent);
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({ status: 'success', data: [] });

			expect(component.form.get('status')?.value).toBe(false);
		});

		it('should map ragConfig.topK and ragConfig.similarityThreshold to flat form fields', () => {
			const agent = createMockAgent({
				ragConfig: { topK: 10, similarityThreshold: 0.9 },
			});
			flushAvailableAgents();
			flushGetAgent(agent);
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({ status: 'success', data: [] });

			expect(component.form.get('ragTopK')?.value).toBe(10);
			expect(component.form.get('ragSimilarityThreshold')?.value).toBe(
				0.9,
			);
		});

		it('should load available agents excluding self', () => {
			const allAgents = [
				createMockAgent({ id: agentId, name: 'Self' }),
				createMockAgent({ id: 'other-1', name: 'Other' }),
			];
			flushAvailableAgents(allAgents);
			flushGetAgent(createMockAgent());
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({ status: 'success', data: [] });

			// Self should be excluded from available agents
			expect(component.availableAgents()).toHaveLength(1);
			expect(component.availableAgents()[0].name).toBe('Other');
		});
	});

	describe('Tab 0: General', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should have name field with required validation', () => {
			const nameCtrl = component.form.get('name');
			expect(nameCtrl).toBeTruthy();

			nameCtrl?.setValue('');
			expect(nameCtrl?.valid).toBe(false);

			nameCtrl?.setValue('Valid Name');
			expect(nameCtrl?.valid).toBe(true);
		});

		it('should have description textarea', () => {
			const descCtrl = component.form.get('description');
			expect(descCtrl).toBeTruthy();
			descCtrl?.setValue('A description');
			expect(descCtrl?.value).toBe('A description');
		});

		it('should have status and canJudge toggle switches', () => {
			expect(component.form.get('status')).toBeTruthy();
			expect(component.form.get('canJudge')).toBeTruthy();
			expect(component.form.get('status')?.value).toBe(true);
			expect(component.form.get('canJudge')?.value).toBe(true);
		});
	});

	describe('Tab 1: Prompts', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should have systemPrompt field with required validation', () => {
			const ctrl = component.form.get('systemPrompt');
			expect(ctrl).toBeTruthy();

			ctrl?.setValue('');
			expect(ctrl?.valid).toBe(false);

			ctrl?.setValue('System prompt text');
			expect(ctrl?.valid).toBe(true);
		});

		it('should have teamPrompt, evaluationCategories, aiSummary fields', () => {
			expect(component.form.get('teamPrompt')).toBeTruthy();
			expect(component.form.get('evaluationCategories')).toBeTruthy();
			expect(component.form.get('aiSummary')).toBeTruthy();
		});

		it('should disable aiSummary field', () => {
			expect(component.form.get('aiSummary')?.disabled).toBe(true);
		});
	});

	describe('Tab 2: Model Configuration', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should have agentType, modelTier, thinkingLevel selects with correct options', () => {
			expect(component.agentTypes).toEqual([
				{ label: 'Expert (Full Context)', value: 'EXPERT' },
				{ label: 'Audience (Summarized)', value: 'AUDIENCE' },
			]);
			expect(component.modelTiers).toEqual([
				{ label: 'Pro', value: 'PRO' },
				{ label: 'Flash', value: 'FLASH' },
			]);
			expect(component.thinkingLevels).toEqual([
				{ label: 'Low', value: 'LOW' },
				{ label: 'Medium', value: 'MEDIUM' },
				{ label: 'High', value: 'HIGH' },
			]);
		});

		it('should have temperature and maxTokens controls', () => {
			expect(component.form.get('temperature')).toBeTruthy();
			expect(component.form.get('maxTokens')).toBeTruthy();
			expect(component.form.get('temperature')?.value).toBeNull();
			expect(component.form.get('maxTokens')?.value).toBeNull();
		});
	});

	describe('Tab 3: Team & Capabilities', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should have capabilities control with array value', () => {
			const ctrl = component.form.get('capabilities');
			expect(ctrl).toBeTruthy();
			expect(ctrl?.value).toEqual([]);

			ctrl?.setValue(['evaluate', 'summarize']);
			expect(ctrl?.value).toEqual(['evaluate', 'summarize']);
		});

		it('should have teamAgentIds control with array value', () => {
			const ctrl = component.form.get('teamAgentIds');
			expect(ctrl).toBeTruthy();
			expect(ctrl?.value).toEqual([]);
		});
	});

	describe('Tab 4: Weights & RAG', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should have optimizationWeight, scoringWeight, templateId, ragTopK, ragSimilarityThreshold', () => {
			expect(component.form.get('optimizationWeight')?.value).toBe(50);
			expect(component.form.get('scoringWeight')?.value).toBe(50);
			expect(component.form.get('templateId')?.value).toBe('');
			expect(component.form.get('ragTopK')?.value).toBe(5);
			expect(component.form.get('ragSimilarityThreshold')?.value).toBe(
				0.7,
			);
		});
	});

	describe('Form Validation', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should mark form invalid when name is empty', () => {
			component.form.get('name')?.setValue('');
			component.form.get('systemPrompt')?.setValue('Valid prompt');
			expect(component.form.valid).toBe(false);
		});

		it('should mark form invalid when systemPrompt is empty', () => {
			component.form.get('name')?.setValue('Valid Name');
			component.form.get('systemPrompt')?.setValue('');
			expect(component.form.valid).toBe(false);
		});

		it('should be valid when required fields are filled', () => {
			component.form.get('name')?.setValue('Valid Name');
			component.form.get('systemPrompt')?.setValue('Valid prompt');
			expect(component.form.valid).toBe(true);
		});

		it('should call markAllAsTouched on invalid save attempt', () => {
			vi.spyOn(component.form, 'markAllAsTouched');

			component.form.get('name')?.setValue('');
			component.save();

			expect(component.form.markAllAsTouched).toHaveBeenCalled();
		});
	});

	describe('Save (Create)', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should POST new agent with correct DTO shape', () => {
			component.form.patchValue({
				name: 'New Agent',
				systemPrompt: 'System prompt',
				description: 'Desc',
				canJudge: true,
				status: true,
				agentType: 'EXPERT',
				modelTier: 'PRO',
				thinkingLevel: 'HIGH',
				teamPrompt: 'Team prompt',
				capabilities: ['evaluate'],
				teamAgentIds: ['team-1'],
				temperature: 0.5,
				maxTokens: 2048,
				avatarUrl: 'https://example.com/avatar.png',
				optimizationWeight: 60,
				scoringWeight: 70,
				ragTopK: 10,
				ragSimilarityThreshold: 0.9,
			});

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			expect(req.request.method).toBe('POST');

			const body = req.request.body;
			expect(body.name).toBe('New Agent');
			expect(body.systemPrompt).toBe('System prompt');
			expect(body.description).toBe('Desc');
			expect(body.canJudge).toBe(true);
			expect(body.status).toBe('ACTIVE');
			expect(body.agentType).toBe('EXPERT');
			expect(body.modelTier).toBe('PRO');
			expect(body.thinkingLevel).toBe('HIGH');
			expect(body.teamPrompt).toBe('Team prompt');
			expect(body.capabilities).toEqual(['evaluate']);
			expect(body.teamAgentIds).toEqual(['team-1']);
			expect(body.temperature).toBe(0.5);
			expect(body.maxTokens).toBe(2048);
			expect(body.avatarUrl).toBe('https://example.com/avatar.png');
			expect(body.optimizationWeight).toBe(60);
			expect(body.scoringWeight).toBe(70);
			expect(body.ragConfig).toEqual({
				topK: 10,
				similarityThreshold: 0.9,
			});

			req.flush({ status: 'success', data: { id: 'new-id' } });
		});

		it('should map status toggle true to ACTIVE, false to INACTIVE', () => {
			component.form.patchValue({
				name: 'Agent',
				systemPrompt: 'Prompt',
				status: false,
			});

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			expect(req.request.body.status).toBe('INACTIVE');
			req.flush({ status: 'success', data: { id: 'new-id' } });
		});

		it('should map ragTopK and ragSimilarityThreshold into ragConfig object', () => {
			component.form.patchValue({
				name: 'Agent',
				systemPrompt: 'Prompt',
				ragTopK: 12,
				ragSimilarityThreshold: 0.8,
			});

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			expect(req.request.body.ragConfig).toEqual({
				topK: 12,
				similarityThreshold: 0.8,
			});
			req.flush({ status: 'success', data: { id: 'new-id' } });
		});

		it('should omit empty optional fields', () => {
			component.form.patchValue({
				name: 'Minimal Agent',
				systemPrompt: 'Prompt',
				description: '',
				evaluationCategories: '',
				templateId: '',
				teamPrompt: '',
				agentType: null,
				modelTier: null,
				thinkingLevel: null,
				capabilities: [],
				teamAgentIds: [],
				temperature: null,
				maxTokens: null,
				avatarUrl: '',
			});

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			const body = req.request.body;
			expect(body.description).toBeUndefined();
			expect(body.evaluationCategories).toBeUndefined();
			expect(body.templateId).toBeUndefined();
			expect(body.teamPrompt).toBeUndefined();
			expect(body.agentType).toBeUndefined();
			expect(body.modelTier).toBeUndefined();
			expect(body.thinkingLevel).toBeUndefined();
			expect(body.capabilities).toBeUndefined();
			expect(body.teamAgentIds).toBeUndefined();
			expect(body.temperature).toBeUndefined();
			expect(body.maxTokens).toBeUndefined();
			expect(body.avatarUrl).toBeUndefined();
			req.flush({ status: 'success', data: { id: 'new-id' } });
		});

		it('should navigate to /organization/admin/judges on success', () => {
			component.form.patchValue({
				name: 'Agent',
				systemPrompt: 'Prompt',
			});

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			req.flush({ status: 'success', data: { id: 'new-id' } });

			expect(router.navigate).toHaveBeenCalledWith([
				'/organization/admin/judges',
			]);
		});

		it('should show success toast on create', () => {
			// Get MessageService from component injector (PrimeNgModule provides its own instance)
			const localMessageService =
				fixture.debugElement.injector.get(MessageService);
			vi.spyOn(localMessageService, 'add');
			component.form.patchValue({
				name: 'Agent',
				systemPrompt: 'Prompt',
			});

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			req.flush({ status: 'success', data: { id: 'new-id' } });

			expect(localMessageService.add).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'success',
					detail: 'Agent created successfully',
				}),
			);
		});

		it('should show error toast on create failure', () => {
			const localMessageService =
				fixture.debugElement.injector.get(MessageService);
			vi.spyOn(localMessageService, 'add');
			component.form.patchValue({
				name: 'Agent',
				systemPrompt: 'Prompt',
			});

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			req.flush('Error', { status: 500, statusText: 'Server Error' });

			expect(localMessageService.add).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'error',
					detail: 'Failed to create agent',
				}),
			);
		});
	});

	describe('Save (Update)', () => {
		const agentId = 'agent-abc-123';

		beforeEach(() => {
			setup(agentId);
			flushAvailableAgents();
			flushGetAgent(createMockAgent());
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({ status: 'success', data: [] });
		});

		it('should PUT to agents/{id} with correct DTO shape', () => {
			component.form.patchValue({ name: 'Updated Name' });
			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}`,
			);
			expect(req.request.method).toBe('PUT');
			expect(req.request.body.name).toBe('Updated Name');
			req.flush({ status: 'success', data: { id: agentId } });
		});

		it('should navigate back on success', () => {
			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}`,
			);
			req.flush({ status: 'success', data: { id: agentId } });

			expect(router.navigate).toHaveBeenCalledWith([
				'/organization/admin/judges',
			]);
		});

		it('should show success toast on update', () => {
			const localMessageService =
				fixture.debugElement.injector.get(MessageService);
			vi.spyOn(localMessageService, 'add');

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}`,
			);
			req.flush({ status: 'success', data: { id: agentId } });

			expect(localMessageService.add).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'success',
					detail: 'Agent updated successfully',
				}),
			);
		});

		it('should show error toast on update failure', () => {
			const localMessageService =
				fixture.debugElement.injector.get(MessageService);
			vi.spyOn(localMessageService, 'add');

			component.save();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}`,
			);
			req.flush('Error', { status: 500, statusText: 'Server Error' });

			expect(localMessageService.add).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'error',
					detail: 'Failed to update agent',
				}),
			);
		});
	});

	describe('Navigation', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should navigate back on cancel', () => {
			component.cancel();
			expect(router.navigate).toHaveBeenCalledWith([
				'/organization/admin/judges',
			]);
		});

		it('should navigate back on goBack', () => {
			component.goBack();
			expect(router.navigate).toHaveBeenCalledWith([
				'/organization/admin/judges',
			]);
		});
	});

	describe('Documents', () => {
		const agentId = 'agent-abc-123';

		beforeEach(() => {
			setup(agentId);
			flushAvailableAgents();
			flushGetAgent(createMockAgent());
		});

		it('should load documents after agent loads', () => {
			const docReq = httpTesting.expectOne(
				(r) =>
					r.url ===
					`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			docReq.flush({
				status: 'success',
				data: [
					{
						id: 'doc-1',
						agentId,
						filename: 'test.pdf',
						mimeType: 'application/pdf',
						version: 1,
						chunkCount: 5,
						createdAt: '2025-06-01T00:00:00.000Z',
					},
				],
			});

			expect(component.documents()).toHaveLength(1);
			expect(component.documents()[0].filename).toBe('test.pdf');
		});
	});

	describe('Utilities', () => {
		beforeEach(() => {
			setup('new');
			flushAvailableAgents();
		});

		it('should format date strings', () => {
			const formatted = component.formatDate('2025-06-15T00:00:00.000Z');
			expect(formatted).toBeTruthy();
			expect(formatted).toContain('2025');
		});

		it('should return empty string for empty date input', () => {
			expect(component.formatDate('')).toBe('');
		});
	});
});
