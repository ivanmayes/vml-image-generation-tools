import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	Query,
	UseGuards,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';
import { UserRole } from '../user/user-role.enum';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';

import { AgentAnalyticsService } from './agent-analytics.service';

const basePath = 'organization/:orgId/agents';

/** Simple per-key in-memory rate limiter */
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

function checkRateLimit(key: string): boolean {
	const now = Date.now();
	const last = rateLimitMap.get(key) ?? 0;
	if (now - last < RATE_LIMIT_MS) return false;
	rateLimitMap.set(key, now);
	return true;
}

@ApiTags('Agent Analytics')
@ApiBearerAuth()
@Controller(basePath)
export class AgentAnalyticsController {
	private readonly logger = new Logger(AgentAnalyticsController.name);

	constructor(private readonly analyticsService: AgentAnalyticsService) {}

	@Get(':id/analytics')
	@ApiOperation({ summary: 'Get quantitative judge analytics' })
	@ApiParam({ name: 'orgId', description: 'Organization ID' })
	@ApiParam({ name: 'id', description: 'Agent ID' })
	@ApiQuery({
		name: 'limit',
		required: false,
		description: 'Number of recent requests to analyze (25, 50, or 100)',
		enum: ['25', '50', '100'],
	})
	@ApiResponse({ status: 200, description: 'Analytics retrieved' })
	@ApiResponse({ status: 404, description: 'Agent not found' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async getAnalytics(
		@Param('orgId') orgId: string,
		@Param('id') agentId: string,
		@Query('limit') limitStr?: string,
	) {
		const limit = this.parseLimit(limitStr);

		try {
			const result = await this.analyticsService.getQuantitativeAnalytics(
				orgId,
				agentId,
				limit,
			);
			return new ResponseEnvelope(
				ResponseStatus.Success,
				undefined,
				result,
			);
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			if (message === 'Agent not found') {
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						'Agent not found.',
					),
					HttpStatus.NOT_FOUND,
				);
			}
			this.logger.error('Analytics error', error);
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Failed to compute analytics.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	@Post(':id/analytics/analyze')
	@ApiOperation({ summary: 'Get qualitative LLM analysis of judge feedback' })
	@ApiParam({ name: 'orgId', description: 'Organization ID' })
	@ApiParam({ name: 'id', description: 'Agent ID' })
	@ApiResponse({ status: 200, description: 'Analysis completed' })
	@ApiResponse({ status: 429, description: 'Rate limited' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async analyzeJudge(
		@Param('orgId') orgId: string,
		@Param('id') agentId: string,
		@Body() body: { limit?: number },
	) {
		const rateKey = `analyze:${orgId}:${agentId}`;
		if (!checkRateLimit(rateKey)) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Please wait 30 seconds between analysis requests.',
				),
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		const limit = this.parseLimit(String(body.limit ?? 50));

		try {
			const result = await this.analyticsService.getQualitativeAnalysis(
				orgId,
				agentId,
				limit,
			);
			return new ResponseEnvelope(
				ResponseStatus.Success,
				undefined,
				result,
			);
		} catch (error) {
			this.logger.error('Qualitative analysis error', error);
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Failed to analyze judge feedback.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	@Post(':id/analytics/optimize-prompt')
	@ApiOperation({
		summary: 'Generate an optimized judge prompt based on analytics',
	})
	@ApiParam({ name: 'orgId', description: 'Organization ID' })
	@ApiParam({ name: 'id', description: 'Agent ID' })
	@ApiResponse({ status: 200, description: 'Optimization completed' })
	@ApiResponse({ status: 429, description: 'Rate limited' })
	@Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.User)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	async optimizePrompt(
		@Param('orgId') orgId: string,
		@Param('id') agentId: string,
		@Body() body: { limit?: number },
	) {
		const rateKey = `optimize:${orgId}:${agentId}`;
		if (!checkRateLimit(rateKey)) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Please wait 30 seconds between optimization requests.',
				),
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		const limit = this.parseLimit(String(body.limit ?? 50));

		try {
			const result = await this.analyticsService.optimizePrompt(
				orgId,
				agentId,
				limit,
			);
			return new ResponseEnvelope(
				ResponseStatus.Success,
				undefined,
				result,
			);
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			if (message === 'Agent not found') {
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						'Agent not found.',
					),
					HttpStatus.NOT_FOUND,
				);
			}
			this.logger.error('Prompt optimization error', error);
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Failed to optimize prompt.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	private parseLimit(limitStr?: string): number {
		const limit = parseInt(limitStr ?? '50', 10);
		if ([25, 50, 100].includes(limit)) return limit;
		return 50;
	}
}
