import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
	computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../shared/primeng.module';
import {
	SCORE_THRESHOLDS,
	getScoreSeverity,
} from '../../../shared/utils/score.utils';
import type { ComplianceImage } from '../../../shared/models/compliance-image.model';

@Component({
	selector: 'app-image-card',
	templateUrl: './image-card.component.html',
	styleUrls: ['./image-card.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class ImageCardComponent {
	image = input.required<ComplianceImage>();
	index = input(0);

	remove = output<string>();
	cardSelect = output<string>();
	retry = output<string>();

	readonly isComplete = computed(() => this.image().status === 'complete');
	readonly isFailed = computed(() => this.image().status === 'failed');
	readonly isEvaluating = computed(
		() => this.image().status === 'evaluating',
	);

	readonly aggregateScore = computed(() => {
		const img = this.image();
		return img.status === 'complete' ? img.aggregateScore : 0;
	});

	readonly evaluationCount = computed(() => {
		const img = this.image();
		return img.status === 'complete' ? img.evaluations.length : 0;
	});

	readonly errorMessage = computed(() => {
		const img = this.image();
		return img.status === 'failed' ? img.error : '';
	});

	readonly canRetry = computed(() => {
		const img = this.image();
		return img.status === 'failed' && !img.url.startsWith('blob:');
	});

	readonly scoreClass = computed(() => {
		const img = this.image();
		if (img.status !== 'complete') return '';
		if (img.aggregateScore >= SCORE_THRESHOLDS.PASS)
			return 'compliance-card--pass';
		if (img.aggregateScore >= SCORE_THRESHOLDS.WARN)
			return 'compliance-card--warn';
		return 'compliance-card--fail';
	});

	readonly getScoreSeverity = getScoreSeverity;

	onRemove(event: Event): void {
		event.stopPropagation();
		this.remove.emit(this.image().id);
	}

	onRetry(event: Event): void {
		event.stopPropagation();
		this.retry.emit(this.image().id);
	}

	onClick(): void {
		if (this.isComplete()) {
			this.cardSelect.emit(this.image().id);
		}
	}
}
