import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ContinueGenerationRequestDto } from '../../../../../shared/models/generation-request.model';
import { PrimeNgModule } from '../../../../../shared/primeng.module';

@Component({
	selector: 'app-continuation-editor',
	templateUrl: './continuation-editor.component.html',
	styleUrls: ['./continuation-editor.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class ContinuationEditorComponent {
	lastPrompt = input<string>('');
	submitting = input(false);

	continueRequest = output<ContinueGenerationRequestDto>();

	promptOverride = '';
	additionalIterations = 5;
	expanded = signal(false);

	ngOnInit(): void {
		this.promptOverride = this.lastPrompt();
	}

	toggle(): void {
		this.expanded.update((v) => !v);
	}

	onContinue(): void {
		const dto: ContinueGenerationRequestDto = {
			additionalIterations: this.additionalIterations,
		};
		if (this.promptOverride.trim() !== this.lastPrompt()) {
			dto.promptOverride = this.promptOverride.trim();
		}
		this.continueRequest.emit(dto);
	}
}
