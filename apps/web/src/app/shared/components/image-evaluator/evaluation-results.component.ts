import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../primeng.module';
import type { EvaluationResult } from '../../models/agent.model';

@Component({
	selector: 'app-evaluation-results',
	templateUrl: './evaluation-results.component.html',
	styleUrls: ['./evaluation-results.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class EvaluationResultsComponent {
	@Input({ required: true }) result!: EvaluationResult;
	@Input() judgeName?: string;

	getChecklistEntries(): [string, { passed: boolean; note?: string }][] {
		if (!this.result?.checklist) return [];
		return Object.entries(this.result.checklist);
	}

	getCategoryScoreEntries(): [string, number][] {
		if (!this.result?.categoryScores) return [];
		return Object.entries(this.result.categoryScores);
	}

	getScoreSeverity(score: number): 'success' | 'warn' | 'danger' {
		if (score >= 80) return 'success';
		if (score >= 60) return 'warn';
		return 'danger';
	}

	getSeverityColor(
		severity: string,
	): 'danger' | 'warn' | 'info' | 'secondary' {
		switch (severity) {
			case 'critical':
				return 'danger';
			case 'major':
				return 'warn';
			case 'moderate':
				return 'info';
			default:
				return 'secondary';
		}
	}
}
