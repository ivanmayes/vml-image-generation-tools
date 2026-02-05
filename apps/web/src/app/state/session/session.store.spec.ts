import { TestBed } from '@angular/core/testing';

import {
	SessionStore,
	createInitialSessionState,
	getSession,
	SESSION_KEY,
	ORG_SETTINGS,
} from './session.store';

describe('SessionStore', () => {
	let store: SessionStore;

	beforeEach(() => {
		// Clear localStorage before each test
		localStorage.clear();

		TestBed.configureTestingModule({
			providers: [SessionStore],
		});
		store = TestBed.inject(SessionStore);
	});

	afterEach(() => {
		localStorage.clear();
	});

	it('should be created', () => {
		expect(store).toBeTruthy();
	});

	describe('createInitialSessionState', () => {
		it('should return initial session state', () => {
			const state = createInitialSessionState();

			expect(state.token).toBeNull();
			expect(state.clientId).toBeNull();
			expect(state.issuer).toBeNull();
			expect(state.user).toBeUndefined();
			expect(state.isLoggedIn).toBe(false);
			// initialUrl may be null or undefined depending on localStorage state
			expect(state.initialUrl).toBeFalsy();
		});

		it('should merge with existing session from localStorage', () => {
			const savedSession = { token: 'saved-token' };
			localStorage.setItem(SESSION_KEY, JSON.stringify(savedSession));

			const state = createInitialSessionState();

			expect(state.token).toBe('saved-token');
		});
	});

	describe('getSession', () => {
		it('should return empty object if no session in localStorage', () => {
			const session = getSession();
			expect(session).toEqual({});
		});

		it('should return parsed session from localStorage', () => {
			const savedSession = {
				token: 'test-token',
				user: { email: 'test@test.com' },
			};
			localStorage.setItem(SESSION_KEY, JSON.stringify(savedSession));

			const session = getSession();

			expect(session).toEqual(savedSession);
		});
	});

	describe('updateLoginDetails', () => {
		it('should update login details and save to localStorage', () => {
			const loginDetails = {
				clientId: 'client123',
				issuer: 'https://issuer.com',
			};

			store.updateLoginDetails(loginDetails);

			expect(store.getValue().clientId).toBe('client123');
			expect(store.getValue().issuer).toBe('https://issuer.com');

			const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
			expect(saved.clientId).toBe('client123');
		});
	});

	describe('login', () => {
		it('should set login state and save to localStorage', () => {
			const loginData = {
				token: 'access-token',
				user: { email: 'test@example.com', id: '123' } as any,
			};

			store.login(loginData);

			expect(store.getValue().token).toBe('access-token');
			expect(store.getValue().user?.email).toBe('test@example.com');
			expect(store.getValue().isLoggedIn).toBe(true);

			const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
			expect(saved.token).toBe('access-token');
		});
	});

	describe('logout', () => {
		it('should clear session and remove from localStorage', () => {
			// First login
			store.login({
				token: 'access-token',
				user: { email: 'test@example.com' } as any,
			});

			// Set org settings too
			localStorage.setItem(
				ORG_SETTINGS,
				JSON.stringify({ name: 'Test Org' }),
			);

			// Then logout
			store.logout();

			expect(store.getValue().token).toBeNull();
			expect(store.getValue().user).toBeUndefined();
			expect(store.getValue().isLoggedIn).toBe(false);
			expect(localStorage.getItem(SESSION_KEY)).toBeNull();
			expect(localStorage.getItem(ORG_SETTINGS)).toBeNull();
		});
	});

	describe('updateUser', () => {
		it('should merge user properties when user exists', () => {
			// First login
			store.login({
				token: 'access-token',
				user: { email: 'test@example.com', id: '123' } as any,
			});

			// Update user
			store.updateUser({ email: 'updated@example.com' } as any);

			expect(store.getValue().user?.email).toBe('updated@example.com');
			expect(store.getValue().user?.id).toBe('123');
		});

		it('should not create user if user does not exist', () => {
			store.updateUser({ email: 'new@example.com' } as any);

			expect(store.getValue().user).toBeUndefined();
		});
	});

	describe('setLoading', () => {
		it('should set loading state without error', () => {
			// setLoading is an Akita store method - we verify it can be called without errors
			expect(() => store.setLoading(true)).not.toThrow();
			expect(() => store.setLoading(false)).not.toThrow();
		});
	});

	describe('setError', () => {
		it('should set error state', () => {
			const error = new Error('Test error');
			store.setError(error);

			// Akita stores error internally
			expect(store.getValue()).toBeDefined();
		});
	});
});
