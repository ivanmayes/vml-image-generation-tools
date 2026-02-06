import { IsString, IsOptional, IsUUID, IsObject } from 'class-validator';

export class ProjectUpdateDto {
	@IsOptional()
	@IsString()
	name?: string;

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
