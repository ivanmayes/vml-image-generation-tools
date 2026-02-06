import {
	IsOptional,
	IsString,
	IsInt,
	Min,
	Max,
	IsArray,
	IsUUID,
} from 'class-validator';

export class RequestContinueDto {
	@IsOptional()
	@IsString()
	promptOverride?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	additionalIterations?: number = 5;

	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	judgeIds?: string[];
}
