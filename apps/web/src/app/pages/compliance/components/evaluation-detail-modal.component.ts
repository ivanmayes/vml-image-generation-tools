import {
	AfterViewChecked,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	input,
	output,
	computed,
	viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../shared/primeng.module';
import { EvaluationResultsComponent } from '../../../shared/components/image-evaluator/evaluation-results.component';
import {
	SCORE_THRESHOLDS,
	getScoreSeverity,
	getScoreLabel,
} from '../../../shared/utils/score.utils';
import type { ComplianceImage } from '../../../shared/models/compliance-image.model';

@Component({
	selector: 'app-evaluation-detail-modal',
	templateUrl: './evaluation-detail-modal.component.html',
	styleUrls: ['./evaluation-detail-modal.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, EvaluationResultsComponent],
})
export class EvaluationDetailModalComponent implements AfterViewChecked {
	private readonly detailLayout = viewChild<ElementRef>('detailLayout');
	private needsFocus = false;
	private prevVisible = false;

	visible = input(false);
	image = input<ComplianceImage | null>(null);
	hasPrev = input(false);
	hasNext = input(false);

	visibleChange = output<boolean>();
	navigatePrev = output<void>();
	navigateNext = output<void>();

	readonly isComplete = computed(() => this.image()?.status === 'complete');

	readonly evaluations = computed(() => {
		const img = this.image();
		if (img?.status === 'complete') return img.evaluations;
		return [];
	});

	readonly aggregateScore = computed(() => {
		const img = this.image();
		if (img?.status === 'complete') return img.aggregateScore;
		return 0;
	});

	readonly multipleJudges = computed(() => this.evaluations().length > 1);

	readonly scoreColorVar = computed(() => {
		const score = this.aggregateScore();
		if (score >= SCORE_THRESHOLDS.PASS) return 'var(--compliance-pass)';
		if (score >= SCORE_THRESHOLDS.WARN) return 'var(--compliance-warn)';
		return 'var(--compliance-fail)';
	});

	readonly getScoreSeverity = getScoreSeverity;
	readonly getScoreLabel = getScoreLabel;

	ngAfterViewChecked(): void {
		const isVisible = this.visible();
		if (isVisible && !this.prevVisible) {
			this.needsFocus = true;
		}
		this.prevVisible = isVisible;

		if (this.needsFocus) {
			const el = this.detailLayout()?.nativeElement;
			if (el) {
				el.focus();
				this.needsFocus = false;
			}
		}
	}

	onKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowLeft' && this.hasPrev()) {
			this.navigatePrev.emit();
		} else if (event.key === 'ArrowRight' && this.hasNext()) {
			this.navigateNext.emit();
		}
	}
}
