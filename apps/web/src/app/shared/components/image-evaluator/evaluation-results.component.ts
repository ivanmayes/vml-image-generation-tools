import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { PrimeNgModule } from '../../primeng.module';
import { getScoreSeverity } from '../../utils/score.utils';
import type { EvaluationResult } from '../../models/agent.model';

@Component({
	selector: 'app-evaluation-results',
	templateUrl: './evaluation-results.component.html',
	styleUrls: ['./evaluation-results.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, MarkdownPipe],
})
export class EvaluationResultsComponent {
	result = input.required<EvaluationResult>();
	judgeName = input<string>();

	getChecklistEntries(): [string, { passed: boolean; note?: string }][] {
		const checklist = this.result()?.checklist;
		if (!checklist) return [];
		return Object.entries(checklist);
	}

	getCategoryScoreEntries(): [string, number][] {
		const categoryScores = this.result()?.categoryScores;
		if (!categoryScores) return [];
		return Object.entries(categoryScores);
	}

	readonly getScoreSeverity = getScoreSeverity;

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
