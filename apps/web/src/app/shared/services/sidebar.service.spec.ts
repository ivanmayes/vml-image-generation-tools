import { TestBed } from '@angular/core/testing';

import { SidebarService, NavItem } from './sidebar.service';

describe('SidebarService', () => {
	let service: SidebarService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [SidebarService],
		});
		service = TestBed.inject(SidebarService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('navigationItems', () => {
		it('should have initial navigation items', () => {
			const items = service.navigationItems();
			expect(items).toBeDefined();
			expect(items.length).toBeGreaterThan(0);
		});

		it('should have home item by default', () => {
			const items = service.navigationItems();
			const homeItem = items.find((item) => item.id === 'home');
			expect(homeItem).toBeDefined();
			expect(homeItem?.route).toBe('/home');
		});
	});

	describe('setNavigationItems', () => {
		it('should replace all navigation items', () => {
			const newItems: NavItem[] = [
				{
					id: 'dashboard',
					icon: 'dashboard',
					label: 'Dashboard',
					route: '/dashboard',
				},
				{
					id: 'settings',
					icon: 'settings',
					label: 'Settings',
					route: '/settings',
				},
			];

			service.setNavigationItems(newItems);
			const items = service.navigationItems();

			expect(items).toEqual(newItems);
			expect(items.length).toBe(2);
		});

		it('should allow setting empty array', () => {
			service.setNavigationItems([]);
			expect(service.navigationItems()).toEqual([]);
		});
	});

	describe('addNavigationItem', () => {
		it('should add a new navigation item', () => {
			const initialLength = service.navigationItems().length;
			const newItem: NavItem = {
				id: 'reports',
				icon: 'report',
				label: 'Reports',
				route: '/reports',
			};

			service.addNavigationItem(newItem);
			const items = service.navigationItems();

			expect(items.length).toBe(initialLength + 1);
			expect(items.find((item) => item.id === 'reports')).toEqual(
				newItem,
			);
		});

		it('should add item with badge', () => {
			const newItem: NavItem = {
				id: 'notifications',
				icon: 'notifications',
				label: 'Notifications',
				route: '/notifications',
				badge: 5,
				badgeColor: 'warn',
			};

			service.addNavigationItem(newItem);
			const item = service
				.navigationItems()
				.find((i) => i.id === 'notifications');

			expect(item?.badge).toBe(5);
			expect(item?.badgeColor).toBe('warn');
		});
	});

	describe('removeNavigationItem', () => {
		it('should remove navigation item by id', () => {
			const items = service.navigationItems();
			const initialLength = items.length;
			const itemToRemove = items[0];

			service.removeNavigationItem(itemToRemove.id);

			expect(service.navigationItems().length).toBe(initialLength - 1);
			expect(
				service.navigationItems().find((i) => i.id === itemToRemove.id),
			).toBeUndefined();
		});

		it('should do nothing if item id does not exist', () => {
			const initialLength = service.navigationItems().length;

			service.removeNavigationItem('non-existent-id');

			expect(service.navigationItems().length).toBe(initialLength);
		});
	});

	describe('updateItemBadge', () => {
		it('should update badge for existing item', () => {
			const itemId = service.navigationItems()[0].id;

			service.updateItemBadge(itemId, 10, 'primary');
			const item = service.navigationItems().find((i) => i.id === itemId);

			expect(item?.badge).toBe(10);
			expect(item?.badgeColor).toBe('primary');
		});

		it('should clear badge when value is undefined', () => {
			const itemId = service.navigationItems()[0].id;

			service.updateItemBadge(itemId, 5);
			service.updateItemBadge(itemId, undefined);

			const item = service.navigationItems().find((i) => i.id === itemId);
			expect(item?.badge).toBeUndefined();
		});

		it('should do nothing if item id does not exist', () => {
			const initialItems = JSON.stringify(service.navigationItems());

			service.updateItemBadge('non-existent-id', 10);

			expect(JSON.stringify(service.navigationItems())).toBe(
				initialItems,
			);
		});

		it('should update badge with string value', () => {
			const itemId = service.navigationItems()[0].id;

			service.updateItemBadge(itemId, 'NEW', 'accent');
			const item = service.navigationItems().find((i) => i.id === itemId);

			expect(item?.badge).toBe('NEW');
			expect(item?.badgeColor).toBe('accent');
		});
	});
});
