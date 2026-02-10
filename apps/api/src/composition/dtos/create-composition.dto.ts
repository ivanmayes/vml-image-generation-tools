import { ApiProperty } from '@nestjs/swagger';
import {
	IsString,
	IsOptional,
	IsUUID,
	IsInt,
	IsNotEmpty,
	Min,
	Max,
	MaxLength,
} from 'class-validator';

export class CreateCompositionDto {
	@ApiProperty({ description: 'Project to link this composition to' })
	@IsOptional()
	@IsUUID()
	projectId?: string;

	@ApiProperty({ description: 'Name of the composition' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(255)
	name!: string;

	@ApiProperty({ description: 'Canvas width in pixels', default: 1024 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(4096)
	canvasWidth?: number;

	@ApiProperty({ description: 'Canvas height in pixels', default: 1024 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(4096)
	canvasHeight?: number;
}
