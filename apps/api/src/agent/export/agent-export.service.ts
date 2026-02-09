import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import JSZip from 'jszip';

import { AgentService } from '../agent.service';
import { Agent } from '../agent.entity';

/**
 * VML Open Agent Builder agent.json schema for .agent file export.
 */
export interface VmlAgentJson {
	id: string;
	name: string;
	description?: string;
	systemPrompt: string;
	evaluationCategories?: string;
	optimizationWeight: number;
	scoringWeight: number;
	ragConfig: { topK: number; similarityThreshold: number };
	canJudge: boolean;
	teamPrompt?: string;
	aiSummary?: string;
	agentType?: string;
	modelTier?: string;
	thinkingLevel?: string;
	status: string;
	capabilities: string[];
	teamAgentIds: string[];
	temperature?: number;
	maxTokens?: number;
	avatarUrl?: string;
}

/**
 * Service for exporting agents to .agent ZIP files.
 *
 * .agent file structure:
 * ```
 * <uuid>/
 * ├── agent.json          # Agent configuration
 * └── sources/            # Knowledge/document files
 *     ├── 000_file1.txt
 *     ├── 001_file2.pdf
 * ```
 */
@Injectable()
export class AgentExportService {
	private readonly logger = new Logger(AgentExportService.name);
	private readonly s3: AWS.S3;

	constructor(private readonly agentService: AgentService) {
		this.s3 = new AWS.S3({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			region: process.env.AWS_REGION || 'us-east-1',
		});
	}

	async exportToAgentFile(
		agentId: string,
		organizationId: string,
	): Promise<{ buffer: Buffer; fileName: string }> {
		const agent = await this.agentService.getWithDocuments(
			agentId,
			organizationId,
		);

		if (!agent) {
			throw new NotFoundException('Agent not found');
		}

		const zip = new JSZip();
		const basePath = `${agent.id}/`;

		// Build agent.json
		const agentJson = this.buildAgentJson(agent);
		zip.file(`${basePath}agent.json`, JSON.stringify(agentJson, null, 2));

		// Add document files from S3
		const documents = agent.documents ?? [];
		if (documents.length > 0) {
			const sourcesPath = `${basePath}sources/`;

			for (let i = 0; i < documents.length; i++) {
				const doc = documents[i];
				try {
					const s3Response = await this.s3
						.getObject({
							Bucket: process.env.AWS_S3_BUCKET!,
							Key: doc.s3Key,
						})
						.promise();

					const paddedIndex = String(i).padStart(3, '0');
					const fileName = `${paddedIndex}_${doc.filename}`;
					zip.file(
						`${sourcesPath}${fileName}`,
						s3Response.Body as Buffer,
					);
				} catch (error) {
					this.logger.warn({
						event: 'document_export_failed',
						agentId: agent.id,
						filename: doc.filename,
						error:
							error instanceof Error
								? error.message
								: String(error),
					});
				}
			}
		}

		const buffer = await zip.generateAsync({
			type: 'nodebuffer',
			compression: 'DEFLATE',
			compressionOptions: { level: 9 },
		});

		const safeName = agent.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
		const fileName = `${safeName}.agent`;

		this.logger.log({
			event: 'agent_exported',
			agentId: agent.id,
			agentName: agent.name,
			fileSize: buffer.length,
			documentCount: documents.length,
		});

		return { buffer, fileName };
	}

	private buildAgentJson(agent: Agent): VmlAgentJson {
		return {
			id: agent.id,
			name: agent.name,
			description: agent.description ?? undefined,
			systemPrompt: agent.systemPrompt,
			evaluationCategories: agent.evaluationCategories ?? undefined,
			optimizationWeight: agent.optimizationWeight,
			scoringWeight: agent.scoringWeight,
			ragConfig: agent.ragConfig,
			canJudge: agent.canJudge,
			teamPrompt: agent.teamPrompt ?? undefined,
			aiSummary: agent.aiSummary ?? undefined,
			agentType: agent.agentType ?? undefined,
			modelTier: agent.modelTier ?? undefined,
			thinkingLevel: agent.thinkingLevel ?? undefined,
			status: agent.status,
			capabilities: agent.capabilities ?? [],
			teamAgentIds: agent.teamAgentIds ?? [],
			temperature: agent.temperature ?? undefined,
			maxTokens: agent.maxTokens ?? undefined,
			avatarUrl: agent.avatarUrl ?? undefined,
		};
	}
}
