import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';

import { ComplianceToolPage } from './compliance.page';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild([
			{
				path: '',
				component: ComplianceToolPage,
			},
		]),
		ComplianceToolPage,
	],
})
export class ComplianceToolModule {}
