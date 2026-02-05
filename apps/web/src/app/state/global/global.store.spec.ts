import { TestBed } from '@angular/core/testing';

import { GlobalStore, createInitialState } from './global.store';
import { initialGlobalState } from './global.model';

describe('GlobalStore', () => {
	let store: GlobalStore;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [GlobalStore],
		});
		store = TestBed.inject(GlobalStore);
	});

	it('should be created', () => {
		expect(store).toBeTruthy();
	});

	describe('createInitialState', () => {
		it('should return initial global state', () => {
			const state = createInitialState();
			expect(state).toEqual(initialGlobalState);
		});
	});

	describe('initial state', () => {
		it('should have correct default values', () => {
			const state = store.getValue();

			expect(state.header.visible).toBe(true);
			expect(state.header.invert).toBe(false);
			expect(state.header.floating).toBe(false);
			expect(state.settings).toBeUndefined();
			expect(state.adminMode).toBe(false);
		});
	});

	describe('update', () => {
		it('should update adminMode', () => {
			store.update({ adminMode: true });

			expect(store.getValue().adminMode).toBe(true);
		});

		it('should update header settings', () => {
			store.update({
				header: {
					visible: false,
					invert: true,
					floating: true,
				},
			});

			const header = store.getValue().header;
			expect(header.visible).toBe(false);
			expect(header.invert).toBe(true);
			expect(header.floating).toBe(true);
		});

		it('should update settings', () => {
			const settings = {
				id: '123',
				name: 'Test Org',
				settings: {},
				authenticationStrategies: [],
			};

			store.update({ settings: settings as any });

			expect(store.getValue().settings).toEqual(settings);
		});
	});

	describe('setLoading', () => {
		it('should set loading state without error', () => {
			// setLoading is an Akita store method - we verify it can be called without errors
			expect(() => store.setLoading(true)).not.toThrow();
			expect(() => store.setLoading(false)).not.toThrow();
		});
	});
});
