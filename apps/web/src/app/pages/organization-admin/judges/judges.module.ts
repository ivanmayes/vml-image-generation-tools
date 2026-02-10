import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { JudgesPage } from './judges.page';
import { JudgeDetailPage } from './judge-detail/judge-detail.page';

@NgModule({
	imports: [
		CommonModule,
		ReactiveFormsModule,
		SharedModule,
		PrimeNgModule,
		ConfirmDialogModule,
		JudgesPage,
		JudgeDetailPage,
		RouterModule.forChild([
			{
				path: '',
				component: JudgesPage,
			},
			{
				path: 'new',
				component: JudgeDetailPage,
			},
			{
				path: ':id',
				component: JudgeDetailPage,
			},
		]),
	],
})
export class JudgesPageModule {}
