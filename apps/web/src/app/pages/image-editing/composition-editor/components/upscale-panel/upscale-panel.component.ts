import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../../shared/primeng.module';

@Component({
	selector: 'app-upscale-panel',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	template: `
		<div class="upscale-panel">
			<div class="upscale-panel__info">
				<div class="upscale-panel__row">
					<span class="upscale-panel__label">Current Size</span>
					<span class="upscale-panel__value">
						{{ imageWidth() }} x {{ imageHeight() }}
					</span>
				</div>
				<div class="upscale-panel__row">
					<span class="upscale-panel__label">Target Size</span>
					<span class="upscale-panel__value">
						{{ imageWidth() * 2 }} x {{ imageHeight() * 2 }}
					</span>
				</div>
			</div>
			<p-button
				label="Upscale 2x"
				icon="pi pi-expand"
				[disabled]="true"
				styleClass="w-full"
				pTooltip="Coming soon"
			/>
			<p class="upscale-panel__note">
				Upscaling is not yet available. This feature will be enabled in
				a future update.
			</p>
		</div>
	`,
	styles: [
		`
			.upscale-panel {
				padding: 1rem;
			}

			.upscale-panel__info {
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
				margin-bottom: 1rem;
			}

			.upscale-panel__row {
				display: flex;
				justify-content: space-between;
				align-items: center;
			}

			.upscale-panel__label {
				font-size: 0.75rem;
				font-weight: 600;
				text-transform: uppercase;
				color: var(--p-surface-500);
			}

			.upscale-panel__value {
				font-size: 0.875rem;
				font-weight: 500;
			}

			.upscale-panel__note {
				font-size: 0.75rem;
				color: var(--p-surface-400);
				margin-top: 0.75rem;
				text-align: center;
			}
		`,
	],
})
export class UpscalePanelComponent {
	imageWidth = input(0);
	imageHeight = input(0);
}
