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
} from 'class-validator';
import { Type } from 'class-transformer';

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
}
