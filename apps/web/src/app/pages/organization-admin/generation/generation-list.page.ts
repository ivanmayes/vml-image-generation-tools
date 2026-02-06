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

import { GenerationRequestService } from '../../../shared/services/generation-request.service';
import {
	GenerationRequestPublic,
	GenerationRequestStatus,
} from '../../../shared/models/generation-request.model';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';

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
	readonly skeletonRows = Array(5).fill({});

	private organizationId!: string;
	private destroy$ = new Subject<void>();

	constructor(
		private readonly requestService: GenerationRequestService,
		private readonly messageService: MessageService,
		private readonly router: Router,
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;
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
		this.router.navigate(['/organization/admin/generation/new']);
	}

	onRowSelect(event: { data?: unknown }): void {
		const request = event.data as GenerationRequestPublic;
		if (request?.id) {
			this.router.navigate([
				'/organization/admin/generation',
				request.id,
			]);
		}
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
}
