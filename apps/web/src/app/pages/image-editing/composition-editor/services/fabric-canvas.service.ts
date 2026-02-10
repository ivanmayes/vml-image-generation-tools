import { Injectable, signal, computed } from '@angular/core';

/**
 * FabricJS canvas operations service with signal-exposed state.
 * Dynamically imports FabricJS for code-splitting.
 * Scoped to the editor route.
 */
@Injectable()
export class FabricCanvasService {
	private fabricModule: typeof import('fabric') | null = null;
	private fabricLoadPromise: Promise<typeof import('fabric')> | null = null;
	private canvas: import('fabric').Canvas | null = null;
	private disposed = false;

	readonly canvasReady = signal(false);
	readonly activeMode = signal<'select' | 'draw' | 'erase'>('select');
	readonly objectCount = signal(0);
	readonly isDirty = signal(false);
	readonly zoomLevel = signal(1);

	readonly hasObjects = computed(() => this.objectCount() > 0);
	/** Count of mask objects (non-background) on the canvas. Updated via objectCount signal dependency. */
	readonly maskObjectCount = computed(() => {
		// Read objectCount to establish a signal dependency so this recomputes
		// whenever objects are added/removed (objectCount is updated by event listeners)
		void this.objectCount();
		if (!this.canvas) return 0;
		return this.canvas
			.getObjects()
			.filter(
				(o: any) =>
					!o.data ||
					(o.data as Record<string, unknown>).role !== 'background',
			).length;
	});
	readonly hasMask = computed(() => this.maskObjectCount() > 0);

	async loadFabric(): Promise<typeof import('fabric')> {
		if (this.fabricModule) return this.fabricModule;
		// Deduplicate concurrent calls: reuse the same in-flight promise
		if (!this.fabricLoadPromise) {
			this.fabricLoadPromise = import('fabric').then((mod) => {
				this.fabricModule = mod;
				return mod;
			});
		}
		return this.fabricLoadPromise;
	}

	async initCanvas(
		canvasElement: HTMLCanvasElement,
		width: number,
		height: number,
	): Promise<void> {
		this.disposed = false;
		const fabric = await this.loadFabric();
		// Guard: dispose() may have been called while awaiting the import
		if (this.disposed) return;
		this.canvas = new fabric.Canvas(canvasElement, {
			width,
			height,
			renderOnAddRemove: false,
			selection: true,
		});
		this.canvasReady.set(true);
		this.setupEventListeners();
	}

	getCanvas(): import('fabric').Canvas | null {
		return this.canvas;
	}

	setMode(mode: 'select' | 'draw' | 'erase'): void {
		if (!this.canvas) return;
		this.activeMode.set(mode);

		switch (mode) {
			case 'select':
				this.canvas.isDrawingMode = false;
				this.canvas.selection = true;
				break;
			case 'draw':
			case 'erase':
				this.canvas.isDrawingMode = true;
				this.canvas.selection = false;
				this.ensureBrush(mode);
				break;
		}
		this.canvas.requestRenderAll();
	}

	private ensureBrush(mode: 'draw' | 'erase'): void {
		if (!this.canvas || !this.fabricModule) return;
		const brush = new this.fabricModule.PencilBrush(this.canvas);
		brush.width = this.canvas.freeDrawingBrush?.width ?? 40;
		brush.color = mode === 'erase' ? 'rgba(0,0,0,1)' : 'rgba(255,0,0,0.5)';
		this.canvas.freeDrawingBrush = brush;
	}

	toJSON(): Record<string, unknown> {
		if (!this.canvas) return {};
		return this.canvas.toJSON() as Record<string, unknown>;
	}

	async loadFromJSON(json: Record<string, unknown>): Promise<void> {
		if (!this.canvas) return;
		await this.canvas.loadFromJSON(json);
		// Guard: canvas may have been disposed while awaiting JSON load
		if (!this.canvas) return;
		this.canvas.requestRenderAll();
		this.updateObjectCount();
	}

	exportMaskAsBase64(): string | null {
		if (!this.canvas) return null;
		return this.canvas.toDataURL({ format: 'png', multiplier: 1 });
	}

	/**
	 * Compute the bounding box of all non-background objects on the canvas.
	 * Returns {left, top, width, height} in canvas (natural image) coordinates,
	 * or null if there are no objects.
	 */
	getObjectsBoundingBox(): {
		left: number;
		top: number;
		width: number;
		height: number;
	} | null {
		if (!this.canvas) return null;
		const objects = this.canvas
			.getObjects()
			.filter(
				(o: any) =>
					!o.data ||
					(o.data as Record<string, unknown>).role !== 'background',
			);
		if (objects.length === 0) return null;

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const obj of objects) {
			const rect = obj.getBoundingRect();
			minX = Math.min(minX, rect.left);
			minY = Math.min(minY, rect.top);
			maxX = Math.max(maxX, rect.left + rect.width);
			maxY = Math.max(maxY, rect.top + rect.height);
		}

		// Clamp to canvas bounds
		const cw = this.canvas.width ?? 0;
		const ch = this.canvas.height ?? 0;
		minX = Math.max(0, Math.floor(minX));
		minY = Math.max(0, Math.floor(minY));
		maxX = Math.min(cw, Math.ceil(maxX));
		maxY = Math.min(ch, Math.ceil(maxY));

		const width = maxX - minX;
		const height = maxY - minY;
		if (width <= 0 || height <= 0) return null;

		return { left: minX, top: minY, width, height };
	}

	clearMask(): void {
		if (!this.canvas) return;
		const objects = this.canvas.getObjects();
		const toRemove = objects.filter(
			(o: any) =>
				!o.data ||
				(o.data as Record<string, unknown>).role !== 'background',
		);
		for (const obj of toRemove) {
			this.canvas.remove(obj);
		}
		this.canvas.requestRenderAll();
		this.updateObjectCount();
	}

	clearAll(): void {
		if (!this.canvas) return;
		this.canvas.clear();
		this.objectCount.set(0);
		this.isDirty.set(false);
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		if (this.canvas) {
			this.canvas.off();
			await this.canvas.dispose();
			this.canvas = null;
		}
		this.canvasReady.set(false);
		this.objectCount.set(0);
	}

	private setupEventListeners(): void {
		if (!this.canvas) return;

		this.canvas.on('object:added', () => {
			this.updateObjectCount();
			this.isDirty.set(true);
		});

		this.canvas.on('object:removed', () => {
			this.updateObjectCount();
			this.isDirty.set(true);
		});

		this.canvas.on('object:modified', () => {
			this.isDirty.set(true);
		});
	}

	private updateObjectCount(): void {
		if (!this.canvas) return;
		this.objectCount.set(this.canvas.getObjects().length);
	}
}
