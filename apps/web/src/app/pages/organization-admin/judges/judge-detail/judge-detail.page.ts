import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
	ReactiveFormsModule,
	FormGroup,
	FormControl,
	Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { AgentService } from '../../../../shared/services/agent.service';
import {
	Agent,
	AgentDocument,
	EvaluationResult,
} from '../../../../shared/models/agent.model';
import { environment } from '../../../../../environments/environment';
import { PrimeNgModule } from '../../../../shared/primeng.module';

@Component({
	selector: 'app-judge-detail',
	templateUrl: './judge-detail.page.html',
	styleUrls: ['./judge-detail.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		ReactiveFormsModule,
		ConfirmDialogModule,
	],
})
export class JudgeDetailPage implements OnInit {
	loading = signal(false);
	saving = signal(false);
	agent = signal<Agent | null>(null);
	isCreateMode = signal(false);
	documents = signal<AgentDocument[]>([]);
	loadingDocuments = signal(false);
	uploadingDocument = signal(false);
	evaluating = signal(false);
	evaluationResult = signal<EvaluationResult | null>(null);

	testBrief = '';
	testImageUrl = '';

	form = new FormGroup({
		name: new FormControl('', {
			nonNullable: true,
			validators: [Validators.required],
		}),
		systemPrompt: new FormControl('', {
			nonNullable: true,
			validators: [Validators.required],
		}),
		evaluationCategories: new FormControl('', { nonNullable: true }),
		templateId: new FormControl('', { nonNullable: true }),
		optimizationWeight: new FormControl(50, { nonNullable: true }),
		scoringWeight: new FormControl(50, { nonNullable: true }),
		ragTopK: new FormControl(5, { nonNullable: true }),
		ragSimilarityThreshold: new FormControl(0.7, { nonNullable: true }),
	});

	private organizationId = environment.organizationId;
	private agentId: string | null = null;

	constructor(
		private readonly agentService: AgentService,
		private readonly messageService: MessageService,
		private readonly router: Router,
		private readonly route: ActivatedRoute,
	) {}

	ngOnInit(): void {
		const idParam = this.route.snapshot.paramMap.get('id');

		if (!idParam || idParam === 'new') {
			this.isCreateMode.set(true);
		} else {
			this.agentId = idParam;
			this.loadAgent(idParam);
		}
	}

	private loadAgent(agentId: string): void {
		this.loading.set(true);

		this.agentService.getAgent(this.organizationId, agentId).subscribe({
			next: (response) => {
				const agentData: Agent = response.data;
				this.agent.set(agentData);
				this.form.patchValue({
					name: agentData.name || '',
					systemPrompt: agentData.systemPrompt || '',
					evaluationCategories: agentData.evaluationCategories || '',
					templateId: agentData.templateId || '',
					optimizationWeight: agentData.optimizationWeight ?? 50,
					scoringWeight: agentData.scoringWeight ?? 50,
					ragTopK: agentData.ragConfig?.topK ?? 5,
					ragSimilarityThreshold:
						agentData.ragConfig?.similarityThreshold ?? 0.7,
				});
				this.loading.set(false);
				this.loadDocuments(agentData.id);
			},
			error: (error) => {
				console.error('Error loading agent:', error);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to load judge',
					life: 3000,
				});
				this.loading.set(false);
			},
		});
	}

	save(): void {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		this.saving.set(true);
		const formValue = this.form.getRawValue();

		const dto = {
			name: formValue.name,
			systemPrompt: formValue.systemPrompt,
			evaluationCategories: formValue.evaluationCategories || undefined,
			templateId: formValue.templateId || undefined,
			optimizationWeight: formValue.optimizationWeight,
			scoringWeight: formValue.scoringWeight,
			ragConfig: {
				topK: formValue.ragTopK,
				similarityThreshold: formValue.ragSimilarityThreshold,
			},
		};

		if (this.isCreateMode()) {
			this.agentService.createAgent(this.organizationId, dto).subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Judge created successfully',
						life: 3000,
					});
					this.saving.set(false);
					this.router.navigate(['/organization/admin/judges']);
				},
				error: (error) => {
					console.error('Error creating agent:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to create judge',
						life: 3000,
					});
					this.saving.set(false);
				},
			});
		} else {
			this.agentService
				.updateAgent(this.organizationId, this.agentId!, dto)
				.subscribe({
					next: () => {
						this.messageService.add({
							severity: 'success',
							summary: 'Success',
							detail: 'Judge updated successfully',
							life: 3000,
						});
						this.saving.set(false);
						this.router.navigate(['/organization/admin/judges']);
					},
					error: (error) => {
						console.error('Error updating agent:', error);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: 'Failed to update judge',
							life: 3000,
						});
						this.saving.set(false);
					},
				});
		}
	}

	cancel(): void {
		this.router.navigate(['/organization/admin/judges']);
	}

	goBack(): void {
		this.router.navigate(['/organization/admin/judges']);
	}

	loadDocuments(agentId: string): void {
		this.loadingDocuments.set(true);

		this.agentService.getDocuments(this.organizationId, agentId).subscribe({
			next: (response) => {
				this.documents.set(response.data);
				this.loadingDocuments.set(false);
			},
			error: (error) => {
				console.error('Error loading documents:', error);
				this.loadingDocuments.set(false);
			},
		});
	}

	onUploadDocument(event: any): void {
		const file = event.files[0];
		if (!file || !this.agentId) return;

		this.uploadingDocument.set(true);

		this.agentService
			.uploadDocument(this.organizationId, this.agentId, file)
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Document uploaded successfully',
						life: 3000,
					});
					this.uploadingDocument.set(false);
					this.loadDocuments(this.agentId!);
				},
				error: (error) => {
					console.error('Error uploading document:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to upload document',
						life: 3000,
					});
					this.uploadingDocument.set(false);
				},
			});
	}

	deleteDocument(doc: AgentDocument): void {
		if (!this.agentId) return;

		this.agentService
			.deleteDocument(this.organizationId, this.agentId, doc.id)
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Document deleted successfully',
						life: 3000,
					});
					this.loadDocuments(this.agentId!);
				},
				error: (error) => {
					console.error('Error deleting document:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to delete document',
						life: 3000,
					});
				},
			});
	}

	runEvaluation(): void {
		if (!this.testBrief || !this.testImageUrl || !this.agent()) {
			return;
		}

		this.evaluating.set(true);
		this.evaluationResult.set(null);

		this.agentService
			.evaluateImage(this.organizationId, {
				brief: this.testBrief,
				imageUrls: [this.testImageUrl],
				judgeIds: [this.agent()!.id],
			})
			.subscribe({
				next: (response) => {
					this.evaluationResult.set(
						response.data.winner.evaluations[0],
					);
					this.evaluating.set(false);
				},
				error: (error) => {
					console.error('Error running evaluation:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to run evaluation',
						life: 3000,
					});
					this.evaluating.set(false);
				},
			});
	}

	getChecklistEntries(): [string, { passed: boolean; note?: string }][] {
		const result = this.evaluationResult();
		if (!result?.checklist) return [];
		return Object.entries(result.checklist);
	}

	getCategoryScoreEntries(): [string, number][] {
		const result = this.evaluationResult();
		if (!result?.categoryScores) return [];
		return Object.entries(result.categoryScores);
	}

	getScoreSeverity(score: number): 'success' | 'warn' | 'danger' {
		if (score >= 80) return 'success';
		if (score >= 60) return 'warn';
		return 'danger';
	}

	getSeverityColor(
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

	formatDate(dateString: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}
}
