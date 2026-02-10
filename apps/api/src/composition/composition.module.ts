import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { OrchestrationModule } from '../image-generation/orchestration/orchestration.module';

import { Composition } from './entities/composition.entity';
import { CompositionVersion } from './entities/composition-version.entity';
import { CompositionService } from './composition.service';
import { CompositionController } from './composition.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([Composition, CompositionVersion]),
		PassportModule.register({ defaultStrategy: 'jwt' }),
		OrchestrationModule,
	],
	controllers: [CompositionController],
	providers: [CompositionService],
	exports: [CompositionService],
})
export class CompositionModule {}
