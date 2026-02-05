import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';

import { SidebarService, NavItem } from '../../services/sidebar.service';
import { ThemeService } from '../../services/theme.service';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';
import { GlobalQuery } from '../../../state/global/global.query';

import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
	let component: SidebarComponent;
	let fixture: ComponentFixture<SidebarComponent>;
	let router: Router;
	let mockSessionService: { logout: ReturnType<typeof vi.fn> };

	const mockNavItems: NavItem[] = [
		{ id: 'home', icon: 'home', label: 'Home', route: '/home' },
		{
			id: 'dashboard',
			icon: 'dashboard',
			label: 'Dashboard',
			route: '/dashboard',
		},
	];

	beforeEach(async () => {
		mockSessionService = { logout: vi.fn() };

		await TestBed.configureTestingModule({
			imports: [SidebarComponent],
			providers: [
				provideRouter([]),
				{
					provide: SidebarService,
					useValue: {
						navigationItems: signal(mockNavItems),
					},
				},
				{
					provide: ThemeService,
					useValue: {
						currentTheme: signal('light'),
						toggleTheme: vi.fn(),
						isDarkMode: vi.fn(() => false),
					},
				},
				{
					provide: SessionQuery,
					useValue: {
						user: signal({ email: 'test@example.com' }),
						isAdmin: signal(false),
					},
				},
				{
					provide: SessionService,
					useValue: mockSessionService,
				},
				{
					provide: GlobalQuery,
					useValue: {
						settings: signal({ name: 'Test App' }),
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(SidebarComponent);
		component = fixture.componentInstance;
		router = TestBed.inject(Router);
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	describe('getUserInitial', () => {
		it('should return first character of email uppercased', () => {
			const user = { email: 'john@example.com' } as any;
			expect(component.getUserInitial(user)).toBe('J');
		});

		it('should return U for undefined user', () => {
			expect(component.getUserInitial(undefined)).toBe('U');
		});

		it('should return U for user without email', () => {
			const user = {} as any;
			expect(component.getUserInitial(user)).toBe('U');
		});

		it('should handle lowercase email', () => {
			const user = { email: 'alice@example.com' } as any;
			expect(component.getUserInitial(user)).toBe('A');
		});
	});

	describe('handleItemClick', () => {
		it('should navigate when item has route', () => {
			const navigateSpy = vi.spyOn(router, 'navigate');
			const item: NavItem = {
				id: 'test',
				icon: 'test',
				label: 'Test',
				route: '/test',
			};

			component.handleItemClick(item);

			expect(navigateSpy).toHaveBeenCalledWith(['/test']);
		});

		it('should not navigate when item has no route', () => {
			const navigateSpy = vi.spyOn(router, 'navigate');
			const item: NavItem = { id: 'test', icon: 'test', label: 'Test' };

			component.handleItemClick(item);

			expect(navigateSpy).not.toHaveBeenCalled();
		});
	});

	describe('navigateToAdmin', () => {
		it('should navigate to admin page', () => {
			const navigateSpy = vi.spyOn(router, 'navigate');

			component.navigateToAdmin();

			expect(navigateSpy).toHaveBeenCalledWith(['/organization/admin']);
		});
	});

	describe('logout', () => {
		it('should call sessionService.logout', () => {
			component.logout();
			expect(mockSessionService.logout).toHaveBeenCalled();
		});

		it('should navigate to login page', () => {
			const navigateSpy = vi.spyOn(router, 'navigate');

			component.logout();

			expect(navigateSpy).toHaveBeenCalledWith(['/login']);
		});
	});

	describe('isActiveRoute', () => {
		it('should return true for exact match', () => {
			vi.spyOn(router, 'url', 'get').mockReturnValue('/home');
			expect(component.isActiveRoute('/home')).toBe(true);
		});

		it('should return true for child route', () => {
			vi.spyOn(router, 'url', 'get').mockReturnValue('/home/details');
			expect(component.isActiveRoute('/home')).toBe(true);
		});

		it('should return false for non-matching route', () => {
			vi.spyOn(router, 'url', 'get').mockReturnValue('/dashboard');
			expect(component.isActiveRoute('/home')).toBe(false);
		});

		it('should not match partial route names', () => {
			vi.spyOn(router, 'url', 'get').mockReturnValue('/homepage');
			expect(component.isActiveRoute('/home')).toBe(false);
		});
	});

	describe('signals', () => {
		it('should expose user signal', () => {
			expect(component.user()).toEqual({ email: 'test@example.com' });
		});

		it('should expose settings signal', () => {
			expect(component.settings()).toEqual({ name: 'Test App' });
		});

		it('should expose isAdmin signal', () => {
			expect(component.isAdmin()).toBe(false);
		});

		it('should expose navItems signal', () => {
			expect(component.navItems()).toEqual(mockNavItems);
		});
	});
});
