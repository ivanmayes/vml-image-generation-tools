import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../shared/primeng.module';
import { DropFileDirective } from '../../../shared/directives/drop-file.directive';
import type { ComplianceImage } from '../../../shared/models/compliance-image.model';

import { ImageCardComponent } from './image-card.component';

@Component({
	selector: 'app-image-grid',
	templateUrl: './image-grid.component.html',
	styleUrls: ['./image-grid.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		PrimeNgModule,
		DropFileDirective,
		ImageCardComponent,
	],
})
export class ImageGridComponent {
	images = input<ComplianceImage[]>([]);
	readonly hasImages = computed(() => this.images().length > 0);

	filesDropped = output<FileList>();
	urlClicked = output<void>();
	browseClicked = output<void>();
	removeImage = output<string>();
	selectImage = output<string>();
	retryImage = output<string>();

	onFilesDropped(files: FileList): void {
		this.filesDropped.emit(files);
	}

	onFileInput(event: Event): void {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			this.filesDropped.emit(input.files);
			input.value = '';
		}
	}
}
