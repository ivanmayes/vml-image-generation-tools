import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PrimeNgModule } from '../../../shared/primeng.module';
import type { Agent } from '../../../shared/models/agent.model';

@Component({
	selector: 'app-bulk-compliance-header',
	templateUrl: './bulk-compliance-header.component.html',
	styleUrls: ['./bulk-compliance-header.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class BulkComplianceHeaderComponent {
	judges = input<Agent[]>([]);
	selectedJudgeIds = input<string[]>([]);
	brief = input<string>('');
	loading = input(false);
	evaluating = input(false);

	selectedJudgeIdsChange = output<string[]>();
	briefChange = output<string>();
}
