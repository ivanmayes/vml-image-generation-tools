import { Module } from '@nestjs/common';

import { AIModule } from '../../ai/ai.module';
import { AgentModule } from '../agent/agent.module';

import { DocumentProcessorService } from './document-processor.service';

@Module({
	imports: [AIModule, AgentModule],
	providers: [DocumentProcessorService],
	exports: [DocumentProcessorService],
})
export class DocumentProcessorModule {}
