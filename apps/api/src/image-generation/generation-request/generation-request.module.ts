import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import { User } from '../../user/user.entity';
import { UserService } from '../../user/user.service';
import { AuthService } from '../../user/auth/auth.service';
import { GenerationRequest, GeneratedImage } from '../entities';
import { AgentModule } from '../../agent/agent.module';
import { JobsModule } from '../jobs/jobs.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';

import { GenerationRequestService } from './generation-request.service';
import { GenerationRequestController } from './generation-request.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([GenerationRequest, GeneratedImage, User]),
		AgentModule,
		PassportModule.register({ defaultStrategy: 'jwt' }),
		JwtModule.register({
			privateKey: process.env.PRIVATE_KEY,
			publicKey: process.env.PUBLIC_KEY,
			signOptions: {
				expiresIn: '30days',
				algorithm: 'RS256',
			},
		}),
		forwardRef(() => JobsModule),
		forwardRef(() => OrchestrationModule),
	],
	controllers: [GenerationRequestController],
	providers: [GenerationRequestService, UserService, AuthService],
	exports: [GenerationRequestService],
})
export class GenerationRequestModule {}
