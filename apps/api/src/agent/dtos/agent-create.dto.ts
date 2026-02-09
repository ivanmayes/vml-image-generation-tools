import {
	IsNotEmpty,
	IsString,
	IsOptional,
	IsInt,
	IsNumber,
	Min,
	Max,
	IsObject,
	ValidateNested,
	IsBoolean,
	IsEnum,
	IsArray,
	IsUUID,
	IsUrl,
	MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
	AgentType,
	ModelTier,
	ThinkingLevel,
	AgentStatus,
} from '../agent.entity';

export class RagConfigDto {
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	topK?: number = 5;

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	similarityThreshold?: number = 0.7;
}

export class AgentCreateDto {
	@IsNotEmpty()
	@IsString()
	name!: string;

	@IsNotEmpty()
	@IsString()
	systemPrompt!: string;

	@IsOptional()
	@IsString()
	evaluationCategories?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	optimizationWeight?: number = 50;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	scoringWeight?: number = 50;

	@IsOptional()
	@IsObject()
	@ValidateNested()
	@Type(() => RagConfigDto)
	ragConfig?: RagConfigDto;

	@IsOptional()
	@IsString()
	templateId?: string;

	// --- New fields from Ford ABM parity ---

	@IsOptional()
	@IsBoolean()
	canJudge?: boolean;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsString()
	teamPrompt?: string;

	@IsOptional()
	@IsString()
	aiSummary?: string;

	@IsOptional()
	@IsEnum(AgentType)
	agentType?: AgentType;

	@IsOptional()
	@IsEnum(ModelTier)
	modelTier?: ModelTier;

	@IsOptional()
	@IsEnum(ThinkingLevel)
	thinkingLevel?: ThinkingLevel;

	@IsOptional()
	@IsEnum(AgentStatus)
	status?: AgentStatus;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	capabilities?: string[];

	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	teamAgentIds?: string[];

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(2)
	temperature?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(1000000)
	maxTokens?: number;

	@IsOptional()
	@IsUrl({ protocols: ['https'], require_protocol: true })
	@MaxLength(2048)
	avatarUrl?: string;
}
