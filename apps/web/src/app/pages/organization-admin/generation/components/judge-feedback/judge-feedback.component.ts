import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KeyValuePipe } from '@angular/common';

import { AgentEvaluationSnapshot } from '../../../../../shared/models/generation-request.model';
import { PrimeNgModule } from '../../../../../shared/primeng.module';

@Component({
	selector: 'app-judge-feedback',
	templateUrl: './judge-feedback.component.html',
	styleUrls: ['./judge-feedback.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, KeyValuePipe, PrimeNgModule],
})
export class JudgeFeedbackComponent {
	evaluation = input.required<AgentEvaluationSnapshot>();

	getCategoryEntries(): { key: string; value: number }[] {
		const scores = this.evaluation().categoryScores;
		if (!scores) return [];
		return Object.entries(scores).map(([key, value]) => ({ key, value }));
	}

	getChecklistEntries(): {
		key: string;
		passed: boolean;
		note?: string;
	}[] {
		const checklist = this.evaluation().checklist;
		if (!checklist) return [];
		return Object.entries(checklist).map(([key, val]) => ({
			key,
			passed: val.passed,
			note: val.note,
		}));
	}

	getScoreBarColor(score: number): string {
		if (score >= 80) return 'var(--p-green-500)';
		if (score >= 60) return 'var(--p-yellow-500)';
		return 'var(--p-red-500)';
	}
}
