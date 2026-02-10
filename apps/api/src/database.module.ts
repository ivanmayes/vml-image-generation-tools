import path from 'path';

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './notification/notification.entity';
import { User } from './user/user.entity';
import { Organization } from './organization/organization.entity';
import { AuthenticationStrategy } from './authentication-strategy/authentication-strategy.entity';
import { ApiKey } from './api-key/api-key.entity';
import { ApiKeyLog } from './api-key/api-key-log.entity';
import { Space } from './space/space.entity';
import { SpaceUser } from './space-user/space-user.entity';
import { Agent } from './agent/agent.entity';
import { AgentDocument } from './agent/agent-document.entity';
import {
	GeneratedImage,
	GenerationRequest,
	PromptOptimizer,
} from './image-generation/entities';
import { Composition } from './composition/entities/composition.entity';
import { CompositionVersion } from './composition/entities/composition-version.entity';
// CLI_ENTITIES_IMPORT

@Module({
	imports: [
		TypeOrmModule.forRoot({
			name: 'default',
			type: (process.env.DATABASE_TYPE as any) || 'postgres',
			url: process.env.DATABASE_URL,
			extra: {
				ssl: process.env.DATABASE_SSL
					? { rejectUnauthorized: false }
					: false,
			},
			entities: [__dirname + '/**/*.entity{.ts,.js}'],
			synchronize: process.env.DATABASE_SYNCHRONIZE === 'true' || false,
			logging: (process.env.LOGGING as any) || false,
			autoLoadEntities: true,
			migrations: [
				path.resolve(__dirname + '/../migrations-js') + '/*.js',
			],
			migrationsRun:
				process.env.DATABASE_MIGRATE_ON_STARTUP === 'true' || false,
		}),
		TypeOrmModule.forFeature(
			[
				// TypeORM Entities
				Notification,
				AuthenticationStrategy,
				Organization,
				ApiKey,
				ApiKeyLog,
				User,
				Space,
				SpaceUser,
				Agent,
				AgentDocument,
				GeneratedImage,
				GenerationRequest,
				PromptOptimizer,
				Composition,
				CompositionVersion,
				// CLI_ENTITIES_REF
			],
			'default',
		),
	],
	exports: [TypeOrmModule],
})
export class DatabaseModule {}
