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
	agents = signal<Agent[]>([]);
	loading = signal(false);

	organizationId!: string;
	currentSearchQuery = '';
	private searchSubject = new Subject<string>();
	private searchSubscription: Subscription;
	readonly skeletonCards = Array(6).fill({});

	constructor(
		private readonly agentService: AgentService,
		private readonly messageService: MessageService,
		private readonly confirmationService: ConfirmationService,
		private readonly router: Router,
	) {
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

	loadAgents(searchQuery?: string): void {
		this.loading.set(true);

		const query =
			searchQuery !== undefined ? searchQuery : this.currentSearchQuery;

		this.agentService
			.getAgents(this.organizationId, query, 'createdAt', 'desc')
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

	navigateToCreate(): void {
		this.router.navigate(['/organization/admin/judges/new']);
	}

	navigateToDetail(agentId: string): void {
		this.router.navigate(['/organization/admin/judges', agentId]);
	}

	deleteAgent(event: Event, agent: Agent): void {
		event.stopPropagation();
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

	getInitials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');
	}

	getAvatarGradient(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = Math.abs(hash) % 360;
		return `linear-gradient(135deg, hsl(${hue}, 65%, 55%) 0%, hsl(${(hue + 40) % 360}, 60%, 45%) 100%)`;
	}

	getRelativeTime(dateStr: string | Date): string {
		const now = Date.now();
		const then = new Date(dateStr).getTime();
		const diff = now - then;

		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;

		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;

		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;

		const months = Math.floor(days / 30);
		if (months < 12) return `${months}mo ago`;

		return `${Math.floor(months / 12)}y ago`;
	}

	getAgentTypeLabel(type?: string): string {
		if (!type) return '';
		return type === 'EXPERT' ? 'Expert' : 'Audience';
	}
}
