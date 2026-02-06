import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { OrchestrationModule } from '../orchestration/orchestration.module';
import { OrchestrationService } from '../orchestration/orchestration.service';

import { JobQueueService } from './job-queue.service';

@Module({
	imports: [forwardRef(() => OrchestrationModule)],
	providers: [JobQueueService],
	exports: [JobQueueService],
})
export class JobsModule implements OnModuleInit {
	constructor(
		private readonly moduleRef: ModuleRef,
		private readonly jobQueueService: JobQueueService,
	) {}

	async onModuleInit() {
		// Wire up the orchestration service to the job queue
		const orchestrationService = this.moduleRef.get(OrchestrationService, {
			strict: false,
		});
		this.jobQueueService.setOrchestrationService(orchestrationService);
	}
}
