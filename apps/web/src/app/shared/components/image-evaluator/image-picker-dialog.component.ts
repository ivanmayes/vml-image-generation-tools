import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	OnChanges,
	SimpleChanges,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../primeng.module';
import { GenerationRequestService } from '../../services/generation-request.service';
import type { GeneratedImage } from '../../models/generation-request.model';

@Component({
	selector: 'app-image-picker-dialog',
	templateUrl: './image-picker-dialog.component.html',
	styleUrls: ['./image-picker-dialog.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class ImagePickerDialogComponent implements OnChanges {
	@Input() visible = false;
	@Input({ required: true }) orgId!: string;
	@Output() visibleChange = new EventEmitter<boolean>();
	@Output() imageSelected = new EventEmitter<string>();

	images = signal<GeneratedImage[]>([]);
	loading = signal(false);
	selectedImage = signal<GeneratedImage | null>(null);

	constructor(
		private readonly generationRequestService: GenerationRequestService,
	) {}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['visible'] && this.visible && this.orgId) {
			this.loadImages();
		}
	}

	loadImages(): void {
		this.loading.set(true);
		this.generationRequestService
			.getOrganizationImages(this.orgId, 50)
			.subscribe({
				next: (response) => {
					this.images.set(response.data ?? []);
					this.loading.set(false);
				},
				error: () => {
					this.loading.set(false);
				},
			});
	}

	selectImage(image: GeneratedImage): void {
		this.selectedImage.set(image);
	}

	confirmSelection(): void {
		const image = this.selectedImage();
		if (image) {
			this.imageSelected.emit(image.s3Url);
			this.close();
		}
	}

	close(): void {
		this.selectedImage.set(null);
		this.visible = false;
		this.visibleChange.emit(false);
	}

	truncatePrompt(prompt?: string, maxLen = 60): string {
		if (!prompt) return '';
		return prompt.length > maxLen
			? prompt.substring(0, maxLen) + '...'
			: prompt;
	}

	formatDate(dateString: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
		});
	}
}
