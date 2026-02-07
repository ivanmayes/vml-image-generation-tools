import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { OrganizationAdminPage } from './organization-admin.page';

const routes: Routes = [
	{
		path: '',
		component: OrganizationAdminPage,
		children: [
			{
				path: 'users',
				loadChildren: () =>
					import('./users/users.module').then(
						(m) => m.UsersPageModule,
					),
			},
			{
				path: 'spaces',
				loadChildren: () =>
					import('./spaces/spaces.module').then(
						(m) => m.SpacesPageModule,
					),
			},
			{
				path: 'judges',
				loadChildren: () =>
					import('./judges/judges.module').then(
						(m) => m.JudgesPageModule,
					),
			},
			{
				path: 'compliance',
				loadChildren: () =>
					import('./compliance/compliance.module').then(
						(m) => m.CompliancePageModule,
					),
			},
			{
				path: 'settings',
				loadChildren: () =>
					import('./settings/settings.module').then(
						(m) => m.SettingsPageModule,
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

@NgModule({
	imports: [RouterModule.forChild(routes)],
	exports: [RouterModule],
})
export class OrganizationAdminRoutingModule {}
