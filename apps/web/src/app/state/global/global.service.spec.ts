import { TestBed } from '@angular/core/testing';
import {
	HttpClientTestingModule,
	HttpTestingController,
} from '@angular/common/http/testing';
import { Title } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';

import { environment } from '../../../environments/environment';
import type { OrganizationSettings } from '../../../../../api/src/organization/organization.settings';

import { GlobalService } from './global.service';
import { GlobalStore } from './global.store';

describe('GlobalService', () => {
	let service: GlobalService;
	let httpMock: HttpTestingController;
	let mockGlobalStore: {
		setLoading: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		getValue: ReturnType<typeof vi.fn>;
	};
	let mockTitleService: { setTitle: ReturnType<typeof vi.fn> };
	let mockMessageService: { add: ReturnType<typeof vi.fn> };

	const mockSettings = {
		id: '123',
		name: 'Test Org',
		logo: 'logo.png',
		settings: {},
		authenticationStrategies: [],
	};

	beforeEach(() => {
		mockGlobalStore = {
			setLoading: vi.fn(),
			update: vi.fn(),
			getValue: vi.fn().mockReturnValue({
				settings: mockSettings,
				header: { visible: true, invert: false, floating: false },
				adminMode: false,
			}),
		};

		mockTitleService = { setTitle: vi.fn() };
		mockMessageService = { add: vi.fn() };

		TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			providers: [
				GlobalService,
				{ provide: GlobalStore, useValue: mockGlobalStore },
				{ provide: Title, useValue: mockTitleService },
				{ provide: MessageService, useValue: mockMessageService },
			],
		});

		service = TestBed.inject(GlobalService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('get', () => {
		it('should fetch organization settings', () => {
			service.get().subscribe((result) => {
				expect(result).toEqual(mockSettings);
			});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/organization/${environment.organizationId}/settings`,
			);
			expect(req.request.method).toBe('GET');
			req.flush(mockSettings);

			expect(mockGlobalStore.setLoading).toHaveBeenCalledWith(true);
			expect(mockGlobalStore.update).toHaveBeenCalled();
			expect(mockGlobalStore.setLoading).toHaveBeenCalledWith(false);
		});
	});

	describe('getPublic', () => {
		it('should fetch public organization settings', () => {
			const publicSettings = { name: 'Public Org' };

			service.getPublic().subscribe((result) => {
				expect(result).toEqual(publicSettings);
			});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/organization/${environment.organizationId}/public`,
			);
			expect(req.request.method).toBe('GET');
			req.flush(publicSettings);

			expect(mockGlobalStore.setLoading).toHaveBeenCalledWith(true);
			expect(mockGlobalStore.update).toHaveBeenCalledWith({
				settings: publicSettings,
			});
		});
	});

	describe('updateOrganizationSettings', () => {
		it('should update organization settings', () => {
			const updatedSettings: Partial<OrganizationSettings> = {
				entities: {} as any,
			};

			service.updateOrganizationSettings(updatedSettings).subscribe();

			const req = httpMock.expectOne(
				`${environment.apiUrl}/organization/${environment.organizationId}/settings`,
			);
			expect(req.request.method).toBe('PUT');
			expect(req.request.body).toEqual(updatedSettings);
			req.flush(updatedSettings);

			expect(mockGlobalStore.setLoading).toHaveBeenCalledWith(true);
		});
	});

	describe('setAdminMode', () => {
		it('should toggle admin mode when no state provided', () => {
			service.setAdminMode();

			expect(mockGlobalStore.update).toHaveBeenCalledWith({
				adminMode: true,
			});
		});

		it('should set admin mode to provided state', () => {
			service.setAdminMode(true);

			expect(mockGlobalStore.update).toHaveBeenCalledWith({
				adminMode: true,
			});
		});
	});

	describe('hideHeader', () => {
		it('should hide the header', () => {
			service.hideHeader();

			expect(mockGlobalStore.update).toHaveBeenCalledWith({
				header: expect.objectContaining({
					visible: false,
				}),
			});
		});
	});

	describe('showHeader', () => {
		it('should show the header', () => {
			service.showHeader();

			expect(mockGlobalStore.update).toHaveBeenCalledWith({
				header: expect.objectContaining({
					visible: true,
				}),
			});
		});
	});

	describe('setHeaderSettings', () => {
		it('should update header settings', () => {
			service.setHeaderSettings({ invert: true, floating: true });

			expect(mockGlobalStore.update).toHaveBeenCalledWith({
				header: expect.objectContaining({
					invert: true,
					floating: true,
				}),
			});
		});
	});

	describe('getOrganizationSettingsFormObject', () => {
		it('should return empty object', () => {
			const result = service.getOrganizationSettingsFormObject({} as any);
			expect(result).toEqual({});
		});
	});

	describe('getColorFromSettingsEntity', () => {
		it('should return color from entity', () => {
			mockGlobalStore.getValue.mockReturnValue({
				settings: {
					tactics: [{ id: '1', color: '#ff0000' }],
				},
			});

			const result = service.getColorFromSettingsEntity('tactics', '1');
			expect(result).toBe('#ff0000');
		});

		it('should return undefined if entity not found', () => {
			mockGlobalStore.getValue.mockReturnValue({
				settings: {
					tactics: [{ id: '1', color: '#ff0000' }],
				},
			});

			const result = service.getColorFromSettingsEntity('tactics', '999');
			expect(result).toBeUndefined();
		});

		it('should return undefined if settings is undefined', () => {
			mockGlobalStore.getValue.mockReturnValue({
				settings: undefined,
			});

			const result = service.getColorFromSettingsEntity('tactics', '1');
			expect(result).toBeUndefined();
		});

		it('should return undefined if key does not exist', () => {
			mockGlobalStore.getValue.mockReturnValue({
				settings: {},
			});

			const result = service.getColorFromSettingsEntity(
				'nonexistent',
				'1',
			);
			expect(result).toBeUndefined();
		});
	});

	describe('setTitle', () => {
		it('should set browser title with org name', () => {
			service.setTitle('Dashboard');

			expect(mockTitleService.setTitle).toHaveBeenCalledWith(
				'Dashboard | Test Org',
			);
		});
	});

	describe('triggerSaveMessage', () => {
		it('should show default save message', () => {
			service.triggerSaveMessage();

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'success',
				summary: 'Success',
				detail: 'Save Successful.',
				life: 2000,
			});
		});

		it('should show custom save message', () => {
			service.triggerSaveMessage('Custom message');

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'success',
				summary: 'Success',
				detail: 'Custom message',
				life: 2000,
			});
		});
	});

	describe('triggerSaveSuccessMessage', () => {
		it('should show default success message', () => {
			service.triggerSaveSuccessMessage();

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'success',
				summary: 'Success',
				detail: 'Save Successful.',
				life: 2000,
			});
		});

		it('should show custom success message', () => {
			service.triggerSaveSuccessMessage('Data saved!');

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'success',
				summary: 'Success',
				detail: 'Data saved!',
				life: 2000,
			});
		});
	});

	describe('triggerErrorMessage', () => {
		it('should show error message from HttpErrorResponse', () => {
			const err = {
				error: { message: 'Server error' },
				message: 'HTTP error',
			} as any;

			service.triggerErrorMessage(err);

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'error',
				summary: 'Error',
				detail: 'Server error',
				life: 4000,
			});
		});

		it('should show custom error message', () => {
			service.triggerErrorMessage(undefined, 'Custom error');

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'error',
				summary: 'Error',
				detail: 'Custom error',
				life: 4000,
			});
		});

		it('should show default error message when no details provided', () => {
			service.triggerErrorMessage(undefined);

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'error',
				summary: 'Error',
				detail: 'There was an error completing this task.',
				life: 4000,
			});
		});

		it('should use err.message if err.error.message not available', () => {
			const err = { message: 'Network error' } as any;

			service.triggerErrorMessage(err);

			expect(mockMessageService.add).toHaveBeenCalledWith({
				severity: 'error',
				summary: 'Error',
				detail: 'Network error',
				life: 4000,
			});
		});
	});
});
