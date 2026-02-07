import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
	signal,
	OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { RequestContinueDto } from '@api/image-generation/generation-request/dtos';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import { GenerationMode } from '../../../../shared/models/generation-request.model';

@Component({
	selector: 'app-continuation-editor',
	templateUrl: './continuation-editor.component.html',
	styleUrls: ['./continuation-editor.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class ContinuationEditorComponent implements OnInit {
	lastPrompt = input<string>('');
	currentMode = input<GenerationMode>('regeneration');
	submitting = input(false);

	continueRequest = output<RequestContinueDto>();

	promptOverride = '';
	additionalIterations = 5;
	generationMode: GenerationMode = 'regeneration';
	generationModeOptions = [
		{ label: 'Regenerate', value: 'regeneration' as GenerationMode },
		{ label: 'Edit', value: 'edit' as GenerationMode },
		{ label: 'Mixed', value: 'mixed' as GenerationMode },
	];
	expanded = signal(false);

	ngOnInit(): void {
		this.promptOverride = this.lastPrompt();
		this.generationMode = this.currentMode();
	}

	toggle(): void {
		this.expanded.update((v) => !v);
	}

	onModeChange(): void {
		const maxAllowed = this.getMaxIterationsForMode();
		if (this.additionalIterations > maxAllowed) {
			this.additionalIterations = maxAllowed;
		}
	}

	getMaxIterationsForMode(): number {
		switch (this.generationMode) {
			case 'edit':
				return 5;
			case 'mixed':
				return 20;
			default:
				return 50;
		}
	}

	onContinue(): void {
		const dto: RequestContinueDto = {
			additionalIterations: this.additionalIterations,
		};
		if (this.promptOverride.trim() !== this.lastPrompt()) {
			dto.promptOverride = this.promptOverride.trim();
		}
		if (this.generationMode !== this.currentMode()) {
			dto.generationMode = this
				.generationMode as RequestContinueDto['generationMode'];
		}
		this.continueRequest.emit(dto);
	}
}
