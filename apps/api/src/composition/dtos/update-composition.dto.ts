import { ApiProperty } from '@nestjs/swagger';
import {
	IsString,
	IsOptional,
	IsNotEmpty,
	IsInt,
	IsObject,
	Min,
	Max,
	MaxLength,
} from 'class-validator';

export class UpdateCompositionDto {
	@ApiProperty({ description: 'Updated name', required: false })
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(255)
	name?: string;

	@ApiProperty({
		description: 'Canvas state (FabricJS JSON)',
		required: false,
	})
	@IsOptional()
	@IsObject()
	canvasState?: Record<string, unknown>;

	@ApiProperty({ description: 'Canvas width in pixels', required: false })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(4096)
	canvasWidth?: number;

	@ApiProperty({ description: 'Canvas height in pixels', required: false })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(4096)
	canvasHeight?: number;
}
