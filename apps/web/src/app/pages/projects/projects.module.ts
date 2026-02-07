import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';

import { ProjectListPage } from './project-list/project-list.page';
import { ProjectDetailPage } from './project-detail/project-detail.page';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild([
			{
				path: '',
				component: ProjectListPage,
			},
			{
				path: ':projectId',
				component: ProjectDetailPage,
			},
			{
				path: ':projectId/generation',
				loadChildren: () =>
					import('../generation/generation.module').then(
						(m) => m.GenerationPageModule,
					),
			},
			{
				path: ':projectId/compliance',
				loadChildren: () =>
					import('../compliance/compliance.module').then(
						(m) => m.ComplianceToolModule,
					),
			},
		]),
		ProjectListPage,
		ProjectDetailPage,
	],
})
export class ProjectsModule {}
