import {
	IsOptional,
	IsString,
	IsInt,
	Min,
	Max,
	IsObject,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { RagConfigDto } from './agent-create.dto';

export class AgentUpdateDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	systemPrompt?: string;

	@IsOptional()
	@IsString()
	evaluationCategories?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	optimizationWeight?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	scoringWeight?: number;

	@IsOptional()
	@IsObject()
	@ValidateNested()
	@Type(() => RagConfigDto)
	ragConfig?: RagConfigDto;

	@IsOptional()
	@IsString()
	templateId?: string;
}
