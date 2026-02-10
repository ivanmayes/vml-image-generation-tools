import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import { CanvasZoomService } from '../../services/canvas-zoom.service';

@Component({
	selector: 'app-zoom-toolbar',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	template: `
		<div class="zoom-toolbar">
			<button
				class="zoom-toolbar__btn"
				(click)="canvasZoom.zoomOut()"
				pTooltip="Zoom out"
			>
				<i class="pi pi-minus"></i>
			</button>
			<span class="zoom-toolbar__label">
				{{ canvasZoom.zoomPercent() }}%
			</span>
			<button
				class="zoom-toolbar__btn"
				(click)="canvasZoom.zoomIn()"
				pTooltip="Zoom in"
			>
				<i class="pi pi-plus"></i>
			</button>
			<span class="zoom-toolbar__separator"></span>
			<button
				class="zoom-toolbar__btn"
				(click)="canvasZoom.resetZoom()"
				pTooltip="Reset zoom"
			>
				<i class="pi pi-replay"></i>
			</button>
			<span class="zoom-toolbar__separator"></span>
			<button
				class="zoom-toolbar__btn"
				[disabled]="true"
				pTooltip="Crop overlays (coming soon)"
			>
				<i class="pi pi-th-large"></i>
			</button>
		</div>
	`,
	styles: [
		`
			.zoom-toolbar {
				display: flex;
				align-items: center;
				gap: 0.125rem;
				background: rgba(0, 0, 0, 0.8);
				backdrop-filter: blur(10px);
				border-radius: 8px;
				padding: 0.25rem 0.5rem;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
			}

			.zoom-toolbar__btn {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 28px;
				height: 28px;
				border: none;
				background: transparent;
				color: rgba(255, 255, 255, 0.85);
				border-radius: 4px;
				cursor: pointer;
				transition: all 0.15s;
				padding: 0;

				&:hover:not(:disabled) {
					background: rgba(255, 255, 255, 0.15);
					color: white;
				}

				&:disabled {
					color: rgba(255, 255, 255, 0.3);
					cursor: not-allowed;
				}

				i {
					font-size: 0.75rem;
				}
			}

			.zoom-toolbar__label {
				font-size: 0.6875rem;
				color: rgba(255, 255, 255, 0.85);
				min-width: 2.5rem;
				text-align: center;
				font-variant-numeric: tabular-nums;
			}

			.zoom-toolbar__separator {
				width: 1px;
				height: 16px;
				background: rgba(255, 255, 255, 0.2);
				margin: 0 0.125rem;
			}
		`,
	],
})
export class ZoomToolbarComponent {
	readonly canvasZoom = inject(CanvasZoomService);
}
