import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { CompliancePage } from './compliance.page';

const routes: Routes = [
	{
		path: '',
		component: CompliancePage,
	},
];

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild(routes),
		CompliancePage,
	],
})
export class CompliancePageModule {}
