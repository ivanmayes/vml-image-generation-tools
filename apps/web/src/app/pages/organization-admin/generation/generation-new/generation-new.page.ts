import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { AgentService } from '../../../../shared/services/agent.service';
import { GenerationRequestService } from '../../../../shared/services/generation-request.service';
import { Agent } from '../../../../shared/models/agent.model';
import { CreateGenerationRequestDto } from '../../../../shared/models/generation-request.model';
import { environment } from '../../../../../environments/environment';
import { PrimeNgModule } from '../../../../shared/primeng.module';

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

	brief = '';
	initialPrompt = '';
	selectedJudgeIds: string[] = [];
	maxIterations = 10;
	threshold = 75;

	private organizationId!: string;
	private destroy$ = new Subject<void>();

	constructor(
		private readonly agentService: AgentService,
		private readonly requestService: GenerationRequestService,
		private readonly messageService: MessageService,
		private readonly router: Router,
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;
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
				next: (response: { data?: Agent[] }) => {
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

		const dto: CreateGenerationRequestDto = {
			brief: this.brief.trim(),
			judgeIds: this.selectedJudgeIds,
			maxIterations: this.maxIterations,
			threshold: this.threshold,
		};

		if (this.initialPrompt.trim()) {
			dto.initialPrompt = this.initialPrompt.trim();
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
						this.router.navigate([
							'/organization/admin/generation',
							response.data.id,
						]);
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

	onBack(): void {
		this.router.navigate(['/organization/admin/generation']);
	}
}
