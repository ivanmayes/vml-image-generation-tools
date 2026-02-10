import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import type { Composition } from '../../../../../shared/models/composition.model';

@Component({
	selector: 'app-composition-card',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	template: `
		<div
			class="composition-card"
			role="button"
			tabindex="0"
			(click)="open.emit(composition().id)"
			(keydown.enter)="open.emit(composition().id)"
		>
			<div class="composition-card__thumbnail">
				@if (thumbnailUrl()) {
					<img [src]="thumbnailUrl()" [alt]="composition().name" />
				} @else {
					<div class="composition-card__placeholder">
						<i class="pi pi-image"></i>
					</div>
				}
			</div>
			<div class="composition-card__info">
				<span
					class="composition-card__name"
					[title]="composition().name"
				>
					{{ composition().name }}
				</span>
				<span class="composition-card__meta">
					{{ composition().canvasWidth }}x{{
						composition().canvasHeight
					}}
				</span>
			</div>
			<!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
			<div
				class="composition-card__actions"
				(click)="$event.stopPropagation()"
			>
				<p-button
					icon="pi pi-pencil"
					[rounded]="true"
					[text]="true"
					severity="secondary"
					size="small"
					(onClick)="rename.emit(composition().id)"
					pTooltip="Rename"
				/>
				<p-button
					icon="pi pi-trash"
					[rounded]="true"
					[text]="true"
					severity="danger"
					size="small"
					(onClick)="remove.emit(composition().id)"
					pTooltip="Delete"
				/>
			</div>
		</div>
	`,
	styles: [
		`
			.composition-card {
				border: 1px solid var(--p-surface-200);
				border-radius: 8px;
				overflow: hidden;
				cursor: pointer;
				transition: box-shadow 0.2s;

				&:hover {
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
				}
			}

			.composition-card__thumbnail {
				aspect-ratio: 1;
				background: var(--p-surface-100);
				display: flex;
				align-items: center;
				justify-content: center;

				img {
					width: 100%;
					height: 100%;
					object-fit: cover;
				}
			}

			.composition-card__placeholder {
				color: var(--p-surface-400);
				font-size: 2rem;
			}

			.composition-card__info {
				padding: 0.5rem 0.75rem;
				display: flex;
				flex-direction: column;
				gap: 0.125rem;
			}

			.composition-card__name {
				font-weight: 500;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.composition-card__meta {
				font-size: 0.75rem;
				color: var(--p-surface-500);
			}

			.composition-card__actions {
				padding: 0 0.5rem 0.5rem;
				display: flex;
				gap: 0.25rem;
			}
		`,
	],
})
export class CompositionCardComponent {
	composition = input.required<Composition>();
	thumbnailUrl = input<string | null>(null);

	open = output<string>();
	rename = output<string>();
	remove = output<string>();
}
