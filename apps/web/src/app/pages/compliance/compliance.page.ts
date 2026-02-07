import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../shared/primeng.module';
import { ImageEvaluatorComponent } from '../../shared/components/image-evaluator/image-evaluator.component';

@Component({
	selector: 'app-compliance-tool',
	templateUrl: './compliance.page.html',
	styleUrls: ['./compliance.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, ImageEvaluatorComponent],
})
export class ComplianceToolPage {}
