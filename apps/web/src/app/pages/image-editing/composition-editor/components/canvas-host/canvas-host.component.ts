import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import { FabricCanvasService } from '../../services/fabric-canvas.service';
import { CanvasZoomService } from '../../services/canvas-zoom.service';
import { CanvasPanService } from '../../services/canvas-pan.service';
import { ZoomToolbarComponent } from '../zoom-toolbar/zoom-toolbar.component';

@Component({
	selector: 'app-canvas-preview',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, ZoomToolbarComponent],
	template: `
		<div class="canvas-preview">
			<!-- Hidden file input for image upload -->
			<input
				#fileInput
				type="file"
				accept="image/*"
				class="canvas-preview__file-input"
				(change)="onFileSelected($event)"
			/>

			@if (!hasBaseImage() && !isGenerating() && !isLoadingVersion()) {
				<!-- Empty state -->
				<div class="canvas-preview__empty-state">
					<i class="pi pi-image canvas-preview__empty-icon"></i>
					<h3>No image yet</h3>
					<p>Upload an image or generate one to get started</p>
					<p-button
						label="Upload Image"
						icon="pi pi-upload"
						(onClick)="triggerFileInput()"
					/>
				</div>
			} @else {
				<!-- Canvas wrapper with zoom/pan -->
				<div
					#canvasWrapper
					class="canvas-preview__wrapper"
					[class.canvas-preview__wrapper--panning]="isPanning()"
					(mousedown)="onMouseDown($event)"
					(mousemove)="onMouseMove($event)"
					(mouseup)="onMouseUp()"
					(mouseleave)="onMouseUp()"
					(wheel)="onWheel($event)"
				>
					<div
						class="canvas-preview__transform-container"
						[style.transform]="containerTransform()"
					>
						<div
							class="canvas-preview__canvas-area"
							[style.width.px]="canvasWidth()"
							[style.height.px]="canvasHeight()"
						>
							@if (baseImageUrl()) {
								<img
									#baseImage
									class="canvas-preview__base-image"
									[src]="baseImageUrl()!"
									(load)="onBaseImageLoad()"
									alt="Composition"
								/>
							}
							<canvas
								#overlayCanvas
								class="canvas-preview__overlay-canvas"
							></canvas>
						</div>
					</div>
				</div>

				<!-- Loading overlay -->
				@if (isGenerating() || isLoadingVersion()) {
					<div class="canvas-preview__loading-overlay">
						<p-progressSpinner strokeWidth="3" />
						<p>
							{{
								isGenerating()
									? 'Generating...'
									: 'Loading version...'
							}}
						</p>
					</div>
				}
			}

			<!-- Zoom toolbar (always visible when we have content) -->
			@if (hasBaseImage()) {
				<div class="canvas-preview__zoom-toolbar">
					<app-zoom-toolbar />
				</div>
			}
		</div>

		<!-- Drag overlay -->
		<div
			class="canvas-preview__drag-overlay"
			[class.canvas-preview__drag-overlay--active]="isDragging()"
			(dragover)="onDragOver($event)"
			(dragleave)="onDragLeave()"
			(drop)="onDrop($event)"
		>
			<div class="canvas-preview__drag-content">
				<i class="pi pi-upload"></i>
				<p>Drop image here</p>
			</div>
		</div>
	`,
	styles: [
		`
			:host {
				display: flex;
				flex: 1;
				position: relative;
				overflow: hidden;
			}

			.canvas-preview {
				display: flex;
				flex: 1;
				align-items: center;
				justify-content: center;
				background: var(--p-surface-100);
				position: relative;
				overflow: hidden;
			}

			.canvas-preview__file-input {
				display: none;
			}

			/* Empty state */
			.canvas-preview__empty-state {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.75rem;
				color: var(--p-surface-500);
				text-align: center;

				h3 {
					margin: 0;
					font-size: 1.125rem;
					color: var(--p-surface-700);
				}

				p {
					margin: 0;
					font-size: 0.875rem;
				}
			}

			.canvas-preview__empty-icon {
				font-size: 3rem;
				color: var(--p-surface-300);
			}

			/* Canvas wrapper */
			.canvas-preview__wrapper {
				flex: 1;
				height: 100%;
				display: flex;
				align-items: center;
				justify-content: center;
				cursor: grab;
				overflow: hidden;
				padding: 1rem;

				&--panning {
					cursor: grabbing;
				}
			}

			.canvas-preview__transform-container {
				position: relative;
				transform-origin: center center;
				transition: none;
			}

			.canvas-preview__canvas-area {
				position: relative;
				background: var(--p-surface-200);
				box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
			}

			.canvas-preview__base-image {
				display: block;
				width: 100%;
				height: 100%;
				object-fit: contain;
				user-select: none;
				pointer-events: none;
			}

			.canvas-preview__overlay-canvas {
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				pointer-events: auto;
			}

			/* FabricJS wraps the canvas in a .canvas-container div.
			   Position it over the base image instead of flowing below it. */
			:host ::ng-deep .canvas-container {
				position: absolute !important;
				top: 0;
				left: 0;
			}

			/* Loading overlay */
			.canvas-preview__loading-overlay {
				position: absolute;
				inset: 0;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 1rem;
				background: rgba(255, 255, 255, 0.8);
				z-index: 10;

				p {
					color: var(--p-surface-600);
					margin: 0;
					font-size: 0.875rem;
				}
			}

			/* Zoom toolbar positioning */
			.canvas-preview__zoom-toolbar {
				position: absolute;
				bottom: 1rem;
				left: 50%;
				transform: translateX(-50%);
				z-index: 5;
			}

			/* Drag overlay */
			.canvas-preview__drag-overlay {
				position: absolute;
				inset: 0;
				display: none;
				align-items: center;
				justify-content: center;
				background: rgba(var(--p-primary-500-rgb, 59, 130, 246), 0.1);
				border: 2px dashed var(--p-primary-500);
				border-radius: 8px;
				z-index: 20;
				pointer-events: none;

				&--active {
					display: flex;
					pointer-events: auto;
				}
			}

			.canvas-preview__drag-content {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.5rem;
				color: var(--p-primary-600);
				font-size: 1rem;

				i {
					font-size: 2rem;
				}

				p {
					margin: 0;
				}
			}
		`,
	],
})
export class CanvasPreviewComponent {
	canvasWidth = input(1024);
	canvasHeight = input(1024);
	hasBaseImage = input(false);
	baseImageUrl = input<string | null>(null);
	isGenerating = input(false);
	isLoadingVersion = input(false);

	imageFileSelected = output<File>();

	readonly isPanning = signal(false);
	readonly isDragging = signal(false);

	private readonly fabricCanvas = inject(FabricCanvasService);
	private readonly canvasZoom = inject(CanvasZoomService);
	private readonly canvasPan = inject(CanvasPanService);
	private readonly destroyRef = inject(DestroyRef);

	private readonly fileInput =
		viewChild<ElementRef<HTMLInputElement>>('fileInput');
	private readonly overlayCanvas =
		viewChild<ElementRef<HTMLCanvasElement>>('overlayCanvas');
	private readonly baseImage =
		viewChild<ElementRef<HTMLImageElement>>('baseImage');
	private readonly canvasWrapper =
		viewChild<ElementRef<HTMLDivElement>>('canvasWrapper');

	readonly containerTransform = computed(() => {
		const zoom = this.canvasZoom.zoom();
		const panX = this.canvasPan.panX();
		const panY = this.canvasPan.panY();
		return `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
	});

	private canvasInitialized = false;
	private resizeObserver: ResizeObserver | null = null;

	constructor() {
		this.destroyRef.onDestroy(async () => {
			this.resizeObserver?.disconnect();
			await this.fabricCanvas.dispose();
		});

		// Resize FabricJS overlay canvas when composition dimensions change
		effect(() => {
			const w = this.canvasWidth();
			const h = this.canvasHeight();
			if (this.canvasInitialized) {
				const canvas = this.fabricCanvas.getCanvas();
				if (canvas) {
					canvas.setDimensions({ width: w, height: h });
					canvas.requestRenderAll();
				}
			}
			// Re-fit after dimension change
			this.fitCanvasToWrapper();
		});

		// Set up ResizeObserver reactively — the wrapper is conditionally
		// rendered (@else block), so we watch the viewChild signal to
		// attach/detach the observer as the element appears/disappears.
		effect(() => {
			const wrapper = this.canvasWrapper()?.nativeElement;
			this.resizeObserver?.disconnect();
			if (!wrapper) return;
			this.resizeObserver = new ResizeObserver(() => {
				this.fitCanvasToWrapper();
			});
			this.resizeObserver.observe(wrapper);
		});
	}

	onBaseImageLoad(): void {
		const img = this.baseImage()?.nativeElement;
		if (!img || !img.naturalWidth) return;

		// Initialize or resize the FabricJS overlay canvas to match canvas dimensions
		this.initOverlayCanvas(this.canvasWidth(), this.canvasHeight());

		// Auto-fit to available space on first image load
		this.fitCanvasToWrapper();
	}

	triggerFileInput(): void {
		this.fileInput()?.nativeElement.click();
	}

	onFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			this.imageFileSelected.emit(file);
			input.value = '';
		}
	}

	// Pan handlers
	onMouseDown(event: MouseEvent): void {
		if (event.button === 1 || event.altKey) {
			event.preventDefault();
			this.isPanning.set(true);
			this.canvasPan.startPan(event.clientX, event.clientY);
		}
	}

	onMouseMove(event: MouseEvent): void {
		if (this.isPanning()) {
			this.canvasPan.movePan(event.clientX, event.clientY);
		}
	}

	onMouseUp(): void {
		if (this.isPanning()) {
			this.isPanning.set(false);
			this.canvasPan.endPan();
		}
	}

	onWheel(event: WheelEvent): void {
		event.preventDefault();
		if (event.deltaY < 0) {
			this.canvasZoom.zoomIn();
		} else {
			this.canvasZoom.zoomOut();
		}
	}

	// Drag-and-drop handlers
	onDragOver(event: DragEvent): void {
		event.preventDefault();
		this.isDragging.set(true);
	}

	onDragLeave(): void {
		this.isDragging.set(false);
	}

	onDrop(event: DragEvent): void {
		event.preventDefault();
		this.isDragging.set(false);
		const file = event.dataTransfer?.files[0];
		if (file && file.type.startsWith('image/')) {
			this.imageFileSelected.emit(file);
		}
	}

	/**
	 * Composites the HTML base image + FabricJS overlay onto an offscreen
	 * canvas and returns the result as a base64 data URL (JPEG).
	 * Uses contain-mode rendering to match the on-screen display.
	 */
	exportCompositeAsBase64(): string | null {
		const img = this.baseImage()?.nativeElement;
		if (!img || !img.naturalWidth) return null;

		const cw = this.canvasWidth();
		const ch = this.canvasHeight();
		const nw = img.naturalWidth;
		const nh = img.naturalHeight;

		const offscreen = document.createElement('canvas');
		offscreen.width = cw;
		offscreen.height = ch;
		const ctx = offscreen.getContext('2d');
		if (!ctx) return null;

		// Fill background (matches the canvas-area background)
		ctx.fillStyle = '#e5e7eb';
		ctx.fillRect(0, 0, cw, ch);

		// Draw the base image with contain logic
		const scale = Math.min(cw / nw, ch / nh);
		const sw = nw * scale;
		const sh = nh * scale;
		const sx = (cw - sw) / 2;
		const sy = (ch - sh) / 2;
		ctx.drawImage(img, sx, sy, sw, sh);

		// Draw the FabricJS overlay on top
		const overlayEl = this.overlayCanvas()?.nativeElement;
		if (overlayEl) {
			ctx.drawImage(overlayEl, 0, 0, cw, ch);
		}

		return offscreen.toDataURL('image/jpeg', 0.92);
	}

	/**
	 * Exports only the base image (no FabricJS overlay) as a base64 JPEG data URL.
	 * Used for stitch/inpaint modes where overlay data is sent separately.
	 */
	exportBaseImageAsBase64(): string | null {
		const img = this.baseImage()?.nativeElement;
		if (!img || !img.naturalWidth) return null;

		const cw = this.canvasWidth();
		const ch = this.canvasHeight();
		const nw = img.naturalWidth;
		const nh = img.naturalHeight;

		const offscreen = document.createElement('canvas');
		offscreen.width = cw;
		offscreen.height = ch;
		const ctx = offscreen.getContext('2d');
		if (!ctx) return null;

		ctx.fillStyle = '#e5e7eb';
		ctx.fillRect(0, 0, cw, ch);

		const scale = Math.min(cw / nw, ch / nh);
		const sw = nw * scale;
		const sh = nh * scale;
		const sx = (cw - sw) / 2;
		const sy = (ch - sh) / 2;
		ctx.drawImage(img, sx, sy, sw, sh);

		return offscreen.toDataURL('image/jpeg', 0.92);
	}

	private fitCanvasToWrapper(): void {
		const wrapper = this.canvasWrapper()?.nativeElement;
		if (!wrapper) return;
		// clientWidth/clientHeight include padding — subtract it so the
		// canvas fits within the content area and doesn't overlap the padding.
		const style = getComputedStyle(wrapper);
		const availableW =
			wrapper.clientWidth -
			parseFloat(style.paddingLeft) -
			parseFloat(style.paddingRight);
		const availableH =
			wrapper.clientHeight -
			parseFloat(style.paddingTop) -
			parseFloat(style.paddingBottom);
		this.canvasZoom.fitToContainer(
			availableW,
			availableH,
			this.canvasWidth(),
			this.canvasHeight(),
		);
		this.canvasPan.resetPan();
	}

	private async initOverlayCanvas(
		width: number,
		height: number,
	): Promise<void> {
		const canvasEl = this.overlayCanvas()?.nativeElement;
		if (!canvasEl) return;

		if (this.canvasInitialized) {
			// Resize existing canvas
			const canvas = this.fabricCanvas.getCanvas();
			if (canvas) {
				canvas.setDimensions({ width, height });
				canvas.requestRenderAll();
			}
			return;
		}

		await this.fabricCanvas.initCanvas(canvasEl, width, height);
		this.canvasInitialized = true;
	}
}
