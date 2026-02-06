import { Module, forwardRef } from '@nestjs/common';

import { AIModule } from '../../ai/ai.module';
import { AgentModule } from '../agent/agent.module';
import { GenerationRequestModule } from '../generation-request/generation-request.module';
import { PromptOptimizerModule } from '../prompt-optimizer/prompt-optimizer.module';
import { DocumentProcessorModule } from '../document-processor/document-processor.module';
import { JobsModule } from '../jobs/jobs.module';

import { GeminiImageService } from './gemini-image.service';
import { EvaluationService } from './evaluation.service';
import { OrchestrationService } from './orchestration.service';
import { DebugOutputService } from './debug-output.service';

@Module({
	imports: [
		AIModule,
		AgentModule,
		forwardRef(() => GenerationRequestModule),
		PromptOptimizerModule,
		DocumentProcessorModule,
		forwardRef(() => JobsModule),
	],
	providers: [
		GeminiImageService,
		EvaluationService,
		OrchestrationService,
		DebugOutputService,
	],
	exports: [
		OrchestrationService,
		EvaluationService,
		GeminiImageService,
		DebugOutputService,
	],
})
export class OrchestrationModule {}
