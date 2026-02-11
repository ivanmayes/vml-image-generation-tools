import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	input,
	output,
	signal,
	OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';

import { PrimeNgModule } from '../../../../../shared/primeng.module';
import { MarkdownPipe } from '../../../../../shared/pipes/markdown.pipe';
import { AgentService } from '../../../../../shared/services/agent.service';
import type { Agent } from '../../../../../shared/models/agent.model';
import type {
	JudgeAnalyticsResponse,
	QualitativeAnalysisResponse,
	PromptOptimizationResponse,
} from '../../../../../shared/models/judge-analytics.model';
import { environment } from '../../../../../../environments/environment';

@Component({
	selector: 'app-judge-analytics',
	templateUrl: './judge-analytics.component.html',
	styleUrls: ['./judge-analytics.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [CommonModule, FormsModule, PrimeNgModule, MarkdownPipe],
})
export class JudgeAnalyticsComponent implements OnInit {
	agent = input.required<Agent>();
	promptApplied = output<string>();

	analyticsData = signal<JudgeAnalyticsResponse | null>(null);
	qualitativeAnalysis = signal<QualitativeAnalysisResponse | null>(null);
	optimizationResult = signal<PromptOptimizationResponse | null>(null);

	limit = signal<number>(50);
	analyticsLoading = signal(false);
	analysisLoading = signal(false);
	optimizeLoading = signal(false);
	analyticsError = signal<string | null>(null);
	analysisError = signal<string | null>(null);

	private readonly destroyRef = inject(DestroyRef);
	private readonly organizationId = environment.organizationId;

	readonly limitOptions = [
		{ label: '25', value: 25 },
		{ label: '50', value: 50 },
		{ label: '100', value: 100 },
	];

	constructor(
		private readonly agentService: AgentService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.loadData();
	}

	loadData(): void {
		if (this.analyticsLoading() || this.analysisLoading()) return;

		this.analyticsLoading.set(true);
		this.analysisLoading.set(true);
		this.analyticsError.set(null);
		this.analysisError.set(null);

		const agentId = this.agent().id;
		const limit = this.limit();

		// Fire both endpoints independently so a rate-limit on
		// the POST /analyze endpoint doesn't wipe out the GET analytics.
		this.agentService
			.getJudgeAnalytics(this.organizationId, agentId, limit)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (response) => {
					this.analyticsData.set(response.data ?? null);
					this.analyticsLoading.set(false);
				},
				error: (error) => {
					console.error('Analytics load error:', error);
					this.analyticsError.set('Failed to load analytics.');
					this.analyticsLoading.set(false);
				},
			});

		this.agentService
			.analyzeJudge(this.organizationId, agentId, limit)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (response) => {
					this.qualitativeAnalysis.set(response.data ?? null);
					this.analysisLoading.set(false);
				},
				error: (error) => {
					console.error('Analysis load error:', error);
					this.analysisError.set('Failed to load analysis.');
					this.analysisLoading.set(false);
				},
			});
	}

	onLimitChange(newLimit: number): void {
		this.limit.set(newLimit);
		this.loadData();
	}

	optimizePrompt(): void {
		if (this.optimizeLoading()) return;

		this.optimizeLoading.set(true);
		this.optimizationResult.set(null);

		this.agentService
			.optimizeJudgePrompt(
				this.organizationId,
				this.agent().id,
				this.limit(),
			)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (response) => {
					this.optimizationResult.set(response.data ?? null);
					this.optimizeLoading.set(false);
				},
				error: (error) => {
					console.error('Optimize error:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail:
							error?.error?.message ??
							'Failed to optimize prompt. Please try again.',
						life: 5000,
					});
					this.optimizeLoading.set(false);
				},
			});
	}

	applyOptimizedPrompt(): void {
		const result = this.optimizationResult();
		if (!result) return;

		this.agentService
			.updateAgent(this.organizationId, this.agent().id, {
				judgePrompt: result.suggestedPrompt,
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Prompt Updated',
						detail: 'Judge prompt has been optimized and saved.',
						life: 3000,
					});
					this.promptApplied.emit(result.suggestedPrompt);
					this.optimizationResult.set(null);
				},
				error: (error) => {
					console.error('Apply error:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to save optimized prompt.',
						life: 3000,
					});
				},
			});
	}

	discardOptimization(): void {
		this.optimizationResult.set(null);
	}

	getSeverityClass(
		severity: string,
	): 'danger' | 'warn' | 'info' | 'secondary' {
		switch (severity) {
			case 'critical':
				return 'danger';
			case 'major':
				return 'warn';
			case 'moderate':
				return 'info';
			default:
				return 'secondary';
		}
	}

	getFlagSeverity(flag: string | null): 'danger' | 'warn' | 'secondary' {
		if (flag === 'never_passes') return 'danger';
		if (flag === 'always_passes') return 'warn';
		return 'secondary';
	}

	getFlagLabel(flag: string | null): string {
		if (flag === 'never_passes') return 'Never Passes';
		if (flag === 'always_passes') return 'Always Passes';
		return '';
	}

	formatDate(isoString: string): string {
		if (!isoString) return '';
		return new Date(isoString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}
}
