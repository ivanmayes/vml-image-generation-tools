import { ApiProperty } from '@nestjs/swagger';
import {
	IsEnum,
	IsObject,
	IsOptional,
	IsString,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { BoundingBoxDto } from '../../image-generation/dto/bounding-box.dto';
import { CanvasState } from '../entities/composition.entity';

export enum CompositionVersionMode {
	UPLOAD = 'upload',
	GENERATE = 'generate',
	STITCH = 'stitch',
	INPAINT = 'inpaint',
}

export class CreateCompositionVersionDto {
	@ApiProperty({
		enum: CompositionVersionMode,
		description: 'Generation mode for this version',
	})
	@IsEnum(CompositionVersionMode)
	mode!: CompositionVersionMode;

	@ApiProperty({ required: false, description: 'Prompt for generation' })
	@IsOptional()
	@IsString()
	@MaxLength(10000)
	prompt?: string;

	@ApiProperty({
		required: false,
		description: 'Bounding box for stitch mode',
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => BoundingBoxDto)
	boundingBox?: BoundingBoxDto;

	@ApiProperty({
		required: false,
		description: 'Base64-encoded background image',
	})
	@IsOptional()
	@IsString()
	@MaxLength(20_000_000) // ~15MB decoded image
	backgroundImage?: string;

	@ApiProperty({ required: false, description: 'Base64-encoded mask image' })
	@IsOptional()
	@IsString()
	@MaxLength(20_000_000) // ~15MB decoded image
	maskImage?: string;

	@ApiProperty({
		required: false,
		description: 'Canvas state snapshot from frontend',
	})
	@IsOptional()
	@IsObject()
	canvasStateSnapshot?: CanvasState;
}
