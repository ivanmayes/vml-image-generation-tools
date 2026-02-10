import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import {
	ReferenceImagesPanelComponent,
	type ReferenceImage,
} from '../reference-images-panel/reference-images-panel.component';
import { UpscalePanelComponent } from '../upscale-panel/upscale-panel.component';

@Component({
	selector: 'app-properties-sidebar',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		ReferenceImagesPanelComponent,
		UpscalePanelComponent,
	],
	template: `
		<div class="properties-sidebar">
			<p-tabs [value]="activeTab()" (valueChange)="onTabChange($event)">
				<p-tablist>
					<p-tab value="references">
						References
						@if (referenceImages().length > 0) {
							<p-badge
								[value]="'' + referenceImages().length"
								size="small"
								class="properties-sidebar__badge"
							/>
						}
					</p-tab>
					<p-tab value="brush">
						Brush Mask
						@if (hasMask()) {
							<span class="properties-sidebar__active-dot"></span>
						}
					</p-tab>
					<p-tab value="expand">Expand</p-tab>
					<p-tab value="upscale">Upscale</p-tab>
				</p-tablist>

				<p-tabpanels>
					<p-tabpanel value="references">
						<app-reference-images-panel
							[images]="referenceImages()"
							[isBusy]="isBusy()"
							(addImage)="referenceAdded.emit($event)"
							(removeImage)="referenceRemoved.emit($event)"
							(placeOnCanvas)="placeOnCanvas.emit($event)"
						/>
					</p-tabpanel>

					<p-tabpanel value="brush">
						<div class="properties-sidebar__brush-panel">
							<div class="properties-sidebar__field">
								<span class="properties-sidebar__label"
									>Brush Size</span
								>
								<div class="properties-sidebar__brush-size-row">
									<p-slider
										[(ngModel)]="brushSizeValue"
										[min]="10"
										[max]="200"
										(ngModelChange)="
											brushSizeChange.emit($event)
										"
										class="properties-sidebar__slider"
									/>
									<span
										class="properties-sidebar__brush-size-label"
									>
										{{ brushSizeValue }}px
									</span>
								</div>
							</div>
							<p-button
								label="Clear Mask"
								icon="pi pi-trash"
								severity="secondary"
								[outlined]="true"
								[disabled]="!hasMask()"
								(onClick)="clearMask.emit()"
								styleClass="w-full"
								size="small"
							/>
						</div>
					</p-tabpanel>

					<p-tabpanel value="expand">
						<div class="properties-sidebar__expand-panel">
							<i class="pi pi-arrows-alt"></i>
							<p>
								Canvas expansion allows you to extend the image
								boundaries. This feature is coming soon.
							</p>
						</div>
					</p-tabpanel>

					<p-tabpanel value="upscale">
						<app-upscale-panel
							[imageWidth]="imageWidth()"
							[imageHeight]="imageHeight()"
						/>
					</p-tabpanel>
				</p-tabpanels>
			</p-tabs>
		</div>
	`,
	styles: [
		`
			.properties-sidebar {
				display: flex;
				flex-direction: column;
				height: 100%;
				overflow: hidden;
			}

			:host ::ng-deep .p-tabs {
				display: flex;
				flex-direction: column;
				height: 100%;
			}

			:host ::ng-deep .p-tablist {
				flex-shrink: 0;
			}

			:host ::ng-deep .p-tabpanels {
				flex: 1;
				overflow-y: auto;
				padding: 0;
			}

			:host ::ng-deep .p-tabpanel {
				padding: 0;
			}

			:host ::ng-deep .p-tab {
				font-size: 0.8125rem;
				padding: 0.625rem 0.75rem;
				gap: 0.375rem;
			}

			.properties-sidebar__badge {
				margin-left: 0.25rem;
			}

			.properties-sidebar__active-dot {
				width: 6px;
				height: 6px;
				border-radius: 50%;
				background: var(--p-primary-500);
				display: inline-block;
				margin-left: 0.25rem;
			}

			/* Brush panel */
			.properties-sidebar__brush-panel {
				padding: 1rem;
				display: flex;
				flex-direction: column;
				gap: 1rem;
			}

			.properties-sidebar__field {
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}

			.properties-sidebar__label {
				font-size: 0.75rem;
				font-weight: 600;
				text-transform: uppercase;
				color: var(--p-surface-500);
			}

			.properties-sidebar__brush-size-row {
				display: flex;
				align-items: center;
				gap: 0.75rem;
			}

			.properties-sidebar__slider {
				flex: 1;
			}

			.properties-sidebar__brush-size-label {
				font-size: 0.75rem;
				font-weight: 500;
				min-width: 40px;
				text-align: right;
			}

			/* Expand panel placeholder */
			.properties-sidebar__expand-panel {
				padding: 2rem 1rem;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.75rem;
				color: var(--p-surface-400);
				text-align: center;

				i {
					font-size: 2rem;
				}

				p {
					margin: 0;
					font-size: 0.875rem;
					line-height: 1.5;
				}
			}
		`,
	],
})
export class PropertiesSidebarComponent {
	referenceImages = input<ReferenceImage[]>([]);
	brushSize = input(40);
	hasMask = input(false);
	isBusy = input(false);
	canUpscale = input(false);
	imageWidth = input(0);
	imageHeight = input(0);

	brushSizeChange = output<number>();
	clearMask = output<void>();
	referenceAdded = output<File>();
	referenceRemoved = output<string>();
	placeOnCanvas = output<string>();
	modeChange = output<'select' | 'draw' | 'erase'>();

	activeTab = signal('references');
	brushSizeValue = 40;

	onTabChange(tab: string | number | undefined): void {
		if (tab == null) return;
		const tabStr = String(tab);
		this.activeTab.set(tabStr);
		// Auto-activate brush mode when switching to Brush tab;
		// any other tab reverts to select mode so accidental draws don't occur.
		if (tabStr === 'brush') {
			this.modeChange.emit('draw');
		} else {
			this.modeChange.emit('select');
		}
	}
}
