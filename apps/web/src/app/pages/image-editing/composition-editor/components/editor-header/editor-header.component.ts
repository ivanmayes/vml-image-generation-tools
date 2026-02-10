import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../../shared/primeng.module';

@Component({
	selector: 'app-editor-header',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	template: `
		<div class="editor-header">
			<div class="editor-header__left">
				<p-button
					icon="pi pi-arrow-left"
					[rounded]="true"
					[text]="true"
					(onClick)="backClicked.emit()"
					pTooltip="Back to compositions"
				/>
				<div
					class="editor-header__name"
					role="button"
					tabindex="0"
					(click)="startEditing()"
					(keydown.enter)="startEditing()"
				>
					@if (isEditing()) {
						<input
							#nameInput
							type="text"
							class="editor-header__name-input"
							[value]="compositionName()"
							(blur)="finishEditing($event)"
							(keydown.enter)="finishEditing($event)"
							(keydown.escape)="cancelEditing()"
						/>
					} @else {
						<span class="editor-header__name-text">
							{{ compositionName() }}
						</span>
						<i
							class="pi pi-pencil editor-header__name-edit-icon"
						></i>
					}
				</div>
			</div>

			<div class="editor-header__center"></div>

			<div class="editor-header__right">
				<p-button
					icon="pi pi-history"
					label="Versions"
					[text]="true"
					size="small"
					(onClick)="versionsClicked.emit($event)"
				/>
				<span class="editor-header__separator"></span>
				<p-button
					icon="pi pi-undo"
					[rounded]="true"
					[text]="true"
					size="small"
					[disabled]="!canUndo() || isBusy()"
					(onClick)="undoClicked.emit()"
					pTooltip="Undo"
				/>
				<p-button
					icon="pi pi-refresh"
					[rounded]="true"
					[text]="true"
					size="small"
					[disabled]="!canRedo() || isBusy()"
					(onClick)="redoClicked.emit()"
					pTooltip="Redo"
				/>
				<span class="editor-header__separator"></span>
				<p-button
					icon="pi pi-download"
					[rounded]="true"
					[text]="true"
					size="small"
					[disabled]="isBusy()"
					(onClick)="downloadClicked.emit()"
					pTooltip="Download"
				/>
			</div>
		</div>
	`,
	styles: [
		`
			.editor-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 0.5rem 1rem;
				border-bottom: 1px solid var(--p-surface-200);
				flex-shrink: 0;
				height: 48px;
				background: var(--p-surface-0);
			}

			.editor-header__left {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				flex: 1;
				min-width: 0;
			}

			.editor-header__center {
				flex: 1;
			}

			.editor-header__right {
				display: flex;
				align-items: center;
				gap: 0.25rem;
				flex: 1;
				justify-content: flex-end;
			}

			.editor-header__separator {
				width: 1px;
				height: 20px;
				background: var(--p-surface-200);
				margin: 0 0.25rem;
			}

			.editor-header__name {
				display: flex;
				align-items: center;
				gap: 0.375rem;
				cursor: pointer;
				padding: 0.25rem 0.5rem;
				border-radius: 6px;
				transition: background 0.15s;
				min-width: 0;

				&:hover {
					background: var(--p-surface-100);

					.editor-header__name-edit-icon {
						opacity: 1;
					}
				}
			}

			.editor-header__name-text {
				font-size: 0.875rem;
				font-weight: 600;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				max-width: 300px;
			}

			.editor-header__name-edit-icon {
				font-size: 0.625rem;
				color: var(--p-surface-400);
				opacity: 0;
				transition: opacity 0.15s;
			}

			.editor-header__name-input {
				font-size: 0.875rem;
				font-weight: 600;
				border: 1px solid var(--p-primary-500);
				border-radius: 4px;
				padding: 0.125rem 0.375rem;
				outline: none;
				background: var(--p-surface-0);
				width: 250px;
			}
		`,
	],
})
export class EditorHeaderComponent {
	compositionName = input('Untitled');
	canUndo = input(false);
	canRedo = input(false);
	isBusy = input(false);

	backClicked = output<void>();
	compositionNameChange = output<string>();
	versionsClicked = output<Event>();
	undoClicked = output<void>();
	redoClicked = output<void>();
	downloadClicked = output<void>();

	isEditing = signal(false);
	private readonly nameInput =
		viewChild<ElementRef<HTMLInputElement>>('nameInput');

	startEditing(): void {
		this.isEditing.set(true);
		// Focus the input after Angular renders it
		setTimeout(() => {
			const input = this.nameInput()?.nativeElement;
			if (input) {
				input.focus();
				input.select();
			}
		});
	}

	finishEditing(event: Event): void {
		// Guard against double-fire: Enter triggers this, then removing the input
		// from the DOM fires blur which calls this again on a detached element.
		if (!this.isEditing()) return;
		const input = event.target as HTMLInputElement;
		const newName = input.value.trim();
		if (newName && newName !== this.compositionName()) {
			this.compositionNameChange.emit(newName);
		}
		this.isEditing.set(false);
	}

	cancelEditing(): void {
		this.isEditing.set(false);
	}
}
