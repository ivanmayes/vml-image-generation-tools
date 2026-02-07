import {
	IsNotEmpty,
	IsString,
	IsOptional,
	IsArray,
	IsUUID,
	IsInt,
	IsNumber,
	Min,
	Max,
	MaxLength,
	ArrayMinSize,
	ValidateNested,
	IsEnum,
	IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { GenerationMode } from '../../entities/generation-request.entity';

export class ImageParamsDto {
	@ApiPropertyOptional({
		description: 'Aspect ratio for generated images',
		example: '16:9',
	})
	@IsOptional()
	@IsString()
	aspectRatio?: string;

	@ApiPropertyOptional({
		description: 'Image quality tier',
		example: '2K',
	})
	@IsOptional()
	@IsString()
	quality?: string;

	@ApiPropertyOptional({
		description: 'Number of images per generation iteration',
		default: 3,
		minimum: 1,
		maximum: 4,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(4)
	imagesPerGeneration?: number = 3;

	@ApiPropertyOptional({
		description: 'Window size for plateau detection',
		default: 3,
		minimum: 2,
		maximum: 10,
	})
	@IsOptional()
	@IsInt()
	@Min(2)
	@Max(10)
	plateauWindowSize?: number;

	@ApiPropertyOptional({
		description: 'Threshold for plateau detection',
		minimum: 0.001,
		maximum: 0.5,
	})
	@IsOptional()
	@IsNumber()
	@Min(0.001)
	@Max(0.5)
	plateauThreshold?: number;
}

export class RequestCreateDto {
	@ApiProperty({ description: 'Creative brief describing what to generate' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(10000)
	brief!: string;

	@ApiPropertyOptional({
		description: 'Initial prompt to start generation from',
	})
	@IsOptional()
	@IsString()
	@MaxLength(10000)
	initialPrompt?: string;

	@ApiPropertyOptional({
		description: 'HTTPS URLs of reference images',
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsUrl(
		{ protocols: ['https'], require_protocol: true },
		{
			each: true,
			message: 'Each reference image URL must be a valid HTTPS URL',
		},
	)
	referenceImageUrls?: string[];

	@ApiPropertyOptional({ description: 'Negative prompts to avoid' })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	negativePrompts?: string;

	@ApiProperty({
		description: 'UUIDs of judge agents to evaluate generated images',
		type: [String],
	})
	@IsArray()
	@IsUUID('4', { each: true })
	@ArrayMinSize(1)
	judgeIds!: string[];

	@ApiPropertyOptional({
		description: 'Image generation parameters',
		type: ImageParamsDto,
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => ImageParamsDto)
	imageParams?: ImageParamsDto;

	@ApiPropertyOptional({
		description:
			'Score threshold to consider generation successful (0-100)',
		default: 75,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	threshold?: number = 75;

	@ApiPropertyOptional({
		description: 'Maximum number of iterations before stopping',
		default: 5,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(50)
	maxIterations?: number = 5;

	@ApiPropertyOptional({ description: 'Project ID to associate with' })
	@IsOptional()
	@IsUUID()
	projectId?: string;

	@ApiPropertyOptional({ description: 'Space ID to associate with' })
	@IsOptional()
	@IsUUID()
	spaceId?: string;

	@ApiPropertyOptional({
		description: 'Generation strategy mode',
		enum: GenerationMode,
	})
	@IsOptional()
	@IsEnum(GenerationMode)
	generationMode?: GenerationMode;
}
