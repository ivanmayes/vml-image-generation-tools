import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
	FormsModule,
	ReactiveFormsModule,
	FormGroup,
	FormControl,
	Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Subscription } from 'rxjs';

import { AgentService } from '../../../../shared/services/agent.service';
import {
	Agent,
	AgentCreateDto,
	AgentUpdateDto,
	AgentDocument,
	AgentStatus,
	AgentType,
	ModelTier,
	ThinkingLevel,
	AGENT_TYPES,
	MODEL_TIERS,
	THINKING_LEVELS,
} from '../../../../shared/models/agent.model';
import { environment } from '../../../../../environments/environment';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { ImageEvaluatorComponent } from '../../../../shared/components/image-evaluator/image-evaluator.component';

@Component({
	selector: 'app-judge-detail',
	templateUrl: './judge-detail.page.html',
	styleUrls: ['./judge-detail.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		ReactiveFormsModule,
		ConfirmDialogModule,
		ImageEvaluatorComponent,
	],
})
export class JudgeDetailPage implements OnInit, OnDestroy {
	private readonly AGENTS_LIST_ROUTE = '/organization/admin/judges';

	readonly SYSTEM_PROMPT_TEMPLATE = `You are an expert image evaluation judge specializing in brand compliance and visual quality assessment.

## YOUR EXPERTISE
- Brand identity and guideline adherence
- Product photography and composition
- Color accuracy and consistency
- Typography and label legibility
- Lighting, shadows, and visual realism

## EVALUATION CRITERIA

When evaluating images, score each of these checklist items as pass/fail:
- **Product Accuracy**: Does the product shape, size, and proportions match the real product?
- **Label/Text Legibility**: Is all text on the product readable and correctly spelled?
- **Color Fidelity**: Do brand colors match the official palette?
- **Composition**: Is the product well-framed with appropriate negative space?
- **Lighting Quality**: Is the lighting natural and consistent with no harsh artifacts?
- **Background Appropriateness**: Does the background match the brief's requirements?
- **Brand Consistency**: Does the overall image feel on-brand?

## CATEGORY SCORES

Provide individual scores (0-100) for these categories:
- composition
- color_accuracy
- product_accuracy
- text_legibility
- lighting
- brand_consistency

## EVALUATION STYLE
- Be precise and specific — reference exact visual elements ("the gold foil on the cap" not "the top part")
- Compare against real product appearance when possible
- Flag AI artifacts explicitly (distorted text, merged objects, impossible geometry)
- Suggest actionable fixes that a prompt engineer can implement`;

	loading = signal(false);
	saving = signal(false);
	agent = signal<Agent | null>(null);
	isCreateMode = signal(false);
	documents = signal<AgentDocument[]>([]);
	loadingDocuments = signal(false);
	uploadingDocument = signal(false);
	availableAgents = signal<Agent[]>([]);
	formDirty = signal(false);

	readonly agentTypes = AGENT_TYPES;
	readonly modelTiers = MODEL_TIERS;
	readonly thinkingLevels = THINKING_LEVELS;

	form = new FormGroup({
		// General
		name: new FormControl('', {
			nonNullable: true,
			validators: [Validators.required],
		}),
		description: new FormControl('', { nonNullable: true }),
		canJudge: new FormControl(true, { nonNullable: true }),
		status: new FormControl(true, { nonNullable: true }),
		avatarUrl: new FormControl('', { nonNullable: true }),
		// Prompts
		systemPrompt: new FormControl('', {
			nonNullable: true,
			validators: [Validators.required],
		}),
		teamPrompt: new FormControl('', { nonNullable: true }),
		aiSummary: new FormControl('', { nonNullable: true }),
		// Model Configuration
		agentType: new FormControl<string | null>(null),
		modelTier: new FormControl<string | null>(null),
		thinkingLevel: new FormControl<string | null>(null),
		temperature: new FormControl<number | null>(null),
		maxTokens: new FormControl<number | null>(null),
		// Team & Capabilities
		capabilities: new FormControl<string[]>([], { nonNullable: true }),
		teamAgentIds: new FormControl<string[]>([], { nonNullable: true }),
		// Judging
		evaluationCategories: new FormControl('', { nonNullable: true }),
		optimizationWeight: new FormControl(50, { nonNullable: true }),
		scoringWeight: new FormControl(50, { nonNullable: true }),
		judgePrompt: new FormControl<string | null>(null),
		builtInToolsGoogleSearch: new FormControl(false, { nonNullable: true }),
		builtInToolsCodeExecution: new FormControl(false, {
			nonNullable: true,
		}),
		// Weights & RAG
		templateId: new FormControl('', { nonNullable: true }),
		ragTopK: new FormControl(5, { nonNullable: true }),
		ragSimilarityThreshold: new FormControl(0.7, { nonNullable: true }),
	});

	private organizationId = environment.organizationId;
	private agentId: string | null = null;
	private formSub: Subscription | null = null;

	constructor(
		private readonly agentService: AgentService,
		private readonly messageService: MessageService,
		private readonly router: Router,
		private readonly route: ActivatedRoute,
	) {
		this.form.get('aiSummary')?.disable();
	}

	ngOnInit(): void {
		const idParam = this.route.snapshot.paramMap.get('id');

		if (!idParam || idParam === 'new') {
			this.isCreateMode.set(true);
		} else {
			this.agentId = idParam;
			this.loadAgent(idParam);
		}

		this.loadAvailableAgents();

		this.formSub = this.form.valueChanges.subscribe(() => {
			this.formDirty.set(true);
		});
	}

	ngOnDestroy(): void {
		this.formSub?.unsubscribe();
	}

	private loadAvailableAgents(): void {
		this.agentService.getAgents(this.organizationId).subscribe({
			next: (response) => {
				const agents = (response.data || []).filter(
					(a) => a.id !== this.agentId,
				);
				this.availableAgents.set(agents);
			},
			error: (error) => {
				console.error('Error loading available agents:', error);
			},
		});
	}

	private loadAgent(agentId: string): void {
		this.loading.set(true);

		this.agentService.getAgent(this.organizationId, agentId).subscribe({
			next: (response) => {
				const agentData = response.data;
				if (!agentData) return;
				this.agent.set(agentData);
				this.form.patchValue({
					name: agentData.name || '',
					description: agentData.description || '',
					canJudge: agentData.canJudge !== false,
					status: agentData.status === 'ACTIVE',
					avatarUrl: agentData.avatarUrl || '',
					systemPrompt: agentData.systemPrompt || '',
					teamPrompt: agentData.teamPrompt || '',
					evaluationCategories: agentData.evaluationCategories || '',
					aiSummary: agentData.aiSummary || '',
					agentType: agentData.agentType || null,
					modelTier: agentData.modelTier || null,
					thinkingLevel: agentData.thinkingLevel || null,
					temperature: agentData.temperature ?? null,
					maxTokens: agentData.maxTokens ?? null,
					capabilities: agentData.capabilities || [],
					teamAgentIds: agentData.teamAgentIds || [],
					judgePrompt: agentData.judgePrompt ?? null,
					builtInToolsGoogleSearch:
						agentData.builtInTools?.googleSearch ?? false,
					builtInToolsCodeExecution:
						agentData.builtInTools?.codeExecution ?? false,
					templateId: agentData.templateId || '',
					optimizationWeight: agentData.optimizationWeight ?? 50,
					scoringWeight: agentData.scoringWeight ?? 50,
					ragTopK: agentData.ragConfig?.topK ?? 5,
					ragSimilarityThreshold:
						agentData.ragConfig?.similarityThreshold ?? 0.7,
				});
				this.formDirty.set(false);
				this.loading.set(false);
				this.loadDocuments(agentData.id);
			},
			error: (error) => {
				console.error('Error loading agent:', error);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to load agent',
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

		if (this.isCreateMode()) {
			const dto: AgentCreateDto = {
				name: formValue.name,
				systemPrompt: formValue.systemPrompt,
				evaluationCategories:
					formValue.evaluationCategories || undefined,
				templateId: formValue.templateId || undefined,
				optimizationWeight: formValue.optimizationWeight,
				scoringWeight: formValue.scoringWeight,
				ragConfig: {
					topK: formValue.ragTopK,
					similarityThreshold: formValue.ragSimilarityThreshold,
				},
				description: formValue.description || undefined,
				canJudge: formValue.canJudge,
				status: formValue.status
					? AgentStatus.ACTIVE
					: AgentStatus.INACTIVE,
				agentType: (formValue.agentType as AgentType) ?? undefined,
				modelTier: (formValue.modelTier as ModelTier) ?? undefined,
				thinkingLevel:
					(formValue.thinkingLevel as ThinkingLevel) ?? undefined,
				teamPrompt: formValue.teamPrompt || undefined,
				capabilities: formValue.capabilities.length
					? formValue.capabilities
					: undefined,
				teamAgentIds: formValue.teamAgentIds.length
					? formValue.teamAgentIds
					: undefined,
				temperature: formValue.temperature ?? undefined,
				maxTokens: formValue.maxTokens ?? undefined,
				avatarUrl: formValue.avatarUrl || undefined,
				judgePrompt: formValue.judgePrompt || undefined,
				builtInTools: {
					googleSearch: formValue.builtInToolsGoogleSearch,
					codeExecution: formValue.builtInToolsCodeExecution,
				},
			};
			this.agentService.createAgent(this.organizationId, dto).subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Agent created successfully',
						life: 3000,
					});
					this.saving.set(false);
					this.formDirty.set(false);
					this.router.navigate([this.AGENTS_LIST_ROUTE]);
				},
				error: (error) => {
					console.error('Error creating agent:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to create agent',
						life: 3000,
					});
					this.saving.set(false);
				},
			});
		} else {
			const dto: AgentUpdateDto = {
				name: formValue.name,
				systemPrompt: formValue.systemPrompt,
				evaluationCategories:
					formValue.evaluationCategories || undefined,
				templateId: formValue.templateId || undefined,
				optimizationWeight: formValue.optimizationWeight,
				scoringWeight: formValue.scoringWeight,
				ragConfig: {
					topK: formValue.ragTopK,
					similarityThreshold: formValue.ragSimilarityThreshold,
				},
				description: formValue.description || undefined,
				canJudge: formValue.canJudge,
				status: formValue.status
					? AgentStatus.ACTIVE
					: AgentStatus.INACTIVE,
				agentType: (formValue.agentType as AgentType) ?? undefined,
				modelTier: (formValue.modelTier as ModelTier) ?? undefined,
				thinkingLevel:
					(formValue.thinkingLevel as ThinkingLevel) ?? undefined,
				teamPrompt: formValue.teamPrompt || undefined,
				capabilities: formValue.capabilities.length
					? formValue.capabilities
					: undefined,
				teamAgentIds: formValue.teamAgentIds.length
					? formValue.teamAgentIds
					: undefined,
				temperature: formValue.temperature ?? undefined,
				maxTokens: formValue.maxTokens ?? undefined,
				avatarUrl: formValue.avatarUrl || undefined,
				judgePrompt:
					formValue.judgePrompt === ''
						? null
						: formValue.judgePrompt || undefined,
				builtInTools: {
					googleSearch: formValue.builtInToolsGoogleSearch,
					codeExecution: formValue.builtInToolsCodeExecution,
				},
			};
			this.agentService
				.updateAgent(this.organizationId, this.agentId!, dto)
				.subscribe({
					next: () => {
						this.messageService.add({
							severity: 'success',
							summary: 'Success',
							detail: 'Agent updated successfully',
							life: 3000,
						});
						this.saving.set(false);
						this.formDirty.set(false);
						this.router.navigate([this.AGENTS_LIST_ROUTE]);
					},
					error: (error) => {
						console.error('Error updating agent:', error);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: 'Failed to update agent',
							life: 3000,
						});
						this.saving.set(false);
					},
				});
		}
	}

	cancel(): void {
		this.router.navigate([this.AGENTS_LIST_ROUTE]);
	}

	goBack(): void {
		this.router.navigate([this.AGENTS_LIST_ROUTE]);
	}

	loadDocuments(agentId: string): void {
		this.loadingDocuments.set(true);

		this.agentService.getDocuments(this.organizationId, agentId).subscribe({
			next: (response) => {
				this.documents.set(response.data ?? []);
				this.loadingDocuments.set(false);
			},
			error: (error) => {
				console.error('Error loading documents:', error);
				this.loadingDocuments.set(false);
			},
		});
	}

	onUploadDocument(event: { files: File[] }): void {
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

	formatDate(dateString: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	getInitials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');
	}

	loadSystemPromptTemplate(): void {
		const current = this.form.get('systemPrompt')?.value?.trim();
		if (current) {
			const confirmed = confirm(
				'This will replace your current system prompt with a template. Continue?',
			);
			if (!confirmed) return;
		}
		this.form.get('systemPrompt')?.setValue(this.SYSTEM_PROMPT_TEMPLATE);
		this.form.get('systemPrompt')?.markAsDirty();
		this.formDirty.set(true);
	}

	getAvatarGradient(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = Math.abs(hash) % 360;
		return `linear-gradient(135deg, hsl(${hue}, 65%, 55%) 0%, hsl(${(hue + 40) % 360}, 60%, 45%) 100%)`;
	}
}
