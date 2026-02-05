import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';

import { ThemeService, Theme } from './theme.service';

describe('ThemeService', () => {
	let service: ThemeService;
	let mockDocument: Document;

	beforeEach(() => {
		// Mock localStorage
		const localStorageMock = {
			store: {} as Record<string, string>,
			getItem: vi.fn(
				(key: string) => localStorageMock.store[key] || null,
			),
			setItem: vi.fn((key: string, value: string) => {
				localStorageMock.store[key] = value;
			}),
			clear: vi.fn(() => {
				localStorageMock.store = {};
			}),
		};
		Object.defineProperty(window, 'localStorage', {
			value: localStorageMock,
		});

		// Mock matchMedia
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: vi.fn().mockImplementation((query) => ({
				matches: false,
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});

		TestBed.configureTestingModule({
			providers: [ThemeService],
		});

		mockDocument = TestBed.inject(DOCUMENT);
		service = TestBed.inject(ThemeService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('setTheme', () => {
		it('should set theme to light', () => {
			service.setTheme('light');
			expect(service.getTheme()).toBe('light');
		});

		it('should set theme to dark', () => {
			service.setTheme('dark');
			expect(service.getTheme()).toBe('dark');
		});

		it('should set theme to auto', () => {
			service.setTheme('auto');
			expect(service.getTheme()).toBe('auto');
		});

		it('should save preference to localStorage', () => {
			service.setTheme('dark');
			expect(localStorage.setItem).toHaveBeenCalledWith(
				'app-theme-preference',
				'dark',
			);
		});
	});

	describe('toggleTheme', () => {
		it('should toggle from light to dark', () => {
			service.setTheme('light');
			service.toggleTheme();
			expect(service.getTheme()).toBe('dark');
		});

		it('should toggle from dark to light', () => {
			service.setTheme('dark');
			service.toggleTheme();
			expect(service.getTheme()).toBe('light');
		});
	});

	describe('isDarkMode', () => {
		it('should return true when theme is dark', () => {
			service.setTheme('dark');
			expect(service.isDarkMode()).toBe(true);
		});

		it('should return false when theme is light', () => {
			service.setTheme('light');
			expect(service.isDarkMode()).toBe(false);
		});
	});

	describe('getAvailableThemes', () => {
		it('should return all available themes', () => {
			const themes = service.getAvailableThemes();
			expect(themes).toEqual(['light', 'dark', 'auto']);
		});
	});

	describe('getThemeDisplayName', () => {
		it('should return Light for light theme', () => {
			expect(service.getThemeDisplayName('light')).toBe('Light');
		});

		it('should return Dark for dark theme', () => {
			expect(service.getThemeDisplayName('dark')).toBe('Dark');
		});

		it('should return System for auto theme', () => {
			expect(service.getThemeDisplayName('auto')).toBe('System');
		});

		it('should return the theme value for unknown theme', () => {
			expect(service.getThemeDisplayName('unknown' as Theme)).toBe(
				'unknown',
			);
		});
	});

	describe('getThemeIcon', () => {
		it('should return light_mode for light theme', () => {
			expect(service.getThemeIcon('light')).toBe('light_mode');
		});

		it('should return dark_mode for dark theme', () => {
			expect(service.getThemeIcon('dark')).toBe('dark_mode');
		});

		it('should return brightness_auto for auto theme', () => {
			expect(service.getThemeIcon('auto')).toBe('brightness_auto');
		});

		it('should return brightness_medium for unknown theme', () => {
			expect(service.getThemeIcon('unknown' as Theme)).toBe(
				'brightness_medium',
			);
		});
	});

	describe('initialize', () => {
		it('should apply the current theme', () => {
			service.setTheme('dark');
			service.initialize();
			expect(
				mockDocument.documentElement.getAttribute('data-theme'),
			).toBe('dark');
		});
	});

	describe('currentTheme signal', () => {
		it('should be readonly', () => {
			expect(service.currentTheme).toBeDefined();
		});

		it('should reflect current theme value', () => {
			service.setTheme('dark');
			expect(service.currentTheme()).toBe('dark');
		});
	});
});
