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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
	AgentType,
	ModelTier,
	ThinkingLevel,
	AgentStatus,
} from '../agent.entity';

export class RagConfigDto {
	@ApiPropertyOptional({
		description: 'Number of top results to retrieve from RAG',
		example: 5,
		minimum: 1,
		maximum: 20,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	topK?: number = 5;

	@ApiPropertyOptional({
		description: 'Minimum similarity score threshold for RAG results',
		example: 0.7,
		minimum: 0,
		maximum: 1,
	})
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(1)
	similarityThreshold?: number = 0.7;
}

export class AgentCreateDto {
	@ApiProperty({
		description: 'Agent name',
		example: 'Brand Compliance Judge',
		maxLength: 255,
	})
	@IsNotEmpty()
	@IsString()
	@MaxLength(255)
	name!: string;

	@ApiProperty({
		description:
			'System prompt that defines the agent behavior and expertise',
		example: 'You are an expert brand compliance evaluator...',
	})
	@IsNotEmpty()
	@IsString()
	@MaxLength(50000)
	systemPrompt!: string;

	@ApiPropertyOptional({
		description: 'Comma-separated evaluation categories (for judge agents)',
		example: 'brand_alignment,visual_quality,messaging',
		maxLength: 2000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	evaluationCategories?: string;

	@ApiPropertyOptional({
		description:
			'Weight for using agent feedback in prompt optimization (0-100)',
		example: 50,
		minimum: 0,
		maximum: 100,
	})
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	optimizationWeight?: number = 50;

	@ApiPropertyOptional({
		description: 'Weight for agent score in aggregate evaluation (0-100)',
		example: 50,
		minimum: 0,
		maximum: 100,
	})
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	scoringWeight?: number = 50;

	@ApiPropertyOptional({
		description: 'RAG configuration for document retrieval',
		type: RagConfigDto,
	})
	@IsOptional()
	@IsObject()
	@ValidateNested()
	@Type(() => RagConfigDto)
	ragConfig?: RagConfigDto;

	@ApiPropertyOptional({
		description: 'Template ID if agent was created from a template',
		example: 'brand-judge-v1',
		maxLength: 255,
	})
	@IsOptional()
	@IsString()
	@MaxLength(255)
	templateId?: string;

	// --- New fields from Ford ABM parity ---

	@ApiPropertyOptional({
		description: 'Whether this agent can act as an evaluation judge',
		example: true,
		default: true,
	})
	@IsOptional()
	@IsBoolean()
	canJudge?: boolean;

	@ApiPropertyOptional({
		description: 'Human-readable description of the agent purpose',
		example: 'Evaluates brand compliance for Ford marketing materials',
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	description?: string;

	@ApiPropertyOptional({
		description:
			'Instructions for how this agent should collaborate in a team context',
		example:
			'Focus on brand guidelines while considering feedback from other judges',
		maxLength: 10000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(10000)
	teamPrompt?: string;

	@ApiPropertyOptional({
		description:
			'AI-generated summary of agent capabilities and focus areas',
		example:
			'Expert in Ford brand guidelines, color usage, and logo placement',
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	aiSummary?: string;

	@ApiPropertyOptional({
		description:
			'Agent type: EXPERT uses full context, AUDIENCE uses summarized',
		enum: AgentType,
		example: AgentType.EXPERT,
	})
	@IsOptional()
	@IsEnum(AgentType)
	agentType?: AgentType;

	@ApiPropertyOptional({
		description: 'Model tier for LLM selection (PRO or FLASH)',
		enum: ModelTier,
		example: ModelTier.PRO,
	})
	@IsOptional()
	@IsEnum(ModelTier)
	modelTier?: ModelTier;

	@ApiPropertyOptional({
		description: 'Thinking/reasoning depth level',
		enum: ThinkingLevel,
		example: ThinkingLevel.MEDIUM,
	})
	@IsOptional()
	@IsEnum(ThinkingLevel)
	thinkingLevel?: ThinkingLevel;

	@ApiPropertyOptional({
		description: 'Agent operational status',
		enum: AgentStatus,
		example: AgentStatus.ACTIVE,
		default: AgentStatus.ACTIVE,
	})
	@IsOptional()
	@IsEnum(AgentStatus)
	status?: AgentStatus;

	@ApiPropertyOptional({
		description: 'List of agent capabilities or focus areas',
		example: ['brand_compliance', 'color_evaluation', 'typography_check'],
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	capabilities?: string[];

	@ApiPropertyOptional({
		description: 'UUIDs of other agents in this agent team',
		example: ['550e8400-e29b-41d4-a716-446655440000'],
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	teamAgentIds?: string[];

	@ApiPropertyOptional({
		description: 'LLM temperature parameter (0-2, higher = more creative)',
		example: 0.7,
		minimum: 0,
		maximum: 2,
	})
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(2)
	temperature?: number;

	@ApiPropertyOptional({
		description: 'Maximum tokens for LLM response',
		example: 4096,
		minimum: 1,
		maximum: 1000000,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(1000000)
	maxTokens?: number;

	@ApiPropertyOptional({
		description: 'HTTPS URL to agent avatar image',
		example: 'https://example.com/avatar.png',
		maxLength: 2048,
	})
	@IsOptional()
	@IsUrl({ protocols: ['https'], require_protocol: true })
	@MaxLength(2048)
	avatarUrl?: string;

	@ApiPropertyOptional({
		description:
			'Custom judge prompt template (overrides default structured evaluation format)',
		example:
			'Evaluate the image for brand compliance using this criteria: ...',
		maxLength: 50000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(50000)
	judgePrompt?: string;
}
