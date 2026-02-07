import {
	ChangeDetectionStrategy,
	Component,
	input,
	signal,
	OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import {
	IterationSnapshot,
	GeneratedImage,
} from '../../../../shared/models/generation-request.model';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { JudgeFeedbackComponent } from '../judge-feedback/judge-feedback.component';

@Component({
	selector: 'app-round-card',
	templateUrl: './round-card.component.html',
	styleUrls: ['./round-card.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, JudgeFeedbackComponent],
})
export class RoundCardComponent implements OnInit {
	iteration = input.required<IterationSnapshot>();
	images = input<GeneratedImage[]>([]);
	isLatest = input(false);
	defaultExpanded = input(false);

	showPrompt = signal(false);
	expanded = signal(true);

	ngOnInit(): void {
		this.expanded.set(this.defaultExpanded());
	}

	toggleExpanded(): void {
		this.expanded.update((v) => !v);
	}

	togglePrompt(): void {
		this.showPrompt.update((v) => !v);
	}

	getScoreColor(score: number): string {
		if (score >= 80) return 'var(--p-green-500)';
		if (score >= 60) return 'var(--p-yellow-500)';
		return 'var(--p-red-500)';
	}

	getScoreSeverity(score: number): 'success' | 'warn' | 'danger' | 'info' {
		if (score >= 80) return 'success';
		if (score >= 60) return 'warn';
		return 'danger';
	}

	getScoreClass(score: number): string {
		if (score >= 80) return 'score-chip--success';
		if (score >= 60) return 'score-chip--warn';
		return 'score-chip--danger';
	}

	getIterationImages(): GeneratedImage[] {
		const iterNum = this.iteration().iterationNumber;
		return this.images().filter((img) => img.iterationNumber === iterNum);
	}
}
