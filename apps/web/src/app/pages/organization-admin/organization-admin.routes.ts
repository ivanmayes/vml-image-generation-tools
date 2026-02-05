import { Routes } from '@angular/router';

import { OrganizationAdminPage } from './organization-admin.page';

export const organizationAdminRoutes: Routes = [
	{
		path: '',
		component: OrganizationAdminPage,
		children: [
			{
				path: 'users',
				loadComponent: () =>
					import('./users/users.page').then((m) => m.UsersPage),
			},
			{
				path: 'spaces',
				loadComponent: () =>
					import('./spaces/spaces.page').then((m) => m.SpacesPage),
			},
			{
				path: 'settings',
				loadComponent: () =>
					import('./settings/settings.page').then(
						(m) => m.SettingsPage,
					),
			},
			{
				path: '',
				redirectTo: 'users',
				pathMatch: 'full',
			},
		],
	},
];
