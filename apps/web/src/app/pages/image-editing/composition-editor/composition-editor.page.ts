import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	OnInit,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Subscription, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';

import { PrimeNgModule } from '../../../shared/primeng.module';
import { CompositionService } from '../../../shared/services/composition.service';
import { PromptEnhancementService } from '../../../shared/services/prompt-enhancement.service';
import type { CompositionVersion } from '../../../shared/models/composition.model';
import {
	ASPECT_RATIO_PRESETS,
	ASPECT_RATIO_TOLERANCE,
} from '../../../shared/constants/aspect-ratios.constant';
import { environment } from '../../../../environments/environment';

import { EditorStateService } from './services/editor-state.service';
import { FabricCanvasService } from './services/fabric-canvas.service';
import { CanvasZoomService } from './services/canvas-zoom.service';
import { CanvasPanService } from './services/canvas-pan.service';
import { EditorHeaderComponent } from './components/editor-header/editor-header.component';
import { CanvasPreviewComponent } from './components/canvas-host/canvas-host.component';
import { GenerationPanelComponent } from './components/generation-panel/generation-panel.component';
import { PropertiesSidebarComponent } from './components/properties-sidebar/properties-sidebar.component';
import { VersionsDropdownComponent } from './components/versions-dropdown/versions-dropdown.component';
import type { ReferenceImage } from './components/reference-images-panel/reference-images-panel.component';

@Component({
	selector: 'app-composition-editor',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		EditorHeaderComponent,
		CanvasPreviewComponent,
		GenerationPanelComponent,
		PropertiesSidebarComponent,
		VersionsDropdownComponent,
	],
	template: `
		<div class="editor-page">
			<!-- Header -->
			<app-editor-header
				[compositionName]="editorState.compositionName()"
				[canUndo]="false"
				[canRedo]="false"
				[isBusy]="editorState.isBusy()"
				(backClicked)="goBack()"
				(compositionNameChange)="onNameChange($event)"
				(versionsClicked)="onVersionsToggle($event)"
				(downloadClicked)="onDownload()"
			/>

			<!-- Versions dropdown (popover) -->
			<app-versions-dropdown
				#versionsDropdown
				[versions]="editorState.versions()"
				[currentVersionId]="editorState.currentVersion()?.id ?? null"
				[thumbnailUrls]="versionThumbnailUrls()"
				(selectVersion)="onSelectVersion($event)"
			/>

			<!-- Main content with splitter -->
			@if (editorState.isLoading()) {
				<div class="editor-page__loading">
					<p-progressSpinner strokeWidth="3" />
					<p>Loading composition...</p>
				</div>
			} @else if (editorState.isError()) {
				<div class="editor-page__error">
					<i class="pi pi-exclamation-triangle"></i>
					<p>{{ editorState.state().errorMessage }}</p>
					<p-button label="Retry" (onClick)="loadComposition()" />
				</div>
			} @else {
				<p-splitter
					[panelSizes]="[70, 30]"
					[minSizes]="[40, 20]"
					class="editor-page__splitter"
				>
					<ng-template #panel>
						<!-- LEFT: Canvas + Generation Panel -->
						<div class="editor-page__center-panel">
							<app-canvas-preview
								#canvasPreview
								class="editor-page__canvas-area"
								[canvasWidth]="
									editorState.composition()?.canvasWidth ??
									1024
								"
								[canvasHeight]="
									editorState.composition()?.canvasHeight ??
									1024
								"
								[hasBaseImage]="!!editorState.baseImageUrl()"
								[baseImageUrl]="editorState.baseImageUrl()"
								[isGenerating]="editorState.isGenerating()"
								[isLoadingVersion]="
									editorState.isLoadingVersion()
								"
								(imageFileSelected)="
									onImageFileSelected($event)
								"
							/>
							<app-generation-panel
								[currentVersion]="
									editorState.currentVersionNumber()
								"
								[totalVersions]="editorState.totalVersions()"
								[isBusy]="editorState.isBusy()"
								[isGenerating]="editorState.isGenerating()"
								[isPolling]="editorState.isPolling()"
								[isEnhancing]="isEnhancingPrompt()"
								[hasMask]="fabricCanvas.hasMask()"
								[canvasWidth]="
									editorState.composition()?.canvasWidth ??
									1024
								"
								[canvasHeight]="
									editorState.composition()?.canvasHeight ??
									1024
								"
								[aspectRatioMode]="aspectRatioMode()"
								[aspectRatio]="selectedAspectRatio()"
								[detectedAspectRatio]="detectedAspectRatio()"
								(generate)="onGenerate($event)"
								(enhancePrompt)="onEnhancePrompt($event)"
								(aspectRatioModeChanged)="
									onAspectRatioModeChanged($event)
								"
								(aspectRatioSelected)="
									onAspectRatioSelected($event)
								"
							/>
						</div>
					</ng-template>
					<ng-template #panel>
						<!-- RIGHT: Properties Sidebar -->
						<app-properties-sidebar
							[referenceImages]="referenceImages()"
							[hasMask]="fabricCanvas.hasMask()"
							[isBusy]="editorState.isBusy()"
							[imageWidth]="
								editorState.composition()?.canvasWidth ?? 0
							"
							[imageHeight]="
								editorState.composition()?.canvasHeight ?? 0
							"
							(brushSizeChange)="onBrushSizeChange($event)"
							(clearMask)="onClearMask()"
							(modeChange)="fabricCanvas.setMode($event)"
							(referenceAdded)="onReferenceAdded($event)"
							(referenceRemoved)="onReferenceRemoved($event)"
							(placeOnCanvas)="onPlaceOnCanvas($event)"
						/>
					</ng-template>
				</p-splitter>
			}
		</div>

		<p-toast />
	`,
	styles: [
		`
			.editor-page {
				display: flex;
				flex-direction: column;
				height: 100vh;
				overflow: hidden;
			}

			:host ::ng-deep .editor-page__splitter {
				flex: 1;
				border: none;
				overflow: hidden;
			}

			:host ::ng-deep .editor-page__splitter .p-splitterpanel {
				overflow: hidden;
			}

			.editor-page__center-panel {
				display: flex;
				flex-direction: column;
				height: 100%;
				overflow: hidden;
			}

			.editor-page__canvas-area {
				flex: 1;
				overflow: hidden;
			}

			.editor-page__loading,
			.editor-page__error {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 1rem;
				flex: 1;
				color: var(--p-surface-600);
			}
		`,
	],
	providers: [MessageService],
})
export class CompositionEditorPage implements OnInit {
	readonly editorState = inject(EditorStateService);
	readonly fabricCanvas = inject(FabricCanvasService);
	readonly canvasZoom = inject(CanvasZoomService);
	readonly canvasPan = inject(CanvasPanService);
	private readonly compositionService = inject(CompositionService);
	private readonly promptEnhancementService = inject(
		PromptEnhancementService,
	);
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly messageService = inject(MessageService);
	private readonly destroyRef = inject(DestroyRef);

	private readonly orgId = environment.organizationId;
	private compositionId = '';
	private pendingVersionLoadId = '';
	private pollingSubscription: Subscription | null = null;

	readonly versionThumbnailUrls = signal<Record<string, string>>({});
	readonly referenceImages = signal<ReferenceImage[]>([]);
	readonly isEnhancingPrompt = signal(false);
	readonly aspectRatioMode = signal<'auto' | 'manual'>('auto');
	readonly selectedAspectRatio = signal('1:1');
	private refIdCounter = 0;

	readonly detectedAspectRatio = computed(() => {
		const w = this.editorState.composition()?.canvasWidth ?? 1024;
		const h = this.editorState.composition()?.canvasHeight ?? 1024;
		const ratio = w / h;
		for (const preset of ASPECT_RATIO_PRESETS) {
			if (Math.abs(preset.value - ratio) < ASPECT_RATIO_TOLERANCE) {
				return preset.ratio;
			}
		}
		return `${w}:${h}`;
	});

	private readonly versionsDropdown =
		viewChild<VersionsDropdownComponent>('versionsDropdown');
	private readonly canvasPreview =
		viewChild<CanvasPreviewComponent>('canvasPreview');
	private readonly generationPanel = viewChild(GenerationPanelComponent);

	ngOnInit(): void {
		this.compositionId =
			this.route.snapshot.paramMap.get('compositionId') ?? '';
		if (!this.compositionId) {
			this.router.navigate(['/image-editing']);
			return;
		}
		this.loadComposition();
	}

	loadComposition(): void {
		if (this.editorState.isLoading()) return;
		this.editorState.setLoading();
		this.compositionService
			.getOne(this.orgId, this.compositionId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (composition) => {
					this.editorState.composition.set(composition);
					this.editorState.compositionName.set(
						composition.name || 'Untitled',
					);
					this.editorState.setIdle();
					this.loadVersions();
				},
				error: (err) => {
					this.editorState.setError(
						err?.error?.message ?? 'Failed to load composition',
					);
				},
			});
	}

	goBack(): void {
		this.router.navigate(['/image-editing']);
	}

	onNameChange(newName: string): void {
		this.editorState.compositionName.set(newName);
		this.compositionService
			.update(this.orgId, this.compositionId, { name: newName })
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Name Updated',
						life: 2000,
					});
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to update name',
					});
				},
			});
	}

	onVersionsToggle(event: Event): void {
		this.versionsDropdown()?.toggle(event);
	}

	async onDownload(): Promise<void> {
		const url = this.editorState.baseImageUrl();
		if (!url) return;

		const filename = `${this.editorState.compositionName()}.jpg`;

		// Data URLs can use simple anchor download; cross-origin URLs need fetch+blob
		if (url.startsWith('data:')) {
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			link.click();
			return;
		}

		try {
			const response = await fetch(url);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = blobUrl;
			link.download = filename;
			link.click();
			URL.revokeObjectURL(blobUrl);
		} catch {
			this.messageService.add({
				severity: 'error',
				summary: 'Download Failed',
				detail: 'Could not download the image',
			});
		}
	}

	onGenerate(event: { prompt: string; mode: string }): void {
		if (this.editorState.isBusy()) return;
		this.editorState.setGenerating();

		// Cancel any active polling from a previous generation
		this.cancelPolling();

		const dto: Record<string, unknown> = {
			mode: event.mode,
			prompt: event.prompt,
		};

		if (event.mode === 'inpaint' || event.mode === 'stitch') {
			// Export clean base image without FabricJS overlay objects
			const compositeData =
				this.canvasPreview()?.exportBaseImageAsBase64();
			if (compositeData) {
				dto['backgroundImage'] = compositeData.replace(
					/^data:image\/\w+;base64,/,
					'',
				);
			}
		}

		if (event.mode === 'inpaint') {
			const maskData = this.fabricCanvas.exportMaskAsBase64();
			if (maskData) {
				dto['maskImage'] = maskData.replace(
					/^data:image\/\w+;base64,/,
					'',
				);
			}
		}

		if (event.mode === 'stitch') {
			const bbox = this.fabricCanvas.getObjectsBoundingBox();
			if (bbox) {
				dto['boundingBox'] = bbox;
			}
		}

		this.compositionService
			.createVersion(this.orgId, this.compositionId, dto as any)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (version) => {
					this.editorState.versions.update((v) => [version, ...v]);
					this.editorState.currentVersion.set(version);
					this.editorState.setIdle();
					this.messageService.add({
						severity: 'info',
						summary: 'Version Created',
						detail: `Version ${version.versionNumber} is processing...`,
					});
					this.pollVersionStatus(version);
				},
				error: (err) => {
					this.editorState.setIdle();
					this.messageService.add({
						severity: 'error',
						summary: 'Generation Failed',
						detail:
							err?.error?.message ?? 'Failed to create version',
					});
				},
			});
	}

	private pollVersionStatus(version: CompositionVersion): void {
		this.editorState.isPolling.set(true);

		this.pollingSubscription = timer(0, 3000)
			.pipe(
				switchMap(() =>
					this.compositionService.getVersion(
						this.orgId,
						this.compositionId,
						version.id,
					),
				),
				takeWhile((v) => v.status === 'processing', true),
				takeUntilDestroyed(this.destroyRef),
			)
			.subscribe({
				next: (updated) => {
					// Update the version in the versions list
					this.editorState.versions.update((versions) =>
						versions.map((v) =>
							v.id === updated.id ? updated : v,
						),
					);

					if (updated.status === 'success') {
						this.editorState.isPolling.set(false);
						this.editorState.currentVersion.set(updated);
						this.onSelectVersion(updated);
						this.messageService.add({
							severity: 'success',
							summary: 'Generation Complete',
							detail: `Version ${updated.versionNumber} is ready`,
							life: 3000,
						});
					} else if (updated.status === 'failed') {
						this.editorState.isPolling.set(false);
						this.editorState.currentVersion.set(updated);
						const errorMsg =
							updated.errorMessage ?? 'Generation failed';
						this.messageService.add({
							severity: 'error',
							summary: 'Generation Failed',
							detail: errorMsg,
						});
					}
				},
				error: () => {
					this.editorState.isPolling.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Polling Error',
						detail: 'Failed to check generation status',
					});
				},
			});
	}

	private cancelPolling(): void {
		if (this.pollingSubscription) {
			this.pollingSubscription.unsubscribe();
			this.pollingSubscription = null;
			this.editorState.isPolling.set(false);
		}
	}

	onSelectVersion(version: CompositionVersion): void {
		this.editorState.currentVersion.set(version);
		this.pendingVersionLoadId = version.id;

		if (version.status === 'success' && version.baseImageS3Key) {
			const expectedId = version.id;
			this.editorState.isLoadingVersion.set(true);

			// Revoke previous blob URL to avoid memory leaks
			const prev = this.editorState.baseImageUrl();
			if (prev?.startsWith('blob:')) {
				URL.revokeObjectURL(prev);
			}

			// Fetch image as blob (same-origin) to avoid canvas taint
			this.compositionService
				.getVersionImageBlob(this.orgId, this.compositionId, version.id)
				.pipe(takeUntilDestroyed(this.destroyRef))
				.subscribe({
					next: (blobUrl) => {
						if (this.pendingVersionLoadId !== expectedId) return;
						this.editorState.baseImageUrl.set(blobUrl);
						this.editorState.isLoadingVersion.set(false);
					},
					error: () => {
						this.editorState.isLoadingVersion.set(false);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: 'Failed to load version image',
						});
					},
				});
		}
	}

	onImageFileSelected(file: File): void {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			this.editorState.baseImageUrl.set(dataUrl);
		};
		reader.readAsDataURL(file);
	}

	onBrushSizeChange(size: number): void {
		const canvas = this.fabricCanvas.getCanvas();
		if (canvas && canvas.freeDrawingBrush) {
			canvas.freeDrawingBrush.width = size;
		}
	}

	onClearMask(): void {
		this.fabricCanvas.clearMask();
	}

	onReferenceAdded(file: File): void {
		const reader = new FileReader();
		reader.onload = () => {
			const id = `ref-${++this.refIdCounter}`;
			const url = reader.result as string;
			this.referenceImages.update((imgs) => [
				...imgs,
				{ id, url, fileName: file.name },
			]);
		};
		reader.readAsDataURL(file);
	}

	onReferenceRemoved(id: string): void {
		this.referenceImages.update((imgs) => imgs.filter((i) => i.id !== id));
	}

	async onPlaceOnCanvas(id: string): Promise<void> {
		const ref = this.referenceImages().find((i) => i.id === id);
		if (!ref) return;
		const canvas = this.fabricCanvas.getCanvas();
		if (!canvas) return;
		const fabric = await this.fabricCanvas.loadFabric();
		const img = await fabric.FabricImage.fromURL(ref.url, {
			crossOrigin: 'anonymous',
		});
		// Scale to fit within canvas bounds
		const canvasW = canvas.width ?? 1024;
		const canvasH = canvas.height ?? 1024;
		const scale = Math.min(
			(canvasW * 0.5) / (img.width ?? 1),
			(canvasH * 0.5) / (img.height ?? 1),
			1,
		);
		img.scale(scale);
		img.set({
			left: canvasW / 2 - ((img.width ?? 0) * scale) / 2,
			top: canvasH / 2 - ((img.height ?? 0) * scale) / 2,
		});
		canvas.add(img);
		canvas.setActiveObject(img);
		canvas.requestRenderAll();
	}

	onEnhancePrompt(prompt: string): void {
		this.isEnhancingPrompt.set(true);
		this.promptEnhancementService
			.enhancePrompt(prompt)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (enhanced) => {
					this.isEnhancingPrompt.set(false);
					this.generationPanel()?.setPrompt(enhanced);
					this.messageService.add({
						severity: 'success',
						summary: 'Prompt Enhanced',
						life: 3000,
					});
				},
				error: (err) => {
					this.isEnhancingPrompt.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Enhancement Failed',
						detail: err?.message ?? 'Failed to enhance prompt',
					});
				},
			});
	}

	onAspectRatioModeChanged(mode: 'auto' | 'manual'): void {
		this.aspectRatioMode.set(mode);
	}

	onAspectRatioSelected(ratio: string): void {
		this.selectedAspectRatio.set(ratio);

		const parts = ratio.split(':');
		const ratioW = parseInt(parts[0], 10);
		const ratioH = parseInt(parts[1], 10);
		const currentW = this.editorState.composition()?.canvasWidth ?? 1024;
		const currentH = this.editorState.composition()?.canvasHeight ?? 1024;
		const maxDim = Math.max(currentW, currentH);

		let newWidth: number;
		let newHeight: number;
		if (ratioW >= ratioH) {
			newWidth = maxDim;
			newHeight = Math.round((maxDim * ratioH) / ratioW);
		} else {
			newHeight = maxDim;
			newWidth = Math.round((maxDim * ratioW) / ratioH);
		}

		newWidth = Math.max(1, Math.min(4096, newWidth));
		newHeight = Math.max(1, Math.min(4096, newHeight));

		this.compositionService
			.update(this.orgId, this.compositionId, {
				canvasWidth: newWidth,
				canvasHeight: newHeight,
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (updated) => {
					this.editorState.composition.set(updated);
					this.messageService.add({
						severity: 'success',
						summary: 'Canvas Resized',
						detail: `${newWidth}\u00D7${newHeight} (${ratio})`,
						life: 2000,
					});
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to update canvas dimensions',
					});
				},
			});
	}

	private loadVersions(): void {
		this.compositionService
			.listVersions(this.orgId, this.compositionId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (result) => {
					this.editorState.versions.set(result.data);
					if (result.data.length > 0) {
						this.onSelectVersion(result.data[0]);
					}
				},
				error: () => {
					this.messageService.add({
						severity: 'warn',
						summary: 'Warning',
						detail: 'Failed to load version history',
					});
				},
			});
	}
}
