import {
	IsOptional,
	IsString,
	IsNumber,
	Min,
	Max,
	IsObject,
} from 'class-validator';

export class OptimizerConfigDto {
	@IsOptional()
	@IsString()
	model?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(2)
	temperature?: number;

	@IsOptional()
	@IsNumber()
	@Min(1)
	maxTokens?: number;
}

export class OptimizerUpdateDto {
	@IsOptional()
	@IsString()
	systemPrompt?: string;

	@IsOptional()
	@IsObject()
	config?: OptimizerConfigDto;
}
