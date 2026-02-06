import { Module } from '@nestjs/common';

import { AgentModule } from './agent/agent.module';
import { DocumentProcessorModule } from './document-processor/document-processor.module';
import { PromptOptimizerModule } from './prompt-optimizer/prompt-optimizer.module';
import { GenerationRequestModule } from './generation-request/generation-request.module';
import { ProjectModule } from './project/project.module';
import { JobsModule } from './jobs/jobs.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { DebugController } from './debug.controller';

@Module({
	imports: [
		AgentModule,
		DocumentProcessorModule,
		PromptOptimizerModule,
		GenerationRequestModule,
		ProjectModule,
		JobsModule,
		OrchestrationModule,
	],
	controllers: [DebugController],
	exports: [
		AgentModule,
		DocumentProcessorModule,
		PromptOptimizerModule,
		GenerationRequestModule,
		ProjectModule,
		JobsModule,
		OrchestrationModule,
	],
})
export class ImageGenerationModule {}
