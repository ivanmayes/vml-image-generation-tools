import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import { AspectRatioSelectorComponent } from '../aspect-ratio-selector/aspect-ratio-selector.component';

@Component({
	selector: 'app-generation-panel',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		AspectRatioSelectorComponent,
	],
	template: `
		<div class="generation-panel">
			<div class="generation-panel__input-row">
				<textarea
					pTextarea
					[(ngModel)]="prompt"
					rows="2"
					placeholder="Describe what to generate..."
					[disabled]="isBusy()"
					class="generation-panel__textarea"
				></textarea>
				<p-button
					[label]="generateButtonLabel()"
					icon="pi pi-bolt"
					[disabled]="isBusy() || !prompt.trim()"
					[loading]="isGenerating() || isPolling()"
					(onClick)="onGenerate()"
					class="generation-panel__generate-btn"
				/>
			</div>
			<div class="generation-panel__info-row">
				<span class="generation-panel__version-info">
					@if (totalVersions() > 0) {
						Version {{ currentVersion() }} of
						{{ totalVersions() }}
					} @else {
						No versions yet
					}
				</span>
				<div class="generation-panel__controls">
					<p-button
						label="Enhance"
						icon="pi pi-sparkles"
						[disabled]="isBusy() || isEnhancing() || !prompt.trim()"
						[loading]="isEnhancing()"
						(onClick)="onEnhancePrompt()"
						styleClass="p-button-text p-button-sm"
					/>

					<div class="generation-panel__mode-group">
						@for (opt of modeOptions; track opt.value) {
							<p-button
								[label]="opt.label"
								[icon]="opt.icon"
								[disabled]="isBusy()"
								(onClick)="onModeChange(opt.value)"
								[styleClass]="
									'p-button-sm ' +
									(selectedMode() === opt.value
										? ''
										: 'p-button-outlined')
								"
							/>
						}
					</div>

					<app-aspect-ratio-selector
						[currentMode]="aspectRatioMode()"
						[selectedRatio]="aspectRatio()"
						[detectedRatio]="detectedAspectRatio()"
						[canvasWidth]="canvasWidth()"
						[canvasHeight]="canvasHeight()"
						(modeChanged)="aspectRatioModeChanged.emit($event)"
						(ratioSelected)="aspectRatioSelected.emit($event)"
					/>
				</div>
			</div>
		</div>
	`,
	styles: [
		`
			.generation-panel {
				padding: 0.75rem 1rem;
				border-top: 1px solid var(--p-surface-200);
				background: var(--p-surface-0);
				flex-shrink: 0;
			}

			.generation-panel__input-row {
				display: flex;
				gap: 0.5rem;
				align-items: stretch;
			}

			.generation-panel__textarea {
				flex: 1;
				resize: none;
				min-height: 56px;
				max-height: 56px;
				font-size: 0.875rem;
			}

			:host ::ng-deep .generation-panel__generate-btn .p-button {
				height: 100%;
				min-width: 120px;
				white-space: nowrap;
			}

			.generation-panel__info-row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				margin-top: 0.5rem;
				gap: 0.5rem;
			}

			.generation-panel__version-info {
				font-size: 0.75rem;
				color: var(--p-surface-500);
				white-space: nowrap;
			}

			.generation-panel__controls {
				display: flex;
				gap: 0.5rem;
				align-items: center;
				flex-wrap: wrap;
				justify-content: flex-end;
			}

			.generation-panel__mode-group {
				display: flex;
				gap: 0.25rem;
			}

			:host ::ng-deep .generation-panel__mode-group .p-button {
				font-size: 0.75rem;
			}

			:host ::ng-deep .generation-panel__controls .p-button-sm {
				font-size: 0.75rem;
			}
		`,
	],
})
export class GenerationPanelComponent {
	currentVersion = input(0);
	totalVersions = input(0);
	isBusy = input(false);
	isGenerating = input(false);
	isPolling = input(false);
	isEnhancing = input(false);
	hasMask = input(false);
	canvasWidth = input(1024);
	canvasHeight = input(1024);
	aspectRatioMode = input<'auto' | 'manual'>('auto');
	aspectRatio = input('1:1');
	detectedAspectRatio = input('1:1');

	generate = output<{ prompt: string; mode: string }>();
	generationModeChanged = output<string>();
	enhancePrompt = output<string>();
	aspectRatioModeChanged = output<'auto' | 'manual'>();
	aspectRatioSelected = output<string>();

	prompt = '';
	readonly selectedMode = signal('generate');

	readonly modeOptions = [
		{ label: 'Full', value: 'generate', icon: 'pi pi-image' },
		{ label: 'Inpaint', value: 'inpaint', icon: 'pi pi-pencil' },
		{ label: 'Stitch', value: 'stitch', icon: 'pi pi-box' },
	];

	readonly generateButtonLabel = computed(() => {
		if (this.isPolling()) return 'Processing...';
		const mode = this.selectedMode();
		if (mode === 'stitch') return 'Stitch';
		if (this.hasMask()) return 'Inpaint';
		return 'Generate';
	});

	onModeChange(mode: string): void {
		this.selectedMode.set(mode);
		this.generationModeChanged.emit(mode);
	}

	onGenerate(): void {
		if (!this.prompt.trim()) return;
		const mode = this.selectedMode();
		const effectiveMode =
			mode !== 'stitch' && this.hasMask() ? 'inpaint' : mode;
		this.generate.emit({
			prompt: this.prompt.trim(),
			mode: effectiveMode,
		});
	}

	onEnhancePrompt(): void {
		if (!this.prompt.trim()) return;
		this.enhancePrompt.emit(this.prompt.trim());
	}

	setPrompt(text: string): void {
		this.prompt = text;
	}
}
