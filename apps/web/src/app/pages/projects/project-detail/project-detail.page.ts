import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ProjectService } from '../../../shared/services/project.service';
import { Project } from '../../../shared/models/project.model';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';
import { ToolboxGridComponent } from '../../../shared/components/toolbox-grid/toolbox-grid.component';

@Component({
	selector: 'app-project-detail',
	templateUrl: './project-detail.page.html',
	styleUrls: ['./project-detail.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, ToolboxGridComponent],
})
export class ProjectDetailPage implements OnInit, OnDestroy {
	project = signal<Project | null>(null);
	loading = signal(true);
	projectId!: string;

	private organizationId!: string;
	private destroy$ = new Subject<void>();

	constructor(
		private readonly route: ActivatedRoute,
		private readonly router: Router,
		private readonly projectService: ProjectService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;
		this.projectId = this.route.snapshot.paramMap.get('projectId')!;
		this.loadProject();
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	loadProject(): void {
		this.loading.set(true);
		this.projectService
			.getProject(this.organizationId, this.projectId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.project.set(response.data ?? null);
					this.loading.set(false);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load project.',
					});
					this.loading.set(false);
				},
			});
	}

	onBack(): void {
		this.router.navigate(['/projects']);
	}

	get baseRoute(): string {
		return `/projects/${this.projectId}`;
	}
}
