import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
	computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { GenerationRequestService } from '../../../../shared/services/generation-request.service';
import { GenerationEventsService } from '../../../../shared/services/generation-events.service';
import {
	GenerationRequestDetailed,
	GenerationRequestStatus,
	GenerationEvent,
	GenerationEventType,
	IterationSnapshot,
} from '../../../../shared/models/generation-request.model';
import { environment } from '../../../../../environments/environment';
import { PrimeNgModule } from '../../../../shared/primeng.module';

@Component({
	selector: 'app-generation-detail',
	templateUrl: './generation-detail.page.html',
	styleUrls: ['./generation-detail.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class GenerationDetailPage implements OnInit, OnDestroy {
	request = signal<GenerationRequestDetailed | null>(null);
	loading = signal(true);
	events = signal<GenerationEvent[]>([]);

	readonly isActive = computed(() => {
		const status = this.request()?.status;
		return (
			status === GenerationRequestStatus.OPTIMIZING ||
			status === GenerationRequestStatus.GENERATING ||
			status === GenerationRequestStatus.EVALUATING
		);
	});

	readonly iterations = computed<IterationSnapshot[]>(() => {
		return this.request()?.iterations ?? [];
	});

	readonly latestScore = computed(() => {
		const iters = this.iterations();
		if (iters.length === 0) return null;
		return iters[iters.length - 1].aggregateScore;
	});

	private organizationId!: string;
	private requestId!: string;
	private destroy$ = new Subject<void>();

	constructor(
		private readonly route: ActivatedRoute,
		private readonly router: Router,
		private readonly requestService: GenerationRequestService,
		private readonly eventsService: GenerationEventsService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;
		this.requestId = this.route.snapshot.paramMap.get('id')!;
		this.loadRequest();
	}

	ngOnDestroy(): void {
		this.eventsService.disconnect(this.requestId);
		this.destroy$.next();
		this.destroy$.complete();
	}

	loadRequest(): void {
		this.loading.set(true);
		this.requestService
			.getRequest(this.organizationId, this.requestId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.request.set(response.data ?? null);
					this.loading.set(false);

					if (this.isActive()) {
						this.connectToStream();
					}
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load generation request.',
					});
					this.loading.set(false);
				},
			});
	}

	onBack(): void {
		this.router.navigate(['/organization/admin/generation']);
	}

	getStatusSeverity(
		status: GenerationRequestStatus,
	): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
		switch (status) {
			case GenerationRequestStatus.COMPLETED:
				return 'success';
			case GenerationRequestStatus.OPTIMIZING:
			case GenerationRequestStatus.GENERATING:
			case GenerationRequestStatus.EVALUATING:
				return 'info';
			case GenerationRequestStatus.PENDING:
				return 'warn';
			case GenerationRequestStatus.FAILED:
				return 'danger';
			case GenerationRequestStatus.CANCELLED:
				return 'secondary';
			default:
				return 'info';
		}
	}

	private connectToStream(): void {
		const token = ''; // TODO: inject auth token
		this.eventsService
			.connect(this.organizationId, this.requestId, token)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (event) => {
					this.events.update((prev) => [...prev, event]);
					this.handleEvent(event);
				},
				error: () => {
					this.messageService.add({
						severity: 'warn',
						summary: 'Connection Lost',
						detail: 'Live updates disconnected. Refresh to reconnect.',
					});
				},
			});
	}

	private handleEvent(event: GenerationEvent): void {
		switch (event.type) {
			case GenerationEventType.STATUS_CHANGE:
				this.request.update((req) => {
					if (!req) return req;
					return {
						...req,
						status: event.data['status'] as GenerationRequestStatus,
					};
				});
				break;

			case GenerationEventType.ITERATION_COMPLETE:
				this.request.update((req) => {
					if (!req) return req;
					const iteration = event.data[
						'iteration'
					] as IterationSnapshot;
					return {
						...req,
						iterations: [...(req.iterations ?? []), iteration],
						currentIteration:
							(event.data['iterationNumber'] as number) ??
							req.currentIteration,
					};
				});
				break;

			case GenerationEventType.COMPLETED:
			case GenerationEventType.FAILED:
				this.loadRequest();
				break;
		}
	}
}
