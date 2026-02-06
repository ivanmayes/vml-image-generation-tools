import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Agent, AgentDocument } from '../entities';

import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';

@Module({
	imports: [TypeOrmModule.forFeature([Agent, AgentDocument])],
	controllers: [AgentController],
	providers: [AgentService],
	exports: [AgentService],
})
export class AgentModule {}
