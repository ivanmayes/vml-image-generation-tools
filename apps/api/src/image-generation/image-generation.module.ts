import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { CompositionModule } from '../composition/composition.module';

import { DocumentProcessorModule } from './document-processor/document-processor.module';
import { PromptOptimizerModule } from './prompt-optimizer/prompt-optimizer.module';
import { GenerationRequestModule } from './generation-request/generation-request.module';
import { JobsModule } from './jobs/jobs.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { DebugController } from './debug.controller';

const isDevelopment = process.env.NODE_ENV !== 'production';

@Module({
	imports: [
		AgentModule,
		CompositionModule,
		DocumentProcessorModule,
		PromptOptimizerModule,
		GenerationRequestModule,
		JobsModule,
		OrchestrationModule,
	],
	controllers: isDevelopment ? [DebugController] : [],
	exports: [
		CompositionModule,
		DocumentProcessorModule,
		PromptOptimizerModule,
		GenerationRequestModule,
		JobsModule,
		OrchestrationModule,
	],
})
export class ImageGenerationModule {}
