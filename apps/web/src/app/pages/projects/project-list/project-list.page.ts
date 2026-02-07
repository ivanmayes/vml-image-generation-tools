import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ProjectService } from '../../../shared/services/project.service';
import { Project } from '../../../shared/models/project.model';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';
import { ProjectCreateDialogComponent } from '../components/project-create-dialog/project-create-dialog.component';

@Component({
	selector: 'app-project-list',
	templateUrl: './project-list.page.html',
	styleUrls: ['./project-list.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	providers: [DialogService],
})
export class ProjectListPage implements OnInit, OnDestroy {
	projects = signal<Project[]>([]);
	loading = signal(true);

	readonly skeletonRows = Array(3).fill({});

	private organizationId!: string;
	private destroy$ = new Subject<void>();
	private dialogRef: DynamicDialogRef | null = null;

	constructor(
		private readonly projectService: ProjectService,
		private readonly messageService: MessageService,
		private readonly dialogService: DialogService,
		private readonly router: Router,
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;
		this.loadProjects();
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
		this.dialogRef?.close();
	}

	loadProjects(): void {
		this.loading.set(true);
		this.projectService
			.getProjects(this.organizationId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.projects.set(response.data ?? []);
					this.loading.set(false);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load projects.',
					});
					this.loading.set(false);
				},
			});
	}

	onCreateProject(): void {
		this.dialogRef = this.dialogService.open(ProjectCreateDialogComponent, {
			header: 'New Project',
			width: '480px',
			modal: true,
			data: { organizationId: this.organizationId },
		});

		this.dialogRef?.onClose
			.pipe(takeUntil(this.destroy$))
			.subscribe((project?: Project) => {
				if (project) {
					this.router.navigate(['/projects', project.id]);
				}
			});
	}

	onProjectClick(project: Project): void {
		this.router.navigate(['/projects', project.id]);
	}
}
