import {
	Controller,
	Get,
	Put,
	Body,
	UseGuards,
	HttpException,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../../user/auth/roles.decorator';
import { RolesGuard } from '../../user/auth/roles.guard';
import { UserRole } from '../../user/user-role.enum';
import { ResponseEnvelope, ResponseStatus } from '../../_core/models';
import { PromptOptimizer } from '../entities';

import { PromptOptimizerService } from './prompt-optimizer.service';
import { OptimizerUpdateDto } from './dtos';

@Controller('image-generation/optimizer')
export class PromptOptimizerController {
	constructor(
		private readonly promptOptimizerService: PromptOptimizerService,
	) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard)
	public async getOptimizer() {
		const optimizer =
			await this.promptOptimizerService.getOrCreateOptimizer();

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new PromptOptimizer(optimizer).toPublic(),
		);
	}

	@Put()
	@Roles(UserRole.SuperAdmin)
	@UseGuards(AuthGuard(), RolesGuard)
	public async updateOptimizer(@Body() updateDto: OptimizerUpdateDto) {
		const optimizer = await this.promptOptimizerService
			.updateOptimizer(updateDto)
			.catch(() => null);

		if (!optimizer) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error updating optimizer configuration.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Optimizer configuration updated.',
			new PromptOptimizer(optimizer).toPublic(),
		);
	}
}
