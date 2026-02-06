import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { GenerationListPage } from './generation-list.page';
import { GenerationNewPage } from './generation-new/generation-new.page';
import { GenerationDetailPage } from './generation-detail/generation-detail.page';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild([
			{
				path: '',
				component: GenerationListPage,
			},
			{
				path: 'new',
				component: GenerationNewPage,
			},
			{
				path: ':id',
				component: GenerationDetailPage,
			},
		]),
		GenerationListPage,
		GenerationNewPage,
		GenerationDetailPage,
	],
})
export class GenerationPageModule {}
