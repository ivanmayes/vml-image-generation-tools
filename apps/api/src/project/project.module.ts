import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { Project } from './project.entity';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([Project]),
		PassportModule.register({ defaultStrategy: 'jwt' }),
	],
	controllers: [ProjectController],
	providers: [ProjectService],
	exports: [ProjectService],
})
export class ProjectModule {}
