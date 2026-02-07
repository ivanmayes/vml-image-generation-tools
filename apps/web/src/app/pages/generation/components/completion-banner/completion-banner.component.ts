import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
	CompletionReason,
	GenerationRequestStatus,
} from '../../../../shared/models/generation-request.model';
import { PrimeNgModule } from '../../../../shared/primeng.module';

@Component({
	selector: 'app-completion-banner',
	templateUrl: './completion-banner.component.html',
	styleUrls: ['./completion-banner.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class CompletionBannerComponent {
	status = input.required<GenerationRequestStatus>();
	completionReason = input<CompletionReason>();
	finalScore = input<number>();
	threshold = input<number>();

	get isSuccess(): boolean {
		return (
			this.status() === GenerationRequestStatus.COMPLETED &&
			this.completionReason() === CompletionReason.SUCCESS
		);
	}

	get isFailed(): boolean {
		return this.status() === GenerationRequestStatus.FAILED;
	}

	get icon(): string {
		if (this.isSuccess) return 'pi pi-check-circle';
		if (this.isFailed) return 'pi pi-times-circle';
		return 'pi pi-info-circle';
	}

	get severity(): 'success' | 'warn' | 'danger' | 'info' {
		if (this.isSuccess) return 'success';
		if (this.isFailed) return 'danger';
		return 'info';
	}

	get reasonLabel(): string {
		switch (this.completionReason()) {
			case CompletionReason.SUCCESS:
				return 'Threshold met';
			case CompletionReason.MAX_RETRIES_REACHED:
				return 'Max iterations reached';
			case CompletionReason.DIMINISHING_RETURNS:
				return 'Diminishing returns detected';
			case CompletionReason.CANCELLED:
				return 'Cancelled';
			case CompletionReason.ERROR:
				return 'Error occurred';
			default:
				return this.status();
		}
	}
}
