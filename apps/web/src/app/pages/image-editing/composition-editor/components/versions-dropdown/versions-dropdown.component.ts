import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
	viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Popover } from 'primeng/popover';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import type { CompositionVersion } from '../../../../../shared/models/composition.model';

@Component({
	selector: 'app-versions-dropdown',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	template: `
		<p-popover #versionPopover>
			<div class="versions-dropdown">
				<div class="versions-dropdown__header">
					<span class="versions-dropdown__title"
						>Version History</span
					>
					<span class="versions-dropdown__count">
						{{ versions().length }} versions
					</span>
				</div>

				@if (versions().length === 0) {
					<div class="versions-dropdown__empty">
						<i class="pi pi-history"></i>
						<p>No versions yet</p>
					</div>
				} @else {
					<div class="versions-dropdown__list">
						@for (version of versions(); track version.id) {
							<div
								class="versions-dropdown__item"
								[class.versions-dropdown__item--active]="
									currentVersionId() === version.id
								"
								role="button"
								tabindex="0"
								(click)="onSelect(version)"
								(keydown.enter)="onSelect(version)"
							>
								<div class="versions-dropdown__item-thumb">
									@if (
										version.status === 'success' &&
										thumbnailUrls()[version.id]
									) {
										<img
											[src]="thumbnailUrls()[version.id]"
											alt="Version thumbnail"
										/>
									} @else {
										<div
											class="versions-dropdown__item-thumb-placeholder"
										>
											@switch (version.status) {
												@case ('processing') {
													<i
														class="pi pi-spin pi-spinner"
													></i>
												}
												@case ('failed') {
													<i
														class="pi pi-exclamation-triangle"
													></i>
												}
												@default {
													<i class="pi pi-image"></i>
												}
											}
										</div>
									}
								</div>
								<div class="versions-dropdown__item-info">
									<div class="versions-dropdown__item-header">
										<span
											class="versions-dropdown__item-version"
										>
											Version
											{{ version.versionNumber }}
										</span>
										@switch (version.status) {
											@case ('processing') {
												<p-tag
													severity="info"
													value="Processing"
													[rounded]="true"
												/>
											}
											@case ('success') {
												<p-tag
													severity="success"
													value="Done"
													[rounded]="true"
												/>
											}
											@case ('failed') {
												<p-tag
													severity="danger"
													value="Failed"
													[rounded]="true"
												/>
											}
										}
									</div>
									@if (version.prompt) {
										<p
											class="versions-dropdown__item-prompt"
										>
											{{ version.prompt }}
										</p>
									}
									<span class="versions-dropdown__item-date">
										{{ version.createdAt | date: 'short' }}
									</span>
								</div>
							</div>
						}
					</div>
				}
			</div>
		</p-popover>
	`,
	styles: [
		`
			.versions-dropdown {
				width: 320px;
				max-height: 400px;
				display: flex;
				flex-direction: column;
			}

			.versions-dropdown__header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 0.75rem 1rem;
				border-bottom: 1px solid var(--p-surface-200);
			}

			.versions-dropdown__title {
				font-size: 0.875rem;
				font-weight: 600;
			}

			.versions-dropdown__count {
				font-size: 0.75rem;
				color: var(--p-surface-400);
			}

			.versions-dropdown__empty {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.5rem;
				padding: 2rem 1rem;
				color: var(--p-surface-400);

				i {
					font-size: 1.5rem;
				}

				p {
					margin: 0;
					font-size: 0.875rem;
				}
			}

			.versions-dropdown__list {
				overflow-y: auto;
				max-height: 340px;
			}

			.versions-dropdown__item {
				display: flex;
				gap: 0.75rem;
				padding: 0.625rem 1rem;
				cursor: pointer;
				transition: background 0.15s;
				border-bottom: 1px solid var(--p-surface-100);

				&:hover {
					background: var(--p-surface-50);
				}

				&--active {
					background: var(--p-primary-50);
					border-left: 3px solid var(--p-primary-500);
				}
			}

			.versions-dropdown__item-thumb {
				width: 48px;
				height: 48px;
				border-radius: 6px;
				overflow: hidden;
				flex-shrink: 0;
				background: var(--p-surface-100);

				img {
					width: 100%;
					height: 100%;
					object-fit: cover;
				}
			}

			.versions-dropdown__item-thumb-placeholder {
				width: 100%;
				height: 100%;
				display: flex;
				align-items: center;
				justify-content: center;
				color: var(--p-surface-400);
			}

			.versions-dropdown__item-info {
				flex: 1;
				min-width: 0;
			}

			.versions-dropdown__item-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 0.125rem;
			}

			.versions-dropdown__item-version {
				font-size: 0.8125rem;
				font-weight: 600;
			}

			.versions-dropdown__item-prompt {
				font-size: 0.6875rem;
				color: var(--p-surface-500);
				margin: 0;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.versions-dropdown__item-date {
				font-size: 0.625rem;
				color: var(--p-surface-400);
			}
		`,
	],
})
export class VersionsDropdownComponent {
	versions = input<CompositionVersion[]>([]);
	currentVersionId = input<string | null>(null);
	thumbnailUrls = input<Record<string, string>>({});

	selectVersion = output<CompositionVersion>();

	private readonly popover = viewChild<Popover>('versionPopover');

	toggle(event: Event): void {
		this.popover()?.toggle(event);
	}

	onSelect(version: CompositionVersion): void {
		this.selectVersion.emit(version);
		this.popover()?.hide();
	}
}
