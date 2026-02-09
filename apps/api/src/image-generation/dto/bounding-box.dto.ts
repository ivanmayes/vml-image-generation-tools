import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

import { BoundingBox } from '../interfaces/bounding-box.interface';

export class BoundingBoxDto implements BoundingBox {
	@ApiProperty({ description: 'Left offset in pixels' })
	@IsInt()
	@Min(0)
	@Max(10000)
	left: number;

	@ApiProperty({ description: 'Top offset in pixels' })
	@IsInt()
	@Min(0)
	@Max(10000)
	top: number;

	@ApiProperty({ description: 'Width in pixels' })
	@IsInt()
	@Min(1)
	@Max(10000)
	width: number;

	@ApiProperty({ description: 'Height in pixels' })
	@IsInt()
	@Min(1)
	@Max(10000)
	height: number;
}
