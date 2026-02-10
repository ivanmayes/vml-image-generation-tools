import {
	Controller,
	Post,
	Body,
	Param,
	UseGuards,
	Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { v4 as uuidv4 } from 'uuid';

import { Roles } from '../../user/auth/roles.decorator';
import { RolesGuard } from '../../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../../organization/guards/has-organization-access.guard';
import { UserRole } from '../../user/user-role.enum';
import { ResponseEnvelope, ResponseStatus } from '../../_core/models';
import { GeneratedImage } from '../entities';
import { AgentService } from '../../agent/agent.service';

import { EvaluationService } from './evaluation.service';

@Controller('organization/:orgId/image-generation')
export class EvaluateController {
	private readonly logger = new Logger(EvaluateController.name);

	constructor(
		private readonly agentService: AgentService,
		private readonly evaluationService: EvaluationService,
	) {}

	@Post('evaluate')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async evaluateImages(
		@Param('orgId') orgId: string,
		@Body()
		body: {
			brief: string;
			imageUrls: string[];
			judgeIds: string[];
			promptUsed?: string;
		},
	) {
		// Validate required fields
		if (!body.brief?.trim()) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				'brief is required.',
			);
		}
		if (!body.imageUrls?.length) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				'At least one imageUrl is required.',
			);
		}
		if (!body.judgeIds?.length) {
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				'At least one judgeId is required.',
			);
		}

		// Validate judge IDs exist (uses orgId from route param, NOT hardcoded)
		const agents = await this.agentService.findByIds(body.judgeIds, orgId);
		if (agents.length !== body.judgeIds.length) {
			const foundIds = new Set(agents.map((a) => a.id));
			const missing = body.judgeIds.filter((id) => !foundIds.has(id));
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				`Judge IDs not found: ${missing.join(', ')}`,
			);
		}

		const nonJudgeAgents = agents.filter((a) => !a.canJudge);
		if (nonJudgeAgents.length > 0) {
			const names = nonJudgeAgents.map((a) => a.name).join(', ');
			return new ResponseEnvelope(
				ResponseStatus.Failure,
				`The following agents are not configured as judges: ${names}`,
			);
		}

		// Load agents with documents for RAG context
		const agentsWithDocs = await Promise.all(
			agents.map((a) => this.agentService.getWithDocuments(a.id, orgId)),
		);
		const loadedAgents = agentsWithDocs.filter((a) => a !== null);

		this.logger.log(
			`[EVALUATE] OrgId: ${orgId} | Images: ${body.imageUrls.length} | Judges: ${loadedAgents.length} | Brief: "${body.brief.substring(0, 80)}..."`,
		);

		// Build synthetic GeneratedImage objects from URLs
		const syntheticImages = body.imageUrls.map(
			(url) =>
				new GeneratedImage({
					id: uuidv4(),
					s3Url: url,
					promptUsed: body.promptUsed ?? '',
				}),
		);

		const imageUrlMap = new Map<string, string>();
		syntheticImages.forEach((img, i) => {
			imageUrlMap.set(img.id, body.imageUrls[i]);
		});

		// Evaluate all images with all judges in parallel
		const allEvaluations = await Promise.all(
			syntheticImages.map((image) =>
				this.evaluationService.evaluateWithAllJudges(
					loadedAgents,
					image,
					body.brief,
					orgId,
				),
			),
		);

		const evaluationsByImage = new Map<
			string,
			Awaited<
				ReturnType<typeof this.evaluationService.evaluateWithAllJudges>
			>
		>();
		syntheticImages.forEach((image, i) => {
			evaluationsByImage.set(image.id, allEvaluations[i]);
		});

		// Aggregate and rank
		const ranked =
			this.evaluationService.aggregateEvaluations(evaluationsByImage);

		const ranking = ranked.map((r) => ({
			imageUrl: imageUrlMap.get(r.imageId)!,
			aggregateScore: Math.round(r.aggregateScore * 100) / 100,
			evaluations: this.evaluationService.toSnapshots(r.evaluations),
		}));

		return new ResponseEnvelope(
			ResponseStatus.Success,
			`Evaluated ${body.imageUrls.length} image(s) with ${loadedAgents.length} judge(s).`,
			{
				winner: ranking[0],
				ranking,
				judges: loadedAgents.map((a) => ({
					id: a.id,
					name: a.name,
					weight: a.scoringWeight,
				})),
				brief: body.brief,
				imageCount: body.imageUrls.length,
				judgeCount: loadedAgents.length,
			},
		);
	}
}
