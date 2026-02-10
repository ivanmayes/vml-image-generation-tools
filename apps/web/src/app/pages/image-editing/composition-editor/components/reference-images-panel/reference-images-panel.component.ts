import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	input,
	output,
	viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../../shared/primeng.module';

export interface ReferenceImage {
	id: string;
	url: string;
	fileName?: string;
}

@Component({
	selector: 'app-reference-images-panel',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	template: `
		<div class="reference-images">
			<input
				#fileInput
				type="file"
				accept="image/*"
				class="reference-images__file-input"
				(change)="onFileSelected($event)"
			/>

			<div class="reference-images__header">
				<span class="reference-images__title">Reference Images</span>
				<p-button
					icon="pi pi-plus"
					[rounded]="true"
					[text]="true"
					size="small"
					(onClick)="triggerFileInput()"
					[disabled]="isBusy()"
					pTooltip="Add reference image"
				/>
			</div>

			@if (images().length === 0) {
				<div
					class="reference-images__drop-zone"
					(dragover)="onDragOver($event)"
					(dragleave)="onDragLeave($event)"
					(drop)="onDrop($event)"
				>
					<i class="pi pi-images"></i>
					<p>Drag images here or click + to add</p>
				</div>
			} @else {
				<div class="reference-images__grid">
					@for (img of images(); track img.id) {
						<div class="reference-images__item">
							<img
								[src]="img.url"
								[alt]="img.fileName ?? 'Reference'"
							/>
							<div class="reference-images__actions">
								<p-button
									icon="pi pi-image"
									[rounded]="true"
									[text]="true"
									size="small"
									(onClick)="placeOnCanvas.emit(img.id)"
									pTooltip="Place on canvas"
								/>
								<p-button
									icon="pi pi-times"
									[rounded]="true"
									[text]="true"
									size="small"
									severity="danger"
									(onClick)="removeImage.emit(img.id)"
									pTooltip="Remove"
								/>
							</div>
						</div>
					}
				</div>
			}
		</div>
	`,
	styles: [
		`
			.reference-images {
				padding: 1rem;
			}

			.reference-images__file-input {
				display: none;
			}

			.reference-images__header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 0.75rem;
			}

			.reference-images__title {
				font-size: 0.75rem;
				font-weight: 600;
				text-transform: uppercase;
				color: var(--p-surface-500);
			}

			.reference-images__drop-zone {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.5rem;
				padding: 1.5rem;
				border: 2px dashed var(--p-surface-300);
				border-radius: 8px;
				color: var(--p-surface-400);
				text-align: center;
				cursor: pointer;
				transition: all 0.15s;

				&:hover,
				&.dragging {
					border-color: var(--p-primary-400);
					color: var(--p-primary-500);
					background: var(--p-primary-50);
				}

				i {
					font-size: 1.5rem;
				}

				p {
					margin: 0;
					font-size: 0.75rem;
				}
			}

			.reference-images__grid {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 0.5rem;
			}

			.reference-images__item {
				position: relative;
				aspect-ratio: 1;
				border-radius: 6px;
				overflow: hidden;
				border: 1px solid var(--p-surface-200);

				img {
					width: 100%;
					height: 100%;
					object-fit: cover;
				}

				&:hover .reference-images__actions {
					opacity: 1;
				}
			}

			.reference-images__actions {
				position: absolute;
				top: 0;
				right: 0;
				display: flex;
				gap: 2px;
				padding: 2px;
				opacity: 0;
				transition: opacity 0.15s;
				background: rgba(0, 0, 0, 0.5);
				border-radius: 0 0 0 6px;
			}
		`,
	],
})
export class ReferenceImagesPanelComponent {
	images = input<ReferenceImage[]>([]);
	isBusy = input(false);

	addImage = output<File>();
	removeImage = output<string>();
	placeOnCanvas = output<string>();

	private readonly fileInput =
		viewChild<ElementRef<HTMLInputElement>>('fileInput');

	triggerFileInput(): void {
		this.fileInput()?.nativeElement.click();
	}

	onFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			this.addImage.emit(file);
			input.value = '';
		}
	}

	onDragOver(event: DragEvent): void {
		event.preventDefault();
		(event.currentTarget as HTMLElement).classList.add('dragging');
	}

	onDragLeave(event: DragEvent): void {
		(event.currentTarget as HTMLElement).classList.remove('dragging');
	}

	onDrop(event: DragEvent): void {
		event.preventDefault();
		(event.currentTarget as HTMLElement).classList.remove('dragging');
		const file = event.dataTransfer?.files[0];
		if (file && file.type.startsWith('image/')) {
			this.addImage.emit(file);
		}
	}
}
