import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AIModule } from '../../ai/ai.module';
import { PromptOptimizer } from '../entities';
import { DocumentProcessorModule } from '../document-processor/document-processor.module';

import { PromptOptimizerService } from './prompt-optimizer.service';
import { PromptOptimizerController } from './prompt-optimizer.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([PromptOptimizer]),
		AIModule,
		DocumentProcessorModule,
	],
	controllers: [PromptOptimizerController],
	providers: [PromptOptimizerService],
	exports: [PromptOptimizerService],
})
export class PromptOptimizerModule {}
