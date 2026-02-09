import {
	ChangeDetectionStrategy,
	Component,
	input,
	OnInit,
	signal,
	inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';

import { PrimeNgModule } from '../../primeng.module';
import { AgentService } from '../../services/agent.service';
import { getScoreSeverity } from '../../utils/score.utils';
import { environment } from '../../../../environments/environment';
import type { Agent, EvaluationResult } from '../../models/agent.model';

import { EvaluationResultsComponent } from './evaluation-results.component';
import { ImagePickerDialogComponent } from './image-picker-dialog.component';

interface ImageSourceOption {
	label: string;
	value: 'url' | 'upload' | 'browse';
	icon: string;
}

@Component({
	selector: 'app-image-evaluator',
	templateUrl: './image-evaluator.component.html',
	styleUrls: ['./image-evaluator.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		EvaluationResultsComponent,
		ImagePickerDialogComponent,
	],
})
export class ImageEvaluatorComponent implements OnInit {
	judgeId = input<string>();
	judgeIds = input<string[]>();
	brief = input('');
	showJudgePicker = input(true);
	showImageSourceOptions = input(true);

	readonly organizationId = environment.organizationId;

	// Agent selection
	availableJudges = signal<Agent[]>([]);
	selectedJudgeIds: string[] = [];
	loadingJudges = signal(false);
	loadJudgesError = signal(false);

	// Image source
	imageSourceOptions: ImageSourceOption[] = [
		{ label: 'URL', value: 'url', icon: 'pi pi-link' },
		{ label: 'Upload', value: 'upload', icon: 'pi pi-upload' },
		{ label: 'Browse', value: 'browse', icon: 'pi pi-images' },
	];
	selectedImageSource: 'url' | 'upload' | 'browse' = 'url';

	// Form state
	imageUrl = '';
	uploadedImageUrl = signal<string | null>(null);
	uploading = signal(false);
	imagePickerVisible = false;

	// Evaluation state
	evaluating = signal(false);
	evaluationResults = signal<EvaluationResult[]>([]);
	aggregateScore = signal<number | null>(null);

	private readonly agentService = inject(AgentService);
	private readonly messageService = inject(MessageService);

	ngOnInit(): void {
		// Auto-populate agent selection from inputs
		const judgeIdVal = this.judgeId();
		const judgeIdsVal = this.judgeIds();
		if (judgeIdVal) {
			this.selectedJudgeIds = [judgeIdVal];
		} else if (judgeIdsVal?.length) {
			this.selectedJudgeIds = [...judgeIdsVal];
		}

		// Load available agents for picker
		if (this.showJudgePicker() && !judgeIdVal && !judgeIdsVal?.length) {
			this.loadJudges();
		}
	}

	private loadJudges(): void {
		this.loadingJudges.set(true);
		this.loadJudgesError.set(false);
		this.agentService.getAgents(this.organizationId).subscribe({
			next: (response) => {
				this.availableJudges.set(response.data ?? []);
				this.loadingJudges.set(false);
			},
			error: () => {
				this.loadingJudges.set(false);
				this.loadJudgesError.set(true);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to load agents',
					life: 5000,
				});
			},
		});
	}

	retryLoadJudges(): void {
		this.loadJudges();
	}

	get resolvedImageUrl(): string {
		if (this.selectedImageSource === 'url') {
			return this.imageUrl;
		}
		return this.uploadedImageUrl() ?? '';
	}

	get canRun(): boolean {
		return (
			!!this.resolvedImageUrl &&
			this.selectedJudgeIds.length > 0 &&
			!this.evaluating()
		);
	}

	get showUrlPreview(): boolean {
		try {
			new URL(this.imageUrl);
			return true;
		} catch {
			return false;
		}
	}

	clearImage(): void {
		this.uploadedImageUrl.set(null);
		this.imageUrl = '';
	}

	onUpload(event: { files?: File[] }): void {
		const file = event.files?.[0];
		if (!file) return;

		this.uploading.set(true);
		this.agentService
			.uploadComplianceImage(this.organizationId, file)
			.subscribe({
				next: (response) => {
					this.uploadedImageUrl.set(response.data?.url ?? null);
					this.uploading.set(false);
					this.messageService.add({
						severity: 'success',
						summary: 'Uploaded',
						detail: 'Image uploaded successfully',
						life: 3000,
					});
				},
				error: () => {
					this.uploading.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to upload image',
						life: 3000,
					});
				},
			});
	}

	onImagePicked(url: string): void {
		this.uploadedImageUrl.set(url);
		this.selectedImageSource = 'browse';
	}

	runEvaluation(): void {
		if (!this.canRun) return;

		this.evaluating.set(true);
		this.evaluationResults.set([]);
		this.aggregateScore.set(null);

		this.agentService
			.evaluateImage(this.organizationId, {
				brief: this.brief() || 'Evaluate this image for compliance',
				imageUrls: [this.resolvedImageUrl],
				judgeIds: this.selectedJudgeIds,
			})
			.subscribe({
				next: (response) => {
					const evaluations =
						response.data?.winner?.evaluations ?? [];
					this.evaluationResults.set(evaluations);

					if (evaluations.length > 1) {
						const avg =
							evaluations.reduce(
								(sum: number, e: EvaluationResult) =>
									sum + e.overallScore,
								0,
							) / evaluations.length;
						this.aggregateScore.set(Math.round(avg));
					}

					this.evaluating.set(false);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to run evaluation',
						life: 3000,
					});
					this.evaluating.set(false);
				},
			});
	}

	readonly getScoreSeverity = getScoreSeverity;
}
