import {
	IsNotEmpty,
	IsString,
	IsOptional,
	IsUUID,
	IsObject,
} from 'class-validator';

export class ProjectCreateDto {
	@IsNotEmpty()
	@IsString()
	name!: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsUUID()
	spaceId?: string;

	@IsOptional()
	@IsObject()
	settings?: Record<string, any>;
}
