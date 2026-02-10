import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import {
	ASPECT_RATIO_PRESETS,
	type AspectRatioPreset,
} from '../../../../../shared/constants/aspect-ratios.constant';

@Component({
	selector: 'app-aspect-ratio-selector',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, SelectModule, TooltipModule],
	template: `
		<div
			class="ar-selector"
			[class.auto-mode]="currentMode() === 'auto'"
			[class.manual-mode]="currentMode() === 'manual'"
			[pTooltip]="tooltipText"
			tooltipPosition="top"
			role="button"
			tabindex="0"
			[attr.aria-label]="tooltipText"
			(click)="toggleMode()"
			(keydown)="onKeyDown($event)"
		>
			@if (currentMode() === 'auto') {
				<div class="ar-selector__display">
					<i class="pi pi-lock ar-selector__icon"></i>
					<span class="ar-selector__dims">{{ displayText }}</span>
					<span class="ar-selector__ratio">{{
						detectedRatio()
					}}</span>
					<span class="ar-selector__badge ar-selector__badge--auto"
						>Auto</span
					>
				</div>
			} @else {
				<div class="ar-selector__display">
					<i
						class="pi pi-pencil ar-selector__icon ar-selector__icon--edit"
					></i>
					<span class="ar-selector__dims">{{ displayText }}</span>
					<p-select
						[options]="presets"
						[ngModel]="selectedRatio()"
						optionLabel="displayName"
						optionValue="ratio"
						(onChange)="onRatioSelect($event.value)"
						(onShow)="isDropdownOpen = true"
						(onHide)="isDropdownOpen = false"
						placeholder="Select ratio"
						appendTo="body"
						(click)="$event.stopPropagation()"
						styleClass="ar-selector__select"
					>
						<ng-template pTemplate="selectedItem">
							<span class="ar-selector__selected-label">{{
								selectedRatio()
							}}</span>
						</ng-template>
						<ng-template let-preset pTemplate="item">
							<div class="ar-selector__preset-item">
								<span class="ar-selector__preset-ratio">{{
									preset.ratio
								}}</span>
								<span class="ar-selector__preset-name">{{
									preset.displayName
								}}</span>
								<span class="ar-selector__preset-use">{{
									preset.useCase
								}}</span>
							</div>
						</ng-template>
					</p-select>
					<span class="ar-selector__badge ar-selector__badge--manual"
						>Manual</span
					>
				</div>
			}
		</div>
	`,
	styles: [
		`
			.ar-selector {
				display: inline-flex;
				align-items: center;
				padding: 0.375rem 0.625rem;
				border-radius: calc(var(--p-border-radius) - 2px);
				background-color: var(--p-surface-50);
				cursor: pointer;
				transition: all 0.2s ease;
				user-select: none;
				outline: none;
			}

			.ar-selector:hover {
				background-color: var(--p-surface-100);
				box-shadow: 0 0 0 2px var(--p-surface-border);
			}

			.ar-selector:focus-visible {
				box-shadow: 0 0 0 2px var(--p-primary-color);
			}

			.ar-selector.auto-mode {
				border: 1px solid var(--p-surface-border);
			}

			.ar-selector.manual-mode {
				border: 1px solid var(--p-primary-color);
			}

			.ar-selector__display {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				font-size: 0.6875rem;
				font-family: 'Roboto Mono', monospace;
			}

			.ar-selector__icon {
				font-size: 0.75rem;
				color: var(--p-text-color-secondary);
				flex-shrink: 0;
			}

			.ar-selector__icon--edit {
				color: var(--p-primary-color);
			}

			.ar-selector__dims {
				font-weight: 500;
				color: var(--p-text-color);
				white-space: nowrap;
			}

			.ar-selector__ratio {
				font-weight: 600;
				color: var(--p-text-color);
				padding: 0.125rem 0.375rem;
				background-color: var(--p-surface-100);
				border-radius: calc(var(--p-border-radius) - 4px);
				font-size: 0.625rem;
			}

			.ar-selector__badge {
				font-size: 0.625rem;
				font-weight: 600;
				padding: 0.125rem 0.375rem;
				border-radius: calc(var(--p-border-radius) - 4px);
				text-transform: uppercase;
				letter-spacing: 0.5px;
				white-space: nowrap;
			}

			.ar-selector__badge--auto {
				background-color: var(--p-surface-200);
				color: var(--p-text-color-secondary);
			}

			.ar-selector__badge--manual {
				background-color: color-mix(
					in srgb,
					var(--p-primary-color) 15%,
					transparent
				);
				color: var(--p-primary-color);
			}

			.ar-selector__selected-label {
				font-weight: 600;
				color: var(--p-text-color);
			}

			:host ::ng-deep .ar-selector__select {
				height: auto;
				background-color: transparent;
				border: none;
				box-shadow: none;
				padding: 0;
				min-width: auto;
				width: 4rem;
				max-width: 4rem;
			}

			:host ::ng-deep .ar-selector__select .p-select-dropdown {
				width: 1.25rem;
				color: var(--p-primary-color);
			}

			:host ::ng-deep .ar-selector__select .p-select-label {
				padding: 0 0.25rem;
				font-family: 'Roboto Mono', monospace;
				font-size: 0.6875rem;
				font-weight: 500;
			}

			:host ::ng-deep .ar-selector__select:hover {
				background-color: transparent;
			}

			:host ::ng-deep .ar-selector__select:focus,
			:host ::ng-deep .ar-selector__select.p-focus {
				box-shadow: none;
			}
		`,
	],
})
export class AspectRatioSelectorComponent {
	currentMode = input<'auto' | 'manual'>('auto');
	detectedRatio = input('1:1');
	selectedRatio = input('1:1');
	canvasWidth = input(1024);
	canvasHeight = input(1024);

	modeChanged = output<'auto' | 'manual'>();
	ratioSelected = output<string>();

	readonly presets: AspectRatioPreset[] = ASPECT_RATIO_PRESETS;
	isDropdownOpen = false;

	get displayText(): string {
		return `${this.canvasWidth()}\u00D7${this.canvasHeight()}`;
	}

	get tooltipText(): string {
		if (this.currentMode() === 'auto') {
			return 'Automatically matches image aspect ratio. Click to change.';
		}
		return `Manual aspect ratio: ${this.selectedRatio()}. Click to change.`;
	}

	toggleMode(): void {
		if (this.isDropdownOpen) return;
		const newMode = this.currentMode() === 'auto' ? 'manual' : 'auto';
		this.modeChanged.emit(newMode);
	}

	onRatioSelect(ratio: string): void {
		this.ratioSelected.emit(ratio);
		this.isDropdownOpen = false;
	}

	onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.toggleMode();
		} else if (event.key === 'Escape' && this.isDropdownOpen) {
			event.preventDefault();
			this.isDropdownOpen = false;
		}
	}
}
