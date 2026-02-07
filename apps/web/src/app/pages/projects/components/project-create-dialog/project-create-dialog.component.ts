import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import { ProjectService } from '../../../../shared/services/project.service';

@Component({
	selector: 'app-project-create-dialog',
	templateUrl: './project-create-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class ProjectCreateDialogComponent {
	name = '';
	description = '';
	submitting = signal(false);
	errorMessage = signal<string | null>(null);

	private organizationId: string;

	constructor(
		private readonly ref: DynamicDialogRef,
		private readonly config: DynamicDialogConfig,
		private readonly projectService: ProjectService,
	) {
		this.organizationId = this.config.data.organizationId;
	}

	onSubmit(): void {
		if (!this.name.trim()) return;

		this.submitting.set(true);
		this.errorMessage.set(null);
		this.projectService
			.createProject(this.organizationId, {
				name: this.name.trim(),
				description: this.description.trim() || undefined,
			})
			.subscribe({
				next: (response) => {
					this.submitting.set(false);
					this.ref.close(response.data);
				},
				error: (err) => {
					this.submitting.set(false);
					this.errorMessage.set(
						err?.error?.message || 'Failed to create project.',
					);
				},
			});
	}

	onCancel(): void {
		this.ref.close();
	}
}
