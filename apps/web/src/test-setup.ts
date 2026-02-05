/// <reference types="vitest/globals" />
import '@angular/compiler';
import { vi } from 'vitest';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

// Ensure localStorage has all required methods (happy-dom may have incomplete implementation)
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] ?? null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		get length() {
			return Object.keys(store).length;
		},
		key: (index: number) => Object.keys(store)[index] ?? null,
	};
})();

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true,
});

// Mock the Okta sign-in widget to avoid canvas API issues in test environment
vi.mock('@okta/okta-signin-widget', () => ({
	default: class MockOktaSignIn {
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		constructor() {}
		showSignInToGetTokens() {
			return Promise.resolve({
				accessToken: 'mock-access-token',
				idToken: 'mock-id-token',
			});
		}
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		remove() {}
	},
}));

// Initialize the Angular test environment with zoneless change detection
setupTestBed({
	zoneless: true,
});
