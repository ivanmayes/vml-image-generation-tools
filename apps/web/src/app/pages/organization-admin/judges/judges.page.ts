import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AgentService } from '../../../shared/services/agent.service';
import { Agent } from '../../../shared/models/agent.model';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';

@Component({
	selector: 'app-judges',
	templateUrl: './judges.page.html',
	styleUrls: ['./judges.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, ConfirmDialogModule],
	providers: [ConfirmationService],
})
export class JudgesPage implements OnInit, OnDestroy {
	// Signals for zoneless
	agents = signal<Agent[]>([]);
	loading = signal(false);

	organizationId!: string;
	currentSortField = 'createdAt';
	currentSortOrder = 'desc';
	currentSearchQuery = '';
	private searchSubject = new Subject<string>();
	private searchSubscription: Subscription;
	readonly skeletonRows = Array(5).fill({});

	constructor(
		private readonly agentService: AgentService,
		private readonly messageService: MessageService,
		private readonly confirmationService: ConfirmationService,
		private readonly router: Router,
	) {
		// Debounce search input by 400ms
		this.searchSubscription = this.searchSubject
			.pipe(debounceTime(400), distinctUntilChanged())
			.subscribe((query) => {
				this.currentSearchQuery = query;
				this.loadAgents(query);
			});
	}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;

		if (this.organizationId) {
			this.loadAgents();
		}
	}

	loadAgents(
		searchQuery?: string,
		sortField?: string,
		sortOrder?: string,
	): void {
		this.loading.set(true);

		// Use provided values or fall back to current state
		const query =
			searchQuery !== undefined ? searchQuery : this.currentSearchQuery;
		const field = sortField || this.currentSortField;
		const order = sortOrder || this.currentSortOrder;

		this.agentService
			.getAgents(this.organizationId, query, field, order)
			.subscribe({
				next: (response) => {
					this.agents.set(response.data || []);
					this.loading.set(false);
				},
				error: (error) => {
					console.error('Error loading agents:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load agents',
						life: 3000,
					});
					this.loading.set(false);
				},
			});
	}

	onSearch(event: Event): void {
		const query = (event.target as HTMLInputElement).value;
		this.searchSubject.next(query);
	}

	ngOnDestroy(): void {
		this.searchSubscription.unsubscribe();
		this.searchSubject.complete();
	}

	onSort(event: { field: string; order: number }): void {
		this.currentSortField = event.field;
		this.currentSortOrder = event.order === 1 ? 'asc' : 'desc';
		this.loadAgents(
			this.currentSearchQuery,
			this.currentSortField,
			this.currentSortOrder,
		);
	}

	navigateToCreate(): void {
		this.router.navigate(['/organization/admin/judges/new']);
	}

	navigateToDetail(agentId: string): void {
		this.router.navigate(['/organization/admin/judges', agentId]);
	}

	deleteAgent(agent: Agent): void {
		this.confirmationService.confirm({
			message: `Are you sure you want to delete the agent "${agent.name}"? This action cannot be undone.`,
			header: 'Confirm Delete',
			icon: 'pi pi-exclamation-triangle',
			accept: () => {
				this.agentService
					.deleteAgent(this.organizationId, agent.id)
					.subscribe({
						next: () => {
							this.loadAgents();
							this.messageService.add({
								severity: 'success',
								summary: 'Success',
								detail: 'Agent deleted successfully',
								life: 3000,
							});
						},
						error: (error) => {
							console.error('Error deleting agent:', error);
							this.messageService.add({
								severity: 'error',
								summary: 'Error',
								detail: 'Failed to delete agent',
								life: 3000,
							});
						},
					});
			},
		});
	}

	formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}
}
