import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AIModule } from '../../ai/ai.module';
import { AgentModule } from '../../agent/agent.module';
import { GenerationRequestModule } from '../generation-request/generation-request.module';
import { PromptOptimizerModule } from '../prompt-optimizer/prompt-optimizer.module';
import { DocumentProcessorModule } from '../document-processor/document-processor.module';
import { JobsModule } from '../jobs/jobs.module';

import { GeminiImageService } from './gemini-image.service';
import { EvaluationService } from './evaluation.service';
import { OrchestrationService } from './orchestration.service';
import { DebugOutputService } from './debug-output.service';
import { GenerationEventsService } from './generation-events.service';
import { EvaluateController } from './evaluate.controller';

@Module({
	imports: [
		AIModule,
		AgentModule,
		PassportModule.register({ defaultStrategy: 'jwt' }),
		forwardRef(() => GenerationRequestModule),
		PromptOptimizerModule,
		DocumentProcessorModule,
		forwardRef(() => JobsModule),
	],
	controllers: [EvaluateController],
	providers: [
		GeminiImageService,
		EvaluationService,
		OrchestrationService,
		DebugOutputService,
		GenerationEventsService,
	],
	exports: [
		OrchestrationService,
		EvaluationService,
		GeminiImageService,
		DebugOutputService,
		GenerationEventsService,
	],
})
export class OrchestrationModule {}
