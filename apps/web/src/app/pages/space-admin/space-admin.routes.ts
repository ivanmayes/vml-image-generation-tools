import { Routes } from '@angular/router';

import { SpaceAdminPage } from './space-admin.page';

export const spaceAdminRoutes: Routes = [
	{
		path: '',
		component: SpaceAdminPage,
		children: [
			{
				path: 'settings',
				loadComponent: () =>
					import('./settings/settings.page').then(
						(m) => m.SettingsPage,
					),
			},
			{
				path: 'users',
				loadComponent: () =>
					import('./users/users.page').then((m) => m.UsersPage),
			},
			{
				path: '',
				redirectTo: 'settings',
				pathMatch: 'full',
			},
		],
	},
];
