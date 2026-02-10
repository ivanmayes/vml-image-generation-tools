import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import type { Composition } from '../../../../../shared/models/composition.model';
import { CompositionCardComponent } from '../composition-card/composition-card.component';

@Component({
	selector: 'app-composition-grid',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, CompositionCardComponent],
	template: `
		@if (compositions().length === 0) {
			<div class="composition-grid__empty">
				<i
					class="pi pi-image"
					style="font-size: 3rem; color: var(--p-surface-400)"
				></i>
				<h3>No compositions yet</h3>
				<p>Create your first composition to get started</p>
				<p-button
					label="New Composition"
					icon="pi pi-plus"
					(onClick)="create.emit()"
				/>
			</div>
		} @else {
			<div class="composition-grid">
				@for (comp of compositions(); track comp.id) {
					<app-composition-card
						[composition]="comp"
						[thumbnailUrl]="thumbnailUrls()[comp.id] ?? null"
						(open)="open.emit($event)"
						(rename)="rename.emit($event)"
						(remove)="remove.emit($event)"
					/>
				}
			</div>
		}
	`,
	styles: [
		`
			.composition-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
				gap: 1rem;
				padding: 1rem 0;
			}

			.composition-grid__empty {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 0.75rem;
				padding: 4rem 1rem;
				text-align: center;
				color: var(--p-surface-600);

				h3 {
					margin: 0;
				}

				p {
					margin: 0;
					color: var(--p-surface-500);
				}
			}
		`,
	],
})
export class CompositionGridComponent {
	compositions = input.required<Composition[]>();
	thumbnailUrls = input<Record<string, string>>({});

	open = output<string>();
	create = output<void>();
	rename = output<string>();
	remove = output<string>();
}
