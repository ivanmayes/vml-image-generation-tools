import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GenerationRequest, GeneratedImage } from '../entities';
import { AgentModule } from '../agent/agent.module';
import { JobsModule } from '../jobs/jobs.module';

import { GenerationRequestService } from './generation-request.service';
import { GenerationRequestController } from './generation-request.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([GenerationRequest, GeneratedImage]),
		AgentModule,
		forwardRef(() => JobsModule),
	],
	controllers: [GenerationRequestController],
	providers: [GenerationRequestService],
	exports: [GenerationRequestService],
})
export class GenerationRequestModule {}
