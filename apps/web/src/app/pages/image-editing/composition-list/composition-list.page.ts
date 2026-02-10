import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	OnInit,
	signal,
	computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService, ConfirmationService } from 'primeng/api';
import { forkJoin } from 'rxjs';

import { PrimeNgModule } from '../../../shared/primeng.module';
import { CompositionService } from '../../../shared/services/composition.service';
import type {
	Composition,
	CompositionListState,
} from '../../../shared/models/composition.model';
import { environment } from '../../../../environments/environment';

import { CompositionGridComponent } from './components/composition-grid/composition-grid.component';

@Component({
	selector: 'app-composition-list',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		CompositionGridComponent,
	],
	template: `
		<div class="composition-list-page">
			<div class="composition-list-page__header">
				<h2>Image Editing</h2>
				<p-button
					label="New Composition"
					icon="pi pi-plus"
					(onClick)="createComposition()"
					[loading]="creating()"
				/>
			</div>

			@let state = listState();

			@switch (state.status) {
				@case ('loading') {
					<div class="composition-list-page__loading">
						@for (_ of skeletons; track $index) {
							<p-skeleton
								width="100%"
								height="280px"
								borderRadius="8px"
							/>
						}
					</div>
				}
				@case ('error') {
					<div class="composition-list-page__error">
						<i
							class="pi pi-exclamation-triangle"
							style="font-size: 2rem; color: var(--p-red-500)"
						></i>
						<p>{{ state.message }}</p>
						<p-button
							label="Retry"
							icon="pi pi-refresh"
							(onClick)="loadCompositions()"
						/>
					</div>
				}
				@case ('loaded') {
					<app-composition-grid
						[compositions]="state.compositions"
						[thumbnailUrls]="thumbnailUrls()"
						(open)="openComposition($event)"
						(create)="createComposition()"
						(rename)="startRename($event)"
						(remove)="confirmDelete($event)"
					/>
				}
			}
		</div>

		<!-- Rename Dialog -->
		<p-dialog
			header="Rename Composition"
			[(visible)]="showRenameDialog"
			[modal]="true"
			[style]="{ width: '400px' }"
		>
			<div style="display: flex; flex-direction: column; gap: 0.75rem;">
				<input
					pInputText
					[(ngModel)]="renameValue"
					placeholder="Composition name"
					(keyup.enter)="submitRename()"
				/>
			</div>
			<ng-template #footer>
				<p-button
					label="Cancel"
					[text]="true"
					(onClick)="showRenameDialog = false"
				/>
				<p-button
					label="Rename"
					(onClick)="submitRename()"
					[disabled]="!renameValue.trim()"
				/>
			</ng-template>
		</p-dialog>

		<p-confirmDialog />
		<p-toast />
	`,
	styles: [
		`
			.composition-list-page {
				padding: 1.5rem 2rem;
				max-width: 1400px;
				margin: 0 auto;
			}

			.composition-list-page__header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 1rem;

				h2 {
					margin: 0;
				}
			}

			.composition-list-page__loading {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
				gap: 1rem;
				padding: 1rem 0;
			}

			.composition-list-page__error {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.75rem;
				padding: 4rem 1rem;
				text-align: center;
			}
		`,
	],
	providers: [MessageService, ConfirmationService],
})
export class CompositionListPage implements OnInit {
	private readonly compositionService = inject(CompositionService);
	private readonly router = inject(Router);
	private readonly messageService = inject(MessageService);
	private readonly confirmationService = inject(ConfirmationService);
	private readonly destroyRef = inject(DestroyRef);

	private readonly orgId = environment.organizationId;

	readonly listState = signal<CompositionListState>({ status: 'idle' });
	readonly creating = signal(false);
	readonly thumbnailUrls = signal<Record<string, string>>({});
	readonly skeletons = Array(6);

	showRenameDialog = false;
	renameValue = '';
	private renameId = '';

	readonly compositions = computed(() => {
		const state = this.listState();
		return state.status === 'loaded' ? state.compositions : [];
	});

	ngOnInit(): void {
		this.loadCompositions();
	}

	loadCompositions(): void {
		this.listState.set({ status: 'loading' });
		this.compositionService
			.list(this.orgId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (result) => {
					this.listState.set({
						status: 'loaded',
						compositions: result.data,
						total: result.total,
					});
					this.resolveThumbnails(result.data);
				},
				error: (err) => {
					this.listState.set({
						status: 'error',
						message:
							err?.error?.message ??
							'Failed to load compositions',
					});
				},
			});
	}

	createComposition(): void {
		if (this.creating()) return;
		this.creating.set(true);
		this.compositionService
			.create(this.orgId, { name: 'Untitled Composition' })
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (composition) => {
					this.creating.set(false);
					this.router.navigate(['/image-editing', composition.id]);
				},
				error: (err) => {
					this.creating.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail:
							err?.error?.message ??
							'Failed to create composition',
					});
				},
			});
	}

	openComposition(id: string): void {
		this.router.navigate(['/image-editing', id]);
	}

	startRename(id: string): void {
		const comp = this.compositions().find((c) => c.id === id);
		if (!comp) return;
		this.renameId = id;
		this.renameValue = comp.name;
		this.showRenameDialog = true;
	}

	submitRename(): void {
		if (!this.renameValue.trim()) return;
		this.compositionService
			.update(this.orgId, this.renameId, {
				name: this.renameValue.trim(),
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.showRenameDialog = false;
					this.loadCompositions();
				},
				error: (err) => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail:
							err?.error?.message ??
							'Failed to rename composition',
					});
				},
			});
	}

	confirmDelete(id: string): void {
		const comp = this.compositions().find((c) => c.id === id);
		this.confirmationService.confirm({
			message: `Delete "${comp?.name ?? 'this composition'}"? This cannot be undone.`,
			header: 'Confirm Delete',
			icon: 'pi pi-trash',
			acceptButtonStyleClass: 'p-button-danger',
			accept: () => {
				this.compositionService
					.delete(this.orgId, id)
					.pipe(takeUntilDestroyed(this.destroyRef))
					.subscribe({
						next: () => this.loadCompositions(),
						error: (err) => {
							this.messageService.add({
								severity: 'error',
								summary: 'Error',
								detail:
									err?.error?.message ??
									'Failed to delete composition',
							});
						},
					});
			},
		});
	}

	private resolveThumbnails(compositions: Composition[]): void {
		const toResolve = compositions.filter((c) => c.thumbnailS3Key);
		if (toResolve.length === 0) return;

		const requests = toResolve.reduce(
			(acc, c) => {
				acc[c.id] = this.compositionService.getSignedUrl(
					this.orgId,
					c.thumbnailS3Key!,
				);
				return acc;
			},
			{} as Record<
				string,
				ReturnType<CompositionService['getSignedUrl']>
			>,
		);

		forkJoin(requests)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (urls) => this.thumbnailUrls.set(urls),
				error: () => {
					// Silently fail thumbnail resolution
				},
			});
	}
}
