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
	ArrayMinSize,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImageParamsDto {
	@IsOptional()
	@IsString()
	aspectRatio?: string;

	@IsOptional()
	@IsString()
	quality?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(4)
	imagesPerGeneration?: number = 3;

	@IsOptional()
	@IsInt()
	@Min(2)
	@Max(10)
	plateauWindowSize?: number;

	@IsOptional()
	@IsNumber()
	@Min(0.001)
	@Max(0.5)
	plateauThreshold?: number;
}

export class RequestCreateDto {
	@IsNotEmpty()
	@IsString()
	brief!: string;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	referenceImageUrls?: string[];

	@IsOptional()
	@IsString()
	negativePrompts?: string;

	@IsArray()
	@IsUUID('4', { each: true })
	@ArrayMinSize(1)
	judgeIds!: string[];

	@IsOptional()
	@ValidateNested()
	@Type(() => ImageParamsDto)
	imageParams?: ImageParamsDto;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	threshold?: number = 75;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	maxIterations?: number = 5;

	@IsOptional()
	@IsUUID()
	projectId?: string;

	@IsOptional()
	@IsUUID()
	spaceId?: string;
}
