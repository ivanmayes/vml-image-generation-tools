import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	ElementRef,
	HostListener,
	input,
	model,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import {
	GeneratedImage,
	IterationSnapshot,
} from '../../../../shared/models/generation-request.model';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { JudgeFeedbackComponent } from '../judge-feedback/judge-feedback.component';
import { getScoreSeverity } from '../../../../shared/utils/score.utils';

export interface ImageContext {
	image: GeneratedImage;
	iteration: IterationSnapshot | undefined;
	isFirstInGroup: boolean;
	isSelected: boolean;
	flatIndex: number;
}

@Component({
	selector: 'app-gallery-mode',
	templateUrl: './gallery-mode.component.html',
	styleUrls: ['./gallery-mode.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, JudgeFeedbackComponent],
})
export class GalleryModeComponent {
	images = input<GeneratedImage[]>([]);
	iterations = input<IterationSnapshot[]>([]);
	visible = model(false);
	initialImageId = input<string | undefined>(undefined);

	activeIndex = signal(0);

	readonly thumbViewport = viewChild<ElementRef>('thumbViewport');

	private readonly THUMB_ITEM_SIZE = 84; // 80px thumb + 4px gap
	private readonly SCROLL_COUNT = 4;

	readonly sortedImages = computed(() => {
		return [...this.images()].sort((a, b) => {
			if (a.iterationNumber !== b.iterationNumber) {
				return a.iterationNumber - b.iterationNumber;
			}
			return (
				new Date(a.createdAt).getTime() -
				new Date(b.createdAt).getTime()
			);
		});
	});

	readonly imageContexts = computed<ImageContext[]>(() => {
		const sorted = this.sortedImages();
		const iters = this.iterations();
		let lastIterNum = -1;

		return sorted.map((image, index) => {
			const iteration = iters.find(
				(it) => it.iterationNumber === image.iterationNumber,
			);
			const isFirstInGroup = image.iterationNumber !== lastIterNum;
			lastIterNum = image.iterationNumber;

			return {
				image,
				iteration,
				isFirstInGroup,
				isSelected: iteration?.selectedImageId === image.id,
				flatIndex: index,
			};
		});
	});

	readonly currentContext = computed(() => {
		const contexts = this.imageContexts();
		const idx = this.activeIndex();
		return contexts[idx] ?? null;
	});

	readonly currentIteration = computed(() => {
		return this.currentContext()?.iteration ?? null;
	});

	readonly imageCounter = computed(() => {
		const total = this.sortedImages().length;
		const current = this.activeIndex() + 1;
		return `${current} / ${total}`;
	});

	constructor() {
		// Navigate to initial image when it changes
		effect(() => {
			const targetId = this.initialImageId();
			if (targetId) {
				untracked(() => {
					const idx = this.sortedImages().findIndex(
						(img) => img.id === targetId,
					);
					if (idx >= 0) {
						this.setActiveIndex(idx);
					}
				});
			}
		});
	}

	private setActiveIndex(index: number): void {
		this.activeIndex.set(index);
		this.scrollToActiveThumb();
	}

	onActiveIndexChange(index: number): void {
		this.setActiveIndex(index);
	}

	scrollThumbnails(direction: 'prev' | 'next'): void {
		const viewport = this.thumbViewport()?.nativeElement;
		if (!viewport) return;

		const scrollAmount = this.THUMB_ITEM_SIZE * this.SCROLL_COUNT;
		viewport.scrollBy({
			left: direction === 'next' ? scrollAmount : -scrollAmount,
			behavior: 'smooth',
		});
	}

	close(): void {
		this.visible.set(false);
	}

	getScoreSeverity(score: number): 'success' | 'warn' | 'danger' {
		return getScoreSeverity(score);
	}

	@HostListener('document:keydown', ['$event'])
	onKeyDown(event: KeyboardEvent): void {
		if (!this.visible()) return;

		switch (event.key) {
			case 'Escape':
				this.close();
				break;
			case 'ArrowLeft':
				this.navigatePrev();
				event.preventDefault();
				break;
			case 'ArrowRight':
				this.navigateNext();
				event.preventDefault();
				break;
		}
	}

	private navigatePrev(): void {
		const current = this.activeIndex();
		if (current > 0) {
			this.setActiveIndex(current - 1);
		}
	}

	private navigateNext(): void {
		const current = this.activeIndex();
		const total = this.sortedImages().length;
		if (current < total - 1) {
			this.setActiveIndex(current + 1);
		}
	}

	private scrollToActiveThumb(): void {
		setTimeout(() => {
			const viewport = this.thumbViewport()?.nativeElement;
			if (!viewport) return;

			const thumbPos = this.activeIndex() * this.THUMB_ITEM_SIZE;
			const vpWidth = viewport.clientWidth;
			const scrollLeft = viewport.scrollLeft;

			if (
				thumbPos < scrollLeft ||
				thumbPos + this.THUMB_ITEM_SIZE > scrollLeft + vpWidth
			) {
				viewport.scrollTo({
					left: thumbPos - vpWidth / 2 + this.THUMB_ITEM_SIZE / 2,
					behavior: 'smooth',
				});
			}
		});
	}
}
