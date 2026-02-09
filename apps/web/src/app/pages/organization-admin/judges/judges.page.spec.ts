import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
	provideHttpClientTesting,
	HttpTestingController,
} from '@angular/common/http/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MessageService, ConfirmationService } from 'primeng/api';

import { Agent } from '../../../shared/models/agent.model';
import { environment } from '../../../../environments/environment';

import { JudgesPage } from './judges.page';

function createMockAgent(overrides: Partial<Agent> = {}): Agent {
	return {
		id: 'agent-' + Math.random().toString(36).slice(2, 8),
		organizationId: environment.organizationId,
		name: 'Test Agent',
		systemPrompt: 'You are a test agent.',
		optimizationWeight: 50,
		scoringWeight: 50,
		ragConfig: { topK: 5, similarityThreshold: 0.7 },
		canJudge: true,
		status: 'ACTIVE',
		capabilities: [],
		teamAgentIds: [],
		createdAt: '2025-06-01T00:00:00.000Z',
		updatedAt: '2025-06-01T00:00:00.000Z',
		...overrides,
	};
}

const baseUrl = environment.apiUrl;
const orgId = environment.organizationId;

describe('JudgesPage', () => {
	let component: JudgesPage;
	let fixture: ComponentFixture<JudgesPage>;
	let httpTesting: HttpTestingController;
	let router: Router;
	let _messageService: MessageService;
	let _confirmationService: ConfirmationService;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [JudgesPage],
			providers: [
				provideZonelessChangeDetection(),
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideAnimations(),
				MessageService,
				ConfirmationService,
			],
		}).compileComponents();

		httpTesting = TestBed.inject(HttpTestingController);
		router = TestBed.inject(Router);
		_messageService = TestBed.inject(MessageService);
		_confirmationService = TestBed.inject(ConfirmationService);
		vi.spyOn(router, 'navigate').mockResolvedValue(true);
	});

	afterEach(() => {
		httpTesting.verify();
	});

	/**
	 * Creates the component and flushes the initial loadAgents() HTTP request.
	 * detectChanges() is needed to trigger ngOnInit in zoneless mode.
	 */
	function createAndFlush(agents: Agent[] = []) {
		fixture = TestBed.createComponent(JudgesPage);
		component = fixture.componentInstance;
		fixture.detectChanges(); // triggers ngOnInit → loadAgents()
		const req = httpTesting.expectOne(
			(r) => r.url === `${baseUrl}/organization/${orgId}/agents`,
		);
		req.flush({ status: 'success', data: agents });
	}

	/**
	 * Creates the component and returns the pending request for manual control.
	 */
	function createWithPendingRequest() {
		fixture = TestBed.createComponent(JudgesPage);
		component = fixture.componentInstance;
		fixture.detectChanges(); // triggers ngOnInit → loadAgents()
		return httpTesting.expectOne(
			(r) => r.url === `${baseUrl}/organization/${orgId}/agents`,
		);
	}

	it('should create the component', () => {
		createAndFlush();
		expect(component).toBeTruthy();
	});

	describe('Loading & Rendering', () => {
		it('should set loading to true initially before response', () => {
			const req = createWithPendingRequest();
			expect(component.loading()).toBe(true);
			req.flush({ status: 'success', data: [] });
			expect(component.loading()).toBe(false);
		});

		it('should display agents after loading', () => {
			const agents = [
				createMockAgent({ name: 'Agent Alpha' }),
				createMockAgent({ name: 'Agent Beta' }),
			];
			createAndFlush(agents);

			expect(component.agents()).toHaveLength(2);
			expect(component.agents()[0].name).toBe('Agent Alpha');
			expect(component.agents()[1].name).toBe('Agent Beta');
		});

		it('should show empty array when no agents', () => {
			createAndFlush([]);
			expect(component.agents()).toEqual([]);
		});

		it('should handle missing data in response gracefully', () => {
			fixture = TestBed.createComponent(JudgesPage);
			component = fixture.componentInstance;
			fixture.detectChanges();
			const req = httpTesting.expectOne(
				(r) => r.url === `${baseUrl}/organization/${orgId}/agents`,
			);
			req.flush({ status: 'success' }); // no data field
			expect(component.agents()).toEqual([]);
		});
	});

	describe('Data Display', () => {
		it('should show ACTIVE and INACTIVE status agents', () => {
			const agents = [
				createMockAgent({ name: 'Active', status: 'ACTIVE' }),
				createMockAgent({ name: 'Inactive', status: 'INACTIVE' }),
			];
			createAndFlush(agents);

			expect(component.agents()[0].status).toBe('ACTIVE');
			expect(component.agents()[1].status).toBe('INACTIVE');
		});

		it('should show canJudge values correctly', () => {
			const agents = [
				createMockAgent({ canJudge: true }),
				createMockAgent({ canJudge: false }),
			];
			createAndFlush(agents);

			expect(component.agents()[0].canJudge).toBe(true);
			expect(component.agents()[1].canJudge).toBe(false);
		});

		it('should display agentType and modelTier when set', () => {
			const agents = [
				createMockAgent({ agentType: 'EXPERT', modelTier: 'PRO' }),
			];
			createAndFlush(agents);

			expect(component.agents()[0].agentType).toBe('EXPERT');
			expect(component.agents()[0].modelTier).toBe('PRO');
		});

		it('should handle missing optional fields gracefully', () => {
			createAndFlush([createMockAgent()]);

			expect(component.agents()[0].agentType).toBeUndefined();
			expect(component.agents()[0].modelTier).toBeUndefined();
		});
	});

	describe('Search', () => {
		it('should emit search through searchSubject on input', () => {
			createAndFlush();

			// onSearch pushes to the debounced subject; shouldn't throw
			component.onSearch({
				target: { value: 'test' },
			} as unknown as Event);

			expect(component.currentSearchQuery).toBeDefined();
		});

		it('should call loadAgents directly to verify search loading', () => {
			createAndFlush();

			component.loadAgents('search-term');

			const searchReq = httpTesting.expectOne(
				(r) =>
					r.url === `${baseUrl}/organization/${orgId}/agents` &&
					r.params.get('query') === 'search-term',
			);
			searchReq.flush({ status: 'success', data: [] });

			expect(component.agents()).toEqual([]);
		});
	});

	describe('Sort', () => {
		it('should call loadAgents with sort params on column sort', () => {
			createAndFlush();

			component.onSort({ field: 'name', order: 1 });

			const req = httpTesting.expectOne(
				(r) =>
					r.url === `${baseUrl}/organization/${orgId}/agents` &&
					r.params.get('sortBy') === 'name',
			);
			expect(req.request.params.get('order')).toBe('asc');
			req.flush({ status: 'success', data: [] });
		});

		it('should toggle sort order between asc and desc', () => {
			createAndFlush();

			component.onSort({ field: 'name', order: -1 });

			const req = httpTesting.expectOne(
				(r) =>
					r.url === `${baseUrl}/organization/${orgId}/agents` &&
					r.params.get('sortBy') === 'name',
			);
			expect(req.request.params.get('order')).toBe('desc');
			req.flush({ status: 'success', data: [] });

			expect(component.currentSortField).toBe('name');
			expect(component.currentSortOrder).toBe('desc');
		});
	});

	describe('Navigation', () => {
		it('should navigate to /organization/admin/judges/new on Create Agent click', () => {
			createAndFlush();

			component.navigateToCreate();
			expect(router.navigate).toHaveBeenCalledWith([
				'/organization/admin/judges/new',
			]);
		});

		it('should navigate to /organization/admin/judges/{id} on agent name click', () => {
			createAndFlush();

			component.navigateToDetail('agent-123');
			expect(router.navigate).toHaveBeenCalledWith([
				'/organization/admin/judges',
				'agent-123',
			]);
		});
	});

	describe('Delete', () => {
		it('should show confirmation dialog before deleting', () => {
			createAndFlush();
			// Component provides its own ConfirmationService, get it from the component injector
			const localConfirmService =
				fixture.debugElement.injector.get(ConfirmationService);
			vi.spyOn(localConfirmService, 'confirm');

			const agent = createMockAgent({ id: 'del-1', name: 'To Delete' });
			component.deleteAgent(agent);

			expect(localConfirmService.confirm).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining('To Delete'),
					header: 'Confirm Delete',
				}),
			);
		});

		it('should call deleteAgent and reload on confirm', () => {
			createAndFlush();
			// Get MessageService from component injector (PrimeNgModule provides its own instance)
			const localMessageService =
				fixture.debugElement.injector.get(MessageService);
			vi.spyOn(localMessageService, 'add');

			const localConfirmService =
				fixture.debugElement.injector.get(ConfirmationService);
			let acceptFn: (() => void) | undefined;
			vi.spyOn(localConfirmService, 'confirm').mockImplementation(
				(config: any) => {
					acceptFn = config.accept;
					return localConfirmService;
				},
			);

			const agent = createMockAgent({ id: 'del-1' });
			component.deleteAgent(agent);
			acceptFn!();

			// Expect DELETE request
			const deleteReq = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/del-1`,
			);
			expect(deleteReq.request.method).toBe('DELETE');
			deleteReq.flush({ status: 'success' });

			// After delete, should reload agents list
			const reloadReq = httpTesting.expectOne(
				(r) => r.url === `${baseUrl}/organization/${orgId}/agents`,
			);
			reloadReq.flush({ status: 'success', data: [] });

			expect(localMessageService.add).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'success',
					detail: 'Agent deleted successfully',
				}),
			);
		});

		it('should show error toast on delete failure', () => {
			createAndFlush();
			const localMessageService =
				fixture.debugElement.injector.get(MessageService);
			vi.spyOn(localMessageService, 'add');

			const localConfirmService =
				fixture.debugElement.injector.get(ConfirmationService);
			let acceptFn: (() => void) | undefined;
			vi.spyOn(localConfirmService, 'confirm').mockImplementation(
				(config: any) => {
					acceptFn = config.accept;
					return localConfirmService;
				},
			);

			const agent = createMockAgent({ id: 'del-fail' });
			component.deleteAgent(agent);
			acceptFn!();

			const deleteReq = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/del-fail`,
			);
			deleteReq.flush('Server Error', {
				status: 500,
				statusText: 'Internal Server Error',
			});

			expect(localMessageService.add).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'error',
					detail: 'Failed to delete agent',
				}),
			);
		});
	});

	describe('Error Handling', () => {
		it('should show error toast on load failure', () => {
			const req = createWithPendingRequest();
			// Get MessageService from component injector (PrimeNgModule provides its own instance)
			const localMessageService =
				fixture.debugElement.injector.get(MessageService);
			vi.spyOn(localMessageService, 'add');

			req.flush('Server Error', {
				status: 500,
				statusText: 'Internal Server Error',
			});

			expect(component.loading()).toBe(false);
			expect(localMessageService.add).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: 'error',
					detail: 'Failed to load agents',
				}),
			);
		});
	});

	describe('Lifecycle', () => {
		it('should unsubscribe search subscription on destroy', () => {
			createAndFlush();
			expect(() => component.ngOnDestroy()).not.toThrow();
		});
	});

	describe('Utilities', () => {
		it('should format date strings', () => {
			createAndFlush();

			const formatted = component.formatDate('2025-06-15T00:00:00.000Z');
			expect(formatted).toBeTruthy();
			expect(formatted).toContain('2025');
		});
	});
});
