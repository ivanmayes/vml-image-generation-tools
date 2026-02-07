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

import { GenerationRequestService } from '../../shared/services/generation-request.service';
import {
	GenerationRequestPublic,
	GenerationRequestStatus,
} from '../../shared/models/generation-request.model';
import { environment } from '../../../environments/environment';
import { PrimeNgModule } from '../../shared/primeng.module';

@Component({
	selector: 'app-generation-list',
	templateUrl: './generation-list.page.html',
	styleUrls: ['./generation-list.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class GenerationListPage implements OnInit, OnDestroy {
	requests = signal<GenerationRequestPublic[]>([]);
	loading = signal(true);
	statusFilter = signal<GenerationRequestStatus | undefined>(undefined);

	readonly statuses = Object.values(GenerationRequestStatus);
	readonly skeletonCards = Array(6).fill({});

	private organizationId!: string;
	private projectId?: string;
	private destroy$ = new Subject<void>();

	constructor(
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

		this.loadRequests();
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	loadRequests(): void {
		this.loading.set(true);
		this.requestService
			.getRequests(this.organizationId, {
				status: this.statusFilter(),
				projectId: this.projectId,
				limit: 50,
			})
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.requests.set(response.data ?? []);
					this.loading.set(false);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load generation requests.',
					});
					this.loading.set(false);
				},
			});
	}

	onStatusFilterChange(status: unknown): void {
		this.statusFilter.set(status as GenerationRequestStatus | undefined);
		this.loadRequests();
	}

	onCreateNew(): void {
		this.router.navigate(['new'], { relativeTo: this.route });
	}

	onCardClick(request: GenerationRequestPublic): void {
		if (request?.id) {
			this.router.navigate([request.id], { relativeTo: this.route });
		}
	}

	// --- Status icon helpers ---

	getStatusIcon(status: GenerationRequestStatus): string {
		switch (status) {
			case GenerationRequestStatus.PENDING:
				return 'pi pi-clock';
			case GenerationRequestStatus.OPTIMIZING:
				return 'pi pi-cog pi-spin';
			case GenerationRequestStatus.GENERATING:
				return 'pi pi-image pi-spin';
			case GenerationRequestStatus.EVALUATING:
				return 'pi pi-eye';
			case GenerationRequestStatus.COMPLETED:
				return 'pi pi-check-circle';
			case GenerationRequestStatus.FAILED:
				return 'pi pi-times-circle';
			case GenerationRequestStatus.CANCELLED:
				return 'pi pi-ban';
			default:
				return 'pi pi-question-circle';
		}
	}

	getStatusColor(status: GenerationRequestStatus): string {
		switch (status) {
			case GenerationRequestStatus.PENDING:
				return 'var(--p-yellow-500)';
			case GenerationRequestStatus.OPTIMIZING:
			case GenerationRequestStatus.GENERATING:
			case GenerationRequestStatus.EVALUATING:
				return 'var(--p-blue-500)';
			case GenerationRequestStatus.COMPLETED:
				return 'var(--p-green-500)';
			case GenerationRequestStatus.FAILED:
				return 'var(--p-red-500)';
			case GenerationRequestStatus.CANCELLED:
				return 'var(--p-surface-400)';
			default:
				return 'var(--p-surface-400)';
		}
	}

	getStatusLabel(status: GenerationRequestStatus): string {
		return `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
	}

	isActiveStatus(status: GenerationRequestStatus): boolean {
		return [
			GenerationRequestStatus.OPTIMIZING,
			GenerationRequestStatus.GENERATING,
		].includes(status);
	}

	// --- Metadata helpers ---

	getRelativeTime(dateStr: string): string {
		const now = Date.now();
		const then = new Date(dateStr).getTime();
		const diffMs = now - then;
		const diffMin = Math.floor(diffMs / 60000);

		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;

		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;

		const diffDays = Math.floor(diffHr / 24);
		if (diffDays < 30) return `${diffDays}d ago`;

		const diffMonths = Math.floor(diffDays / 30);
		return `${diffMonths}mo ago`;
	}

	formatScore(request: GenerationRequestPublic): string {
		if (request.bestScore != null && request.bestScore > 0) {
			return `${Math.round(request.bestScore)}%`;
		}
		return '\u2014';
	}

	getScoreTooltip(request: GenerationRequestPublic): string {
		const score =
			request.bestScore != null && request.bestScore > 0
				? `${Math.round(request.bestScore)}%`
				: 'N/A';
		return `Best score: ${score} (target: ${request.threshold}%)`;
	}

	getIterationTooltip(request: GenerationRequestPublic): string {
		return `Iteration ${request.currentIteration} of ${request.maxIterations}`;
	}
}
