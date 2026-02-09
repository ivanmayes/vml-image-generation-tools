import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
	provideHttpClientTesting,
	HttpTestingController,
} from '@angular/common/http/testing';

import { environment } from '../../../environments/environment';

import { AgentService } from './agent.service';

describe('AgentService', () => {
	let service: AgentService;
	let httpTesting: HttpTestingController;
	const orgId = 'org-123';
	const agentId = 'agent-456';
	const baseUrl = environment.apiUrl;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				AgentService,
				provideHttpClient(),
				provideHttpClientTesting(),
			],
		});
		service = TestBed.inject(AgentService);
		httpTesting = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpTesting.verify();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('getAgents', () => {
		it('should call GET /organization/{orgId}/agents', () => {
			service.getAgents(orgId).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			expect(req.request.method).toBe('GET');
			expect(req.request.headers.get('Accept')).toBe('application/json');
			req.flush({ status: 'success', data: [] });
		});

		it('should pass query, sortBy, order params when provided', () => {
			service.getAgents(orgId, 'test', 'name', 'asc').subscribe();

			const req = httpTesting.expectOne(
				(r) => r.url === `${baseUrl}/organization/${orgId}/agents`,
			);
			expect(req.request.params.get('query')).toBe('test');
			expect(req.request.params.get('sortBy')).toBe('name');
			expect(req.request.params.get('order')).toBe('asc');
			req.flush({ status: 'success', data: [] });
		});

		it('should not pass params when undefined', () => {
			service.getAgents(orgId).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			expect(req.request.params.keys().length).toBe(0);
			req.flush({ status: 'success', data: [] });
		});
	});

	describe('getAgent', () => {
		it('should call GET /organization/{orgId}/agents/{id}', () => {
			service.getAgent(orgId, agentId).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}`,
			);
			expect(req.request.method).toBe('GET');
			expect(req.request.headers.get('Accept')).toBe('application/json');
			req.flush({ status: 'success', data: { id: agentId } });
		});
	});

	describe('createAgent', () => {
		it('should call POST /organization/{orgId}/agents with dto body', () => {
			const dto = {
				name: 'Test Agent',
				systemPrompt: 'You are a test agent.',
			};

			service.createAgent(orgId, dto as any).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body).toEqual(dto);
			expect(req.request.headers.get('Accept')).toBe('application/json');
			req.flush({ status: 'success', data: { id: 'new-id', ...dto } });
		});
	});

	describe('updateAgent', () => {
		it('should call PUT /organization/{orgId}/agents/{id} with dto body', () => {
			const dto = { name: 'Updated Agent' };

			service.updateAgent(orgId, agentId, dto as any).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}`,
			);
			expect(req.request.method).toBe('PUT');
			expect(req.request.body).toEqual(dto);
			req.flush({ status: 'success', data: { id: agentId, ...dto } });
		});
	});

	describe('deleteAgent', () => {
		it('should call DELETE /organization/{orgId}/agents/{id}', () => {
			service.deleteAgent(orgId, agentId).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}`,
			);
			expect(req.request.method).toBe('DELETE');
			expect(req.request.headers.get('Accept')).toBe('application/json');
			req.flush({ status: 'success' });
		});
	});

	describe('getDocuments', () => {
		it('should call GET /organization/{orgId}/agents/{id}/documents', () => {
			service.getDocuments(orgId, agentId).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			expect(req.request.method).toBe('GET');
			req.flush({ status: 'success', data: [] });
		});
	});

	describe('uploadDocument', () => {
		it('should call POST with FormData containing file', () => {
			const file = new File(['test'], 'test.pdf', {
				type: 'application/pdf',
			});

			service.uploadDocument(orgId, agentId, file).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}/documents`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body instanceof FormData).toBe(true);
			// FormData should contain the file under 'file' key
			expect((req.request.body as FormData).get('file')).toBeTruthy();
			// Should NOT have the default Accept header (FormData upload)
			expect(req.request.headers.has('Accept')).toBe(false);
			req.flush({
				status: 'success',
				data: { id: 'doc-1', filename: 'test.pdf' },
			});
		});
	});

	describe('deleteDocument', () => {
		it('should call DELETE /organization/{orgId}/agents/{id}/documents/{docId}', () => {
			const docId = 'doc-789';

			service.deleteDocument(orgId, agentId, docId).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/agents/${agentId}/documents/${docId}`,
			);
			expect(req.request.method).toBe('DELETE');
			req.flush({ status: 'success' });
		});
	});

	describe('uploadComplianceImage', () => {
		it('should call POST with FormData', () => {
			const file = new File(['image'], 'test.png', {
				type: 'image/png',
			});

			service.uploadComplianceImage(orgId, file).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/image-generation/requests/images/upload`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body instanceof FormData).toBe(true);
			expect((req.request.body as FormData).get('file')).toBeTruthy();
			req.flush({
				status: 'success',
				data: { url: 'https://s3/img.png' },
			});
		});
	});

	describe('evaluateImage', () => {
		it('should call POST /organization/{orgId}/image-generation/evaluate with body', () => {
			const body = {
				brief: 'Evaluate this',
				imageUrls: ['https://example.com/img.jpg'],
				judgeIds: ['judge-1'],
				promptUsed: 'test prompt',
			};

			service.evaluateImage(orgId, body).subscribe();

			const req = httpTesting.expectOne(
				`${baseUrl}/organization/${orgId}/image-generation/evaluate`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body).toEqual(body);
			expect(req.request.headers.get('Accept')).toBe('application/json');
			req.flush({ status: 'success', data: {} });
		});
	});
});
