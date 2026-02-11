import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { GenerationRequest } from '../image-generation/entities/generation-request.entity';

import { Agent } from './agent.entity';
import { AgentDocument } from './agent-document.entity';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AgentAnalyticsService } from './agent-analytics.service';
import { AgentAnalyticsController } from './agent-analytics.controller';
import { TeamCycleValidator } from './validators/team-cycle.validator';
import { AgentExportService } from './export/agent-export.service';
import { AgentImportService } from './import/agent-import.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Agent, AgentDocument, GenerationRequest]),
		PassportModule.register({ defaultStrategy: 'jwt' }),
	],
	controllers: [AgentController, AgentAnalyticsController],
	providers: [
		AgentService,
		AgentAnalyticsService,
		TeamCycleValidator,
		AgentExportService,
		AgentImportService,
	],
	exports: [AgentService, TeamCycleValidator],
})
export class AgentModule {}
