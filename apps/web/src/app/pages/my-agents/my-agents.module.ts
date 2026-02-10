import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';

import { MyAgentsPage } from './my-agents.page';
import { MyAgentDetailPage } from './my-agent-detail/my-agent-detail.page';

@NgModule({
	imports: [
		CommonModule,
		ReactiveFormsModule,
		SharedModule,
		PrimeNgModule,
		ConfirmDialogModule,
		MyAgentsPage,
		MyAgentDetailPage,
		RouterModule.forChild([
			{
				path: '',
				component: MyAgentsPage,
			},
			{
				path: 'new',
				component: MyAgentDetailPage,
			},
			{
				path: ':id',
				component: MyAgentDetailPage,
			},
		]),
	],
})
export class MyAgentsPageModule {}
