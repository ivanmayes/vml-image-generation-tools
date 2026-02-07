import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { RequestCreateDto } from '@api/image-generation/generation-request/dtos';

import { AgentService } from '../../../shared/services/agent.service';
import { GenerationRequestService } from '../../../shared/services/generation-request.service';
import { Agent } from '../../../shared/models/agent.model';
import { GenerationMode } from '../../../shared/models/generation-request.model';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';

@Component({
	selector: 'app-generation-new',
	templateUrl: './generation-new.page.html',
	styleUrls: ['./generation-new.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class GenerationNewPage implements OnInit, OnDestroy {
	agents = signal<Agent[]>([]);
	loadingAgents = signal(true);
	submitting = signal(false);
	uploadingReference = signal(false);

	brief = '';
	initialPrompt = '';
	selectedJudgeIds: string[] = [];
	maxIterations = 10;
	threshold = 75;

	// Generation mode
	generationMode: GenerationMode = 'regeneration';
	generationModeOptions = [
		{ label: 'Regenerate', value: 'regeneration' as GenerationMode },
		{ label: 'Edit', value: 'edit' as GenerationMode },
		{ label: 'Mixed', value: 'mixed' as GenerationMode },
	];

	// Image settings
	imagesPerGeneration = 3;
	imagesPerGenerationOptions = [
		{ label: '1', value: 1 },
		{ label: '2', value: 2 },
		{ label: '3', value: 3 },
		{ label: '4', value: 4 },
	];
	aspectRatio = '1:1';
	aspectRatioOptions = [
		{ label: '1:1', value: '1:1' },
		{ label: '4:3', value: '4:3' },
		{ label: '3:4', value: '3:4' },
		{ label: '16:9', value: '16:9' },
		{ label: '9:16', value: '9:16' },
	];
	referenceImageUrls: string[] = [];

	private organizationId!: string;
	private projectId?: string;
	private destroy$ = new Subject<void>();

	constructor(
		private readonly agentService: AgentService,
		private readonly requestService: GenerationRequestService,
		private readonly messageService: MessageService,
		private readonly router: Router,
		private readonly route: ActivatedRoute,
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;

		// Walk ActivatedRoute parents for projectId
		let r: ActivatedRoute | null = this.route;
		while (r) {
			const pid = r.snapshot.paramMap.get('projectId');
			if (pid) {
				this.projectId = pid;
				break;
			}
			r = r.parent;
		}

		this.loadAgents();
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	loadAgents(): void {
		this.loadingAgents.set(true);
		this.agentService
			.getAgents(this.organizationId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.agents.set(response.data ?? []);
					this.loadingAgents.set(false);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load judges.',
					});
					this.loadingAgents.set(false);
				},
			});
	}

	onSubmit(): void {
		if (!this.brief.trim() || this.selectedJudgeIds.length === 0) {
			this.messageService.add({
				severity: 'warn',
				summary: 'Validation',
				detail: 'Brief and at least one judge are required.',
			});
			return;
		}

		this.submitting.set(true);

		const dto: RequestCreateDto = {
			brief: this.brief.trim(),
			judgeIds: this.selectedJudgeIds,
			maxIterations: this.maxIterations,
			threshold: this.threshold,
			generationMode: this
				.generationMode as RequestCreateDto['generationMode'],
			imageParams: {
				imagesPerGeneration: this.imagesPerGeneration,
				aspectRatio: this.aspectRatio,
			},
		};

		if (this.referenceImageUrls.length > 0) {
			dto.referenceImageUrls = [...this.referenceImageUrls];
		}

		if (this.initialPrompt.trim()) {
			dto.initialPrompt = this.initialPrompt.trim();
		}

		if (this.projectId) {
			dto.projectId = this.projectId;
		}

		this.requestService
			.createRequest(this.organizationId, dto)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.messageService.add({
						severity: 'success',
						summary: 'Created',
						detail: 'Generation request created and queued.',
					});
					this.submitting.set(false);
					if (response.data?.id) {
						this.router.navigate(['../', response.data.id], {
							relativeTo: this.route,
						});
					}
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to create generation request.',
					});
					this.submitting.set(false);
				},
			});
	}

	onReferenceUpload(event: { files: File[] }): void {
		const file = event.files?.[0];
		if (!file) return;

		this.uploadingReference.set(true);
		this.agentService
			.uploadComplianceImage(this.organizationId, file)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					const url = response?.data?.url;
					if (url) {
						this.referenceImageUrls = [
							...this.referenceImageUrls,
							url,
						];
					}
					this.uploadingReference.set(false);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Upload Failed',
						detail: 'Failed to upload reference image.',
					});
					this.uploadingReference.set(false);
				},
			});
	}

	removeReferenceImage(index: number): void {
		this.referenceImageUrls = this.referenceImageUrls.filter(
			(_, i) => i !== index,
		);
	}

	/** Enforce iteration limits when mode changes */
	onModeChange(): void {
		const maxAllowed = this.getMaxIterationsForMode();
		if (this.maxIterations > maxAllowed) {
			this.maxIterations = maxAllowed;
		}
	}

	getMaxIterationsForMode(): number {
		switch (this.generationMode) {
			case 'edit':
				return 5;
			case 'mixed':
				return 20;
			default:
				return 50;
		}
	}

	getModeDescription(): string {
		switch (this.generationMode) {
			case 'edit':
				return 'Each iteration edits the previous best image with targeted fixes. Best for refining an existing result. Limited to 5 iterations to avoid quality degradation.';
			case 'mixed':
				return 'Automatically switches between regeneration and editing based on judge feedback. Regenerates when major issues are found, edits for moderate fixes.';
			default:
				return 'Each iteration generates a new image from an optimized prompt. Best for initial exploration.';
		}
	}

	onBack(): void {
		this.router.navigate(['../'], { relativeTo: this.route });
	}
}
