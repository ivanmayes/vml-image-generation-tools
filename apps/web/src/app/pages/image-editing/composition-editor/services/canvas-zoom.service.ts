import { Injectable, signal, computed } from '@angular/core';

/**
 * CSS transform-based zoom service for the canvas container.
 * Scoped to the editor route.
 */
@Injectable()
export class CanvasZoomService {
	private static readonly MIN_ZOOM = 0.1;
	private static readonly MAX_ZOOM = 5;
	private static readonly ZOOM_STEP = 0.1;

	readonly zoom = signal(1);
	readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

	zoomIn(): void {
		const next = Math.min(
			this.zoom() + CanvasZoomService.ZOOM_STEP,
			CanvasZoomService.MAX_ZOOM,
		);
		this.zoom.set(next);
	}

	zoomOut(): void {
		const next = Math.max(
			this.zoom() - CanvasZoomService.ZOOM_STEP,
			CanvasZoomService.MIN_ZOOM,
		);
		this.zoom.set(next);
	}

	resetZoom(): void {
		this.zoom.set(1);
	}

	fitToContainer(
		containerWidth: number,
		containerHeight: number,
		canvasWidth: number,
		canvasHeight: number,
	): void {
		if (canvasWidth <= 0 || canvasHeight <= 0) return;
		const scaleX = containerWidth / canvasWidth;
		const scaleY = containerHeight / canvasHeight;
		const scale = Math.min(scaleX, scaleY, 1);
		this.zoom.set(Math.max(scale, CanvasZoomService.MIN_ZOOM));
	}
}
