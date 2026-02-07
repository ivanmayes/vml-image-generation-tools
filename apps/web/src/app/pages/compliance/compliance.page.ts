import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	inject,
	OnInit,
	signal,
	computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';

import { PrimeNgModule } from '../../shared/primeng.module';
import { AgentService } from '../../shared/services/agent.service';
import type { Agent } from '../../shared/models/agent.model';
import type { ComplianceImage } from '../../shared/models/compliance-image.model';
import { environment } from '../../../environments/environment';
import { ImagePickerDialogComponent } from '../../shared/components/image-evaluator/image-picker-dialog.component';
import { SCORE_THRESHOLDS } from '../../shared/utils/score.utils';

import { BulkComplianceHeaderComponent } from './components/bulk-compliance-header.component';
import { ImageGridComponent } from './components/image-grid.component';
import { EvaluationDetailModalComponent } from './components/evaluation-detail-modal.component';

@Component({
	selector: 'app-compliance-tool',
	templateUrl: './compliance.page.html',
	styleUrls: ['./compliance.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		BulkComplianceHeaderComponent,
		ImageGridComponent,
		ImagePickerDialogComponent,
		EvaluationDetailModalComponent,
	],
})
export class ComplianceToolPage implements OnInit {
	private readonly agentService = inject(AgentService);
	private readonly messageService = inject(MessageService);
	private readonly destroyRef = inject(DestroyRef);

	readonly orgId = environment.organizationId;
	private readonly MAX_CONCURRENT = 3;
	private readonly MAX_IMAGES = 50;
	private readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
	private readonly blobUrls = new Set<string>();
	private readonly activeSubscriptions = new Map<string, Subscription>();
	private queueScheduled = false;

	constructor() {
		// When judges are selected, schedule queue processing
		effect(() => {
			const judgeIds = this.selectedJudgeIds();
			if (judgeIds.length > 0) {
				this.scheduleProcessQueue();
			}
		});

		// Close detail modal if selected image disappears (e.g. removed while modal open)
		effect(() => {
			if (this.showDetailModal() && this.selectedImage() === null) {
				queueMicrotask(() => this.showDetailModal.set(false));
			}
		});

		// Revoke all blob URLs on destroy
		this.destroyRef.onDestroy(() => {
			for (const url of this.blobUrls) {
				URL.revokeObjectURL(url);
			}
			this.blobUrls.clear();
			for (const sub of this.activeSubscriptions.values()) {
				sub.unsubscribe();
			}
			this.activeSubscriptions.clear();
		});
	}

	// --- Primary State ---
	images = signal<ComplianceImage[]>([]);
	selectedJudgeIds = signal<string[]>([]);
	brief = signal<string>('Evaluate this image for compliance');
	judges = signal<Agent[]>([]);
	loadingJudges = signal(true);

	// --- UI State ---
	showUrlDialog = signal(false);
	urlInput = signal('');
	showBrowseDialog = signal(false);
	selectedImageId = signal<string | null>(null);
	showDetailModal = signal(false);

	// --- Derived State ---
	readonly hasImages = computed(() => this.images().length > 0);
	readonly isEvaluating = computed(() =>
		this.images().some((img) => img.status === 'evaluating'),
	);

	readonly completedImages = computed(() =>
		this.images().filter(
			(img): img is ComplianceImage & { status: 'complete' } =>
				img.status === 'complete',
		),
	);

	readonly summary = computed(() => {
		const imgs = this.images();
		let passed = 0;
		let warned = 0;
		let failed = 0;
		let errors = 0;
		let scoreSum = 0;
		let completeCount = 0;

		for (const img of imgs) {
			if (img.status === 'complete') {
				completeCount++;
				scoreSum += img.aggregateScore;
				if (img.aggregateScore >= SCORE_THRESHOLDS.PASS) passed++;
				else if (img.aggregateScore >= SCORE_THRESHOLDS.WARN) warned++;
				else failed++;
			} else if (img.status === 'failed') {
				errors++;
			}
		}

		return {
			total: imgs.length,
			passed,
			warned,
			failed,
			errors,
			avgScore:
				completeCount > 0 ? Math.round(scoreSum / completeCount) : null,
		};
	});

	readonly selectedImage = computed(() => {
		const id = this.selectedImageId();
		if (!id) return null;
		return this.images().find((img) => img.id === id) ?? null;
	});

	readonly selectedImageIndex = computed(() => {
		const id = this.selectedImageId();
		if (!id) return -1;
		return this.completedImages().findIndex((img) => img.id === id);
	});

	readonly hasPrevImage = computed(() => this.selectedImageIndex() > 0);

	readonly hasNextImage = computed(
		() => this.selectedImageIndex() < this.completedImages().length - 1,
	);

	// --- Lifecycle ---

	ngOnInit(): void {
		this.loadJudges();
	}

	// --- Judge Loading ---

	private loadJudges(): void {
		this.loadingJudges.set(true);
		this.agentService
			.getAgents(this.orgId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (response) => {
					this.judges.set(response.data ?? []);
					this.loadingJudges.set(false);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load judges.',
					});
					this.loadingJudges.set(false);
				},
			});
	}

	// --- Image Addition ---

	onFilesDropped(files: FileList): void {
		const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
		const currentCount = this.images().length;
		let added = 0;

		for (const file of Array.from(files)) {
			if (currentCount + added >= this.MAX_IMAGES) {
				this.messageService.add({
					severity: 'warn',
					summary: 'Limit reached',
					detail: `Maximum ${this.MAX_IMAGES} images allowed.`,
				});
				break;
			}
			if (!validTypes.includes(file.type)) {
				this.messageService.add({
					severity: 'warn',
					summary: 'Skipped',
					detail: `${file.name} is not a supported image type.`,
				});
				continue;
			}
			if (file.size > this.MAX_FILE_SIZE) {
				this.messageService.add({
					severity: 'warn',
					summary: 'Too large',
					detail: `${file.name} exceeds the 20 MB size limit.`,
				});
				continue;
			}
			this.uploadFile(file);
			added++;
		}
	}

	private uploadFile(file: File): void {
		const id = crypto.randomUUID();
		const previewUrl = URL.createObjectURL(file);
		this.blobUrls.add(previewUrl);

		this.images.update((prev) => [
			...prev,
			{
				id,
				url: previewUrl,
				fileName: file.name,
				status: 'uploading' as const,
				addedAt: Date.now(),
			},
		]);

		this.agentService
			.uploadComplianceImage(this.orgId, file)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (response) => {
					const s3Url = response.data?.url;
					this.revokeBlobUrl(previewUrl);
					if (s3Url) {
						this.images.update((prev) =>
							prev.map((img) =>
								img.id === id
									? {
											id: img.id,
											url: s3Url,
											fileName: img.fileName,
											addedAt: img.addedAt,
											status: 'queued' as const,
										}
									: img,
							),
						);
						this.processQueue();
					} else {
						this.images.update((prev) =>
							prev.map((img) =>
								img.id === id
									? {
											id: img.id,
											url: img.url,
											fileName: img.fileName,
											addedAt: img.addedAt,
											status: 'failed' as const,
											error: 'Upload returned no URL',
										}
									: img,
							),
						);
					}
				},
				error: () => {
					this.revokeBlobUrl(previewUrl);
					this.images.update((prev) =>
						prev.map((img) =>
							img.id === id
								? {
										id: img.id,
										url: img.url,
										fileName: img.fileName,
										addedAt: img.addedAt,
										status: 'failed' as const,
										error: 'Upload failed',
									}
								: img,
						),
					);
				},
			});
	}

	onAddUrl(): void {
		if (this.images().length >= this.MAX_IMAGES) {
			this.messageService.add({
				severity: 'warn',
				summary: 'Limit reached',
				detail: `Maximum ${this.MAX_IMAGES} images allowed.`,
			});
			return;
		}

		const url = this.urlInput().trim();
		if (!url) return;

		const ALLOWED_SCHEMES = ['http:', 'https:'];
		try {
			const parsed = new URL(url);
			if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
				this.messageService.add({
					severity: 'error',
					summary: 'Invalid URL',
					detail: 'Only http and https URLs are supported.',
				});
				return;
			}
		} catch {
			this.messageService.add({
				severity: 'error',
				summary: 'Invalid URL',
				detail: 'Please enter a valid image URL.',
			});
			return;
		}

		const id = crypto.randomUUID();
		this.images.update((prev) => [
			...prev,
			{
				id,
				url,
				status: 'queued' as const,
				addedAt: Date.now(),
			},
		]);

		this.urlInput.set('');
		this.showUrlDialog.set(false);
		this.processQueue();
	}

	onBrowseSelected(imageUrl: string): void {
		if (this.images().length >= this.MAX_IMAGES) {
			this.messageService.add({
				severity: 'warn',
				summary: 'Limit reached',
				detail: `Maximum ${this.MAX_IMAGES} images allowed.`,
			});
			return;
		}

		const id = crypto.randomUUID();
		this.images.update((prev) => [
			...prev,
			{
				id,
				url: imageUrl,
				status: 'queued' as const,
				addedAt: Date.now(),
			},
		]);

		this.showBrowseDialog.set(false);
		this.processQueue();
	}

	// --- Queue Processing ---

	private scheduleProcessQueue(): void {
		if (this.queueScheduled) return;
		this.queueScheduled = true;
		queueMicrotask(() => {
			this.queueScheduled = false;
			this.processQueue();
		});
	}

	private processQueue(): void {
		const currentImages = this.images();
		const activeCount = currentImages.filter(
			(img) => img.status === 'evaluating',
		).length;
		const available = this.MAX_CONCURRENT - activeCount;

		if (available <= 0) return;

		const judgeIds = this.selectedJudgeIds();
		const briefText = this.brief();

		if (judgeIds.length === 0) return;

		const pending = currentImages.filter((img) => img.status === 'queued');
		const toProcess = pending.slice(0, available);

		if (toProcess.length === 0) return;

		// Mark as evaluating - construct clean objects to avoid stale properties
		const ids = new Set(toProcess.map((img) => img.id));
		this.images.update((prev) =>
			prev.map((img) =>
				ids.has(img.id)
					? {
							id: img.id,
							url: img.url,
							fileName: img.fileName,
							addedAt: img.addedAt,
							status: 'evaluating' as const,
						}
					: img,
			),
		);

		// Fire API calls
		for (const img of toProcess) {
			this.evaluateImage(img.id, img.url, judgeIds, briefText);
		}
	}

	private evaluateImage(
		imageId: string,
		imageUrl: string,
		judgeIds: string[],
		brief: string,
	): void {
		const sub = this.agentService
			.evaluateImage(this.orgId, {
				brief,
				imageUrls: [imageUrl],
				judgeIds,
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (response) => {
					this.activeSubscriptions.delete(imageId);
					const data = response.data;
					if (data?.winner) {
						this.images.update((prev) =>
							prev.map((img) =>
								img.id === imageId
									? {
											id: img.id,
											url: img.url,
											fileName: img.fileName,
											addedAt: img.addedAt,
											status: 'complete' as const,
											aggregateScore:
												data.winner.aggregateScore,
											evaluations:
												data.winner.evaluations,
										}
									: img,
							),
						);
					} else {
						this.images.update((prev) =>
							prev.map((img) =>
								img.id === imageId
									? {
											id: img.id,
											url: img.url,
											fileName: img.fileName,
											addedAt: img.addedAt,
											status: 'failed' as const,
											error: 'No results returned',
										}
									: img,
							),
						);
					}
					this.processQueue();
				},
				error: (err) => {
					this.activeSubscriptions.delete(imageId);
					this.images.update((prev) =>
						prev.map((img) =>
							img.id === imageId
								? {
										id: img.id,
										url: img.url,
										fileName: img.fileName,
										addedAt: img.addedAt,
										status: 'failed' as const,
										error:
											err?.error?.message ||
											'Evaluation failed',
									}
								: img,
						),
					);
					this.processQueue();
				},
			});
		this.activeSubscriptions.set(imageId, sub);
	}

	// --- Image Management ---

	onRemoveImage(imageId: string): void {
		const img = this.images().find((i) => i.id === imageId);
		if (img) {
			// Revoke blob URL if present
			if (img.url.startsWith('blob:')) {
				this.revokeBlobUrl(img.url);
			}
			// Cancel in-flight evaluation
			const sub = this.activeSubscriptions.get(imageId);
			if (sub) {
				sub.unsubscribe();
				this.activeSubscriptions.delete(imageId);
			}
		}
		this.images.update((prev) => prev.filter((i) => i.id !== imageId));
		// Refill queue slot if an evaluating image was removed
		this.processQueue();
	}

	onRetryImage(imageId: string): void {
		this.images.update((prev) =>
			prev.map((img) =>
				img.id === imageId
					? {
							id: img.id,
							url: img.url,
							fileName: img.fileName,
							addedAt: img.addedAt,
							status: 'queued' as const,
						}
					: img,
			),
		);
		this.processQueue();
	}

	// --- Blob URL Management ---

	private revokeBlobUrl(url: string): void {
		if (this.blobUrls.has(url)) {
			URL.revokeObjectURL(url);
			this.blobUrls.delete(url);
		}
	}

	// --- Detail Modal ---

	onSelectImage(imageId: string): void {
		this.selectedImageId.set(imageId);
		this.showDetailModal.set(true);
	}

	onNavigatePrev(): void {
		const idx = this.selectedImageIndex();
		if (idx > 0) {
			this.selectedImageId.set(this.completedImages()[idx - 1].id);
		}
	}

	onNavigateNext(): void {
		const idx = this.selectedImageIndex();
		const completed = this.completedImages();
		if (idx < completed.length - 1) {
			this.selectedImageId.set(completed[idx + 1].id);
		}
	}
}
