import { Injectable, signal } from '@angular/core';

/**
 * CSS transform-based pan service for the canvas container.
 * Scoped to the editor route.
 */
@Injectable()
export class CanvasPanService {
	readonly panX = signal(0);
	readonly panY = signal(0);

	private isPanning = false;
	private startX = 0;
	private startY = 0;
	private startPanX = 0;
	private startPanY = 0;

	startPan(clientX: number, clientY: number): void {
		this.isPanning = true;
		this.startX = clientX;
		this.startY = clientY;
		this.startPanX = this.panX();
		this.startPanY = this.panY();
	}

	movePan(clientX: number, clientY: number): void {
		if (!this.isPanning) return;
		this.panX.set(this.startPanX + (clientX - this.startX));
		this.panY.set(this.startPanY + (clientY - this.startY));
	}

	endPan(): void {
		this.isPanning = false;
	}

	resetPan(): void {
		this.panX.set(0);
		this.panY.set(0);
	}
}
