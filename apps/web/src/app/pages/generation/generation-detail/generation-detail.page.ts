import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	OnDestroy,
	signal,
	computed,
	ElementRef,
	ViewChild,
	AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { RequestContinueDto } from '@api/image-generation/generation-request/dtos';

import { GenerationRequestService } from '../../../shared/services/generation-request.service';
import { GenerationEventsService } from '../../../shared/services/generation-events.service';
import { SessionQuery } from '../../../state/session/session.query';
import {
	GenerationRequestDetailed,
	GenerationRequestStatus,
	GenerationEvent,
	GenerationEventType,
	IterationSnapshot,
	GeneratedImage,
} from '../../../shared/models/generation-request.model';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';
import { RoundCardComponent } from '../components/round-card/round-card.component';
import { CompletionBannerComponent } from '../components/completion-banner/completion-banner.component';
import { ContinuationEditorComponent } from '../components/continuation-editor/continuation-editor.component';

@Component({
	selector: 'app-generation-detail',
	templateUrl: './generation-detail.page.html',
	styleUrls: ['./generation-detail.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		RoundCardComponent,
		CompletionBannerComponent,
		ContinuationEditorComponent,
	],
})
export class GenerationDetailPage
	implements OnInit, OnDestroy, AfterViewChecked
{
	@ViewChild('timelineEnd') timelineEnd?: ElementRef<HTMLDivElement>;

	request = signal<GenerationRequestDetailed | null>(null);
	loading = signal(true);
	images = signal<GeneratedImage[]>([]);
	continuing = signal(false);
	events = signal<GenerationEvent[]>([]);
	sseConnected = signal(false);

	private shouldAutoScroll = false;

	readonly isActive = computed(() => {
		const status = this.request()?.status;
		return (
			status === GenerationRequestStatus.OPTIMIZING ||
			status === GenerationRequestStatus.GENERATING ||
			status === GenerationRequestStatus.EVALUATING
		);
	});

	readonly isTerminal = computed(() => {
		const status = this.request()?.status;
		return (
			status === GenerationRequestStatus.COMPLETED ||
			status === GenerationRequestStatus.FAILED ||
			status === GenerationRequestStatus.CANCELLED
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

	readonly lastPrompt = computed(() => {
		const iters = this.iterations();
		if (iters.length === 0) return '';
		return iters[iters.length - 1].optimizedPrompt ?? '';
	});

	readonly finalImage = computed(() => {
		const req = this.request();
		const imgs = this.images();
		if (!req || imgs.length === 0) return null;

		const iters = this.iterations();
		const targetId =
			req.finalImageId ?? iters[iters.length - 1]?.selectedImageId;
		if (!targetId) return null;
		return imgs.find((img) => img.id === targetId) ?? null;
	});

	readonly canContinue = computed(() => {
		const status = this.request()?.status;
		return (
			status === GenerationRequestStatus.COMPLETED ||
			status === GenerationRequestStatus.FAILED
		);
	});

	private organizationId!: string;
	private requestId!: string;
	private destroy$ = new Subject<void>();

	constructor(
		private readonly route: ActivatedRoute,
		private readonly router: Router,
		private readonly requestService: GenerationRequestService,
		private readonly eventsService: GenerationEventsService,
		private readonly sessionQuery: SessionQuery,
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

	ngAfterViewChecked(): void {
		if (this.shouldAutoScroll && this.timelineEnd) {
			this.timelineEnd.nativeElement.scrollIntoView({
				behavior: 'smooth',
				block: 'end',
			});
			this.shouldAutoScroll = false;
		}
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
					this.loadImages();

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

	loadImages(): void {
		this.requestService
			.getImages(this.organizationId, this.requestId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.images.set(response.data ?? []);
				},
				error: () => {
					// Images are supplemental, don't block the page
				},
			});
	}

	onBack(): void {
		this.router.navigate(['../'], { relativeTo: this.route });
	}

	onContinue(dto: RequestContinueDto): void {
		this.continuing.set(true);
		this.requestService
			.continueRequest(this.organizationId, this.requestId, dto)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Continued',
						detail: 'Generation continued with additional iterations.',
					});
					this.continuing.set(false);
					this.loadRequest();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to continue generation.',
					});
					this.continuing.set(false);
				},
			});
	}

	private connectToStream(): void {
		const token = this.sessionQuery.getToken() ?? '';
		this.eventsService
			.connect(this.organizationId, this.requestId, token)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (event) => {
					this.sseConnected.set(true);
					this.events.update((prev) => [...prev, event]);
					this.handleEvent(event);
				},
				error: () => {
					this.sseConnected.set(false);
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
			case GenerationEventType.INITIAL_STATE:
				// Full state sync on SSE connect — replace current data
				if (event.data['request']) {
					this.request.set(
						event.data['request'] as GenerationRequestDetailed,
					);
				}
				if (event.data['images']) {
					this.images.set(event.data['images'] as GeneratedImage[]);
				}
				break;

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
				// Reload images and auto-scroll to new iteration
				this.loadImages();
				this.shouldAutoScroll = true;
				break;

			case GenerationEventType.COMPLETED:
			case GenerationEventType.FAILED:
				this.loadRequest();
				this.sseConnected.set(false);
				break;
		}
	}
}
