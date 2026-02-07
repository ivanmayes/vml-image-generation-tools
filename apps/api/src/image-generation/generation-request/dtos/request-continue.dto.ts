import {
	IsOptional,
	IsString,
	IsInt,
	Min,
	Max,
	MaxLength,
	IsArray,
	IsUUID,
	IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { GenerationMode } from '../../entities/generation-request.entity';

export class RequestContinueDto {
	@ApiPropertyOptional({
		description: 'Override prompt for the next iteration',
	})
	@IsOptional()
	@IsString()
	@MaxLength(10000)
	promptOverride?: string;

	@ApiPropertyOptional({
		description: 'Number of additional iterations to run',
		default: 5,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(50)
	additionalIterations?: number = 5;

	@ApiPropertyOptional({
		description: 'Override judge agent IDs for continuation',
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	judgeIds?: string[];

	@ApiPropertyOptional({
		description: 'Switch generation strategy mode',
		enum: GenerationMode,
	})
	@IsOptional()
	@IsEnum(GenerationMode)
	generationMode?: GenerationMode;
}
