import { TestBed } from '@angular/core/testing';
import {
	HttpClientTestingModule,
	HttpTestingController,
} from '@angular/common/http/testing';

import { environment } from '../../../environments/environment';

import { SessionService } from './session.service';
import { SessionStore } from './session.store';

describe('SessionService', () => {
	let service: SessionService;
	let httpMock: HttpTestingController;
	let mockSessionStore: {
		setLoading: ReturnType<typeof vi.fn>;
		setError: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		login: ReturnType<typeof vi.fn>;
		logout: ReturnType<typeof vi.fn>;
		updateLoginDetails: ReturnType<typeof vi.fn>;
		getValue: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		mockSessionStore = {
			setLoading: vi.fn(),
			setError: vi.fn(),
			update: vi.fn(),
			login: vi.fn(),
			logout: vi.fn(),
			updateLoginDetails: vi.fn(),
			getValue: vi.fn().mockReturnValue({
				user: { email: 'test@example.com' },
				token: 'test-token',
			}),
		};

		TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			providers: [
				SessionService,
				{ provide: SessionStore, useValue: mockSessionStore },
			],
		});

		service = TestBed.inject(SessionService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('wppOpenLogin', () => {
		it('should login via WPP Open', () => {
			const mockResponse = {
				token: 'wpp-token',
				profile: { email: 'wpp@example.com' },
				data: { redirect: '/home' },
			};

			service
				.wppOpenLogin('token123', 'org123', 'workspace', 'scope')
				.subscribe((result) => {
					expect(result).toEqual(mockResponse);
				});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/auth/wpp-open/sign-in`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body.token).toBe('token123');
			expect(req.request.body.organizationId).toBe('org123');
			req.flush(mockResponse);

			expect(mockSessionStore.setLoading).toHaveBeenCalledWith(true);
			expect(mockSessionStore.login).toHaveBeenCalledWith({
				initialUrl: '/home',
				token: 'wpp-token',
				user: { email: 'wpp@example.com' },
			});
		});

		it('should handle WPP Open login error', () => {
			service.wppOpenLogin('token123', 'org123').subscribe({
				error: (err) => {
					expect(err.status).toBe(401);
				},
			});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/auth/wpp-open/sign-in`,
			);
			req.flush(
				{ message: 'Unauthorized' },
				{ status: 401, statusText: 'Unauthorized' },
			);

			expect(mockSessionStore.setLoading).toHaveBeenCalledWith(false);
		});
	});

	describe('requestCode', () => {
		it('should request verification code', () => {
			const mockResponse = {
				data: {
					clientId: 'client123',
					issuer: 'https://issuer.com',
					strategy: 'basic',
				},
			};

			service.requestCode('test@example.com').subscribe((result) => {
				expect(result).toEqual(mockResponse);
			});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/auth/request-sign-in`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body.email).toBe('test@example.com');
			expect(req.request.body.organizationId).toBe(
				environment.organizationId,
			);
			req.flush(mockResponse);

			expect(mockSessionStore.setLoading).toHaveBeenCalledWith(true);
			expect(mockSessionStore.updateLoginDetails).toHaveBeenCalledWith({
				clientId: 'client123',
				issuer: 'https://issuer.com',
				user: { email: 'test@example.com' },
			});
		});

		it('should handle request code error', () => {
			service.requestCode('invalid@example.com').subscribe({
				error: (err) => {
					expect(err.status).toBe(404);
				},
			});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/auth/request-sign-in`,
			);
			req.flush(
				{ message: 'User not found' },
				{ status: 404, statusText: 'Not Found' },
			);

			expect(mockSessionStore.setLoading).toHaveBeenCalledWith(false);
			expect(mockSessionStore.setError).toHaveBeenCalled();
		});
	});

	describe('activateEmail', () => {
		it('should activate email with code', () => {
			const mockResponse = {
				data: {
					token: 'access-token',
					user: { email: 'test@example.com', id: '123' },
				},
			};

			service
				.activateEmail('test@example.com', '123456')
				.subscribe((result) => {
					expect(result).toEqual(mockResponse);
				});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/auth/basic/code-sign-in`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body.email).toBe('test@example.com');
			expect(req.request.body.singlePass).toBe('123456');
			req.flush(mockResponse);

			expect(mockSessionStore.login).toHaveBeenCalledWith({
				token: 'access-token',
				user: { email: 'test@example.com', id: '123' },
			});
		});
	});

	describe('oktaSignIn', () => {
		it('should sign in via Okta', () => {
			const mockResponse = {
				data: {
					token: 'okta-token',
					user: { email: 'okta@example.com' },
				},
			};

			const accessToken = { accessToken: 'access' } as any;
			const idToken = { idToken: 'id' } as any;

			service
				.oktaSignIn('okta@example.com', accessToken, idToken)
				.subscribe((result) => {
					expect(result).toEqual(mockResponse);
				});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/auth/okta/sign-in`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body.email).toBe('okta@example.com');
			req.flush(mockResponse);

			expect(mockSessionStore.login).toHaveBeenCalled();
		});
	});

	describe('samlSignIn', () => {
		it('should sign in via SAML', () => {
			const mockResponse = {
				data: {
					token: 'saml-token',
					user: { email: 'saml@example.com' },
				},
			};

			service.samlSignIn('org123', 'challenge123').subscribe((result) => {
				expect(result).toEqual(mockResponse);
			});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/auth/saml/sign-in`,
			);
			expect(req.request.method).toBe('POST');
			expect(req.request.body.organizationId).toBe('org123');
			expect(req.request.body.authChallenge).toBe('challenge123');
			req.flush(mockResponse);

			expect(mockSessionStore.login).toHaveBeenCalled();
		});
	});

	describe('getUserStatus', () => {
		it('should get user status', () => {
			const mockResponse = {
				data: {
					token: 'refreshed-token',
					user: { email: 'test@example.com' },
				},
			};

			service.getUserStatus('old-token').subscribe((result) => {
				expect(result).toEqual(mockResponse);
			});

			const req = httpMock.expectOne(
				`${environment.apiUrl}/user/refresh`,
			);
			expect(req.request.method).toBe('GET');
			req.flush(mockResponse);

			expect(mockSessionStore.login).toHaveBeenCalled();
		});
	});

	describe('setLoading', () => {
		it('should set loading state to true', () => {
			service.setLoading(true);
			expect(mockSessionStore.setLoading).toHaveBeenCalledWith(true);
		});

		it('should set loading state to false', () => {
			service.setLoading(false);
			expect(mockSessionStore.setLoading).toHaveBeenCalledWith(false);
		});
	});

	describe('setInitialUrl', () => {
		it('should set initial URL', () => {
			service.setInitialUrl('/dashboard');

			expect(mockSessionStore.update).toHaveBeenCalledWith({
				initialUrl: '/dashboard',
			});
		});
	});

	describe('logout', () => {
		it('should call store logout', () => {
			service.logout();
			expect(mockSessionStore.logout).toHaveBeenCalled();
		});
	});
});
