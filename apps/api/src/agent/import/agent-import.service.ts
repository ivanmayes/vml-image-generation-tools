import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as AWS from 'aws-sdk';
import JSZip from 'jszip';

import { AgentService } from '../agent.service';
import {
	Agent,
	AgentStatus,
	AgentType,
	ModelTier,
	ThinkingLevel,
} from '../agent.entity';
import { VmlAgentJson } from '../export/agent-export.service';
import { TeamCycleValidator } from '../validators/team-cycle.validator';

/** Agent mapping from agent-mapping.json for multi-agent team imports. */
interface AgentMapping {
	uuid: string;
	isExportedAgent: boolean;
	agenticTeamAgents: string[];
}

export interface AgentImportOptions {
	organizationId: string;
	skipDocuments?: boolean;
	nameOverride?: string;
}

export interface AgentImportResult {
	success: boolean;
	agentId: string;
	agentName: string;
	documentsFound: number;
	documentsImported: number;
	warnings: string[];
	teamAgentsImported?: number;
	teamAgentNames?: string[];
}

// Security limits
const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100MB compressed
const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024; // 500MB uncompressed
const MAX_FILES_IN_ZIP = 500;
const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const ALLOWED_EXTENSIONS = new Set([
	'.pdf',
	'.txt',
	'.docx',
	'.xlsx',
	'.csv',
	'.json',
	'.md',
	'.png',
	'.jpg',
	'.jpeg',
]);

const EXTENSION_MIME_MAP: Record<string, string> = {
	'.pdf': 'application/pdf',
	'.txt': 'text/plain',
	'.docx':
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'.xlsx':
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'.csv': 'text/csv',
	'.json': 'application/json',
	'.md': 'text/markdown',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
};

@Injectable()
export class AgentImportService {
	private readonly logger = new Logger(AgentImportService.name);
	private readonly s3: AWS.S3;

	constructor(
		private readonly agentService: AgentService,
		private readonly dataSource: DataSource,
		private readonly teamCycleValidator: TeamCycleValidator,
	) {
		this.s3 = new AWS.S3({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			region: process.env.AWS_REGION || 'us-east-1',
		});
	}

	async importFromAgentFile(
		buffer: Buffer,
		options: AgentImportOptions,
	): Promise<AgentImportResult> {
		const { organizationId, skipDocuments = false, nameOverride } = options;
		const warnings: string[] = [];

		// Security: check compressed size
		if (buffer.length > MAX_ZIP_SIZE) {
			throw new BadRequestException(
				`ZIP file too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum: ${MAX_ZIP_SIZE / 1024 / 1024}MB`,
			);
		}

		let zip: JSZip;
		try {
			zip = await JSZip.loadAsync(buffer);
		} catch {
			throw new BadRequestException('Invalid ZIP file: unable to parse');
		}

		// Security: validate ZIP contents
		this.validateZipSecurity(zip);

		const agentMapping = await this.parseAgentMapping(zip);

		if (agentMapping) {
			return this.importAgentTeam(zip, organizationId, agentMapping, {
				skipDocuments,
				nameOverride,
				warnings,
			});
		}

		return this.importSingleAgent(zip, organizationId, {
			skipDocuments,
			nameOverride,
			warnings,
		});
	}

	async validateAgentFile(buffer: Buffer): Promise<{
		valid: boolean;
		agentName?: string;
		documentCount: number;
		isTeam: boolean;
		teamAgentCount: number;
		errors: string[];
	}> {
		const errors: string[] = [];

		if (buffer.length > MAX_ZIP_SIZE) {
			return {
				valid: false,
				documentCount: 0,
				isTeam: false,
				teamAgentCount: 0,
				errors: ['ZIP file too large'],
			};
		}

		let zip: JSZip;
		try {
			zip = await JSZip.loadAsync(buffer);
		} catch {
			return {
				valid: false,
				documentCount: 0,
				isTeam: false,
				teamAgentCount: 0,
				errors: ['Invalid ZIP file'],
			};
		}

		try {
			this.validateZipSecurity(zip);
		} catch (e) {
			return {
				valid: false,
				documentCount: 0,
				isTeam: false,
				teamAgentCount: 0,
				errors: [
					e instanceof Error
						? e.message
						: 'ZIP security check failed',
				],
			};
		}

		const agentMapping = await this.parseAgentMapping(zip);
		const agentJsonPath = this.findAgentJson(zip);

		if (!agentJsonPath) {
			errors.push('Missing agent.json');
			return {
				valid: false,
				documentCount: 0,
				isTeam: !!agentMapping,
				teamAgentCount: agentMapping?.length ?? 0,
				errors,
			};
		}

		let agentJson: VmlAgentJson;
		try {
			const content = await zip.files[agentJsonPath].async('string');
			agentJson = JSON.parse(content);
		} catch {
			return {
				valid: false,
				documentCount: 0,
				isTeam: !!agentMapping,
				teamAgentCount: agentMapping?.length ?? 0,
				errors: ['Malformed agent.json'],
			};
		}

		if (!agentJson.name) errors.push('Missing name field');
		if (!agentJson.systemPrompt) errors.push('Missing systemPrompt field');

		const basePath = agentJsonPath.replace('agent.json', '');
		const sourcesPath = `${basePath}sources/`;
		const documentFiles = this.findSourceFiles(zip, sourcesPath);

		return {
			valid: errors.length === 0,
			agentName: agentJson.name,
			documentCount: documentFiles.length,
			isTeam: !!agentMapping,
			teamAgentCount: agentMapping?.length ?? 0,
			errors,
		};
	}

	// --- Security ---

	private validateZipSecurity(zip: JSZip): void {
		const fileEntries = Object.keys(zip.files).filter(
			(p) => !zip.files[p].dir,
		);

		// File count check
		if (fileEntries.length > MAX_FILES_IN_ZIP) {
			throw new BadRequestException(
				`ZIP contains too many files (${fileEntries.length}). Maximum: ${MAX_FILES_IN_ZIP}`,
			);
		}

		// Check for path traversal and estimate uncompressed size
		let totalUncompressed = 0;
		for (const path of fileEntries) {
			// Path traversal detection
			if (
				path.includes('..') ||
				path.startsWith('/') ||
				path.includes('\\')
			) {
				throw new BadRequestException(
					`ZIP contains suspicious path: ${path}`,
				);
			}

			// Symlink detection
			const file = zip.files[path];
			const perms = file.unixPermissions as number | null;
			if (perms && (perms & 0o120000) !== 0) {
				throw new BadRequestException(`ZIP contains symlink: ${path}`);
			}

			// Accumulate uncompressed size
			const info = file as { _data?: { uncompressedSize?: number } };
			const size = info._data?.uncompressedSize ?? 0;
			totalUncompressed += size;

			if (size > MAX_SINGLE_FILE_SIZE) {
				throw new BadRequestException(
					`File too large in ZIP: ${path} (${Math.round(size / 1024 / 1024)}MB)`,
				);
			}
		}

		// ZIP bomb detection
		if (totalUncompressed > MAX_UNCOMPRESSED_SIZE) {
			throw new BadRequestException(
				`ZIP uncompressed size too large (${Math.round(totalUncompressed / 1024 / 1024)}MB). Maximum: ${MAX_UNCOMPRESSED_SIZE / 1024 / 1024}MB`,
			);
		}
	}

	// --- Import logic ---

	private async importSingleAgent(
		zip: JSZip,
		organizationId: string,
		options: {
			skipDocuments: boolean;
			nameOverride?: string;
			warnings: string[];
		},
	): Promise<AgentImportResult> {
		const { skipDocuments, nameOverride, warnings } = options;

		const agentJsonPath = this.findAgentJson(zip);
		if (!agentJsonPath) {
			throw new BadRequestException(
				'Invalid .agent file: missing agent.json',
			);
		}

		const agentJson = await this.parseAgentJsonFile(zip, agentJsonPath);

		if (!agentJson.name || !agentJson.systemPrompt) {
			throw new BadRequestException(
				'Invalid agent.json: missing name or systemPrompt',
			);
		}

		const agent = await this.agentService.create({
			organizationId,
			name: nameOverride || agentJson.name,
			systemPrompt: agentJson.systemPrompt,
			description: agentJson.description ?? undefined,
			evaluationCategories: agentJson.evaluationCategories ?? undefined,
			optimizationWeight: agentJson.optimizationWeight ?? 50,
			scoringWeight: agentJson.scoringWeight ?? 50,
			ragConfig: agentJson.ragConfig ?? {
				topK: 5,
				similarityThreshold: 0.7,
			},
			canJudge: agentJson.canJudge ?? true,
			teamPrompt: agentJson.teamPrompt ?? undefined,
			aiSummary: agentJson.aiSummary ?? undefined,
			agentType: this.mapAgentType(agentJson.agentType),
			modelTier: this.mapModelTier(agentJson.modelTier),
			thinkingLevel: this.mapThinkingLevel(agentJson.thinkingLevel),
			temperature: agentJson.temperature,
			maxTokens: agentJson.maxTokens,
			capabilities: agentJson.capabilities ?? [],
			teamAgentIds: [],
			avatarUrl: agentJson.avatarUrl ?? undefined,
		} as Partial<Agent>);

		this.logger.log({
			event: 'agent_imported',
			agentId: agent.id,
			agentName: agent.name,
			originalId: agentJson.id,
		});

		const basePath = agentJsonPath.replace('agent.json', '');
		const sourcesPath = `${basePath}sources/`;
		const documentFiles = this.findSourceFiles(zip, sourcesPath);

		let documentsImported = 0;
		if (!skipDocuments && documentFiles.length > 0) {
			documentsImported = await this.importDocumentFiles(
				zip,
				agent.id,
				organizationId,
				documentFiles,
				warnings,
			);
		}

		return {
			success: true,
			agentId: agent.id,
			agentName: agent.name,
			documentsFound: documentFiles.length,
			documentsImported,
			warnings,
		};
	}

	private async importAgentTeam(
		zip: JSZip,
		organizationId: string,
		agentMappings: AgentMapping[],
		options: {
			skipDocuments: boolean;
			nameOverride?: string;
			warnings: string[];
		},
	): Promise<AgentImportResult> {
		const { skipDocuments, nameOverride, warnings } = options;

		const mainMapping = agentMappings.find((m) => m.isExportedAgent);
		if (!mainMapping) {
			throw new BadRequestException(
				'Invalid agent-mapping.json: no main agent marked as exported',
			);
		}

		// Parse all agent JSON files before the transaction (read-only, no DB)
		const parsedAgents = new Map<
			string,
			{ mapping: AgentMapping; agentJson: VmlAgentJson; basePath: string }
		>();

		for (const mapping of agentMappings) {
			const agentJsonPath = this.findAgentJsonByUuid(zip, mapping.uuid);
			if (!agentJsonPath) {
				warnings.push(`Agent ${mapping.uuid} not found in ZIP`);
				if (mapping.isExportedAgent) {
					throw new BadRequestException(
						`Main agent ${mapping.uuid} not found in ZIP`,
					);
				}
				continue;
			}

			let agentJson: VmlAgentJson;
			try {
				agentJson = await this.parseAgentJsonFile(zip, agentJsonPath);
			} catch (error) {
				const msg = `Failed to parse agent ${mapping.uuid}`;
				warnings.push(msg);
				if (mapping.isExportedAgent) throw error;
				continue;
			}

			if (!agentJson.name || !agentJson.systemPrompt) {
				const msg = `Agent ${mapping.uuid} missing required fields`;
				warnings.push(msg);
				if (mapping.isExportedAgent) {
					throw new BadRequestException(msg);
				}
				continue;
			}

			parsedAgents.set(mapping.uuid, {
				mapping,
				agentJson,
				basePath: agentJsonPath.replace('agent.json', ''),
			});
		}

		// Transaction: create all agents + set up team relationships atomically
		const { uuidToAgent, teamAgentNames } =
			await this.dataSource.transaction(async (manager) => {
				const agentRepo = manager.getRepository(Agent);
				const uuidToAgent = new Map<string, Agent>();
				const teamAgentNames: string[] = [];

				// Phase 1: Create all agents (without team relationships)
				for (const [uuid, { mapping, agentJson }] of parsedAgents) {
					const agentName =
						mapping.isExportedAgent && nameOverride
							? nameOverride
							: agentJson.name;

					const entity = agentRepo.create({
						organizationId,
						name: agentName,
						systemPrompt: agentJson.systemPrompt,
						description: agentJson.description ?? undefined,
						evaluationCategories:
							agentJson.evaluationCategories ?? undefined,
						optimizationWeight: agentJson.optimizationWeight ?? 50,
						scoringWeight: agentJson.scoringWeight ?? 50,
						ragConfig: agentJson.ragConfig ?? {
							topK: 5,
							similarityThreshold: 0.7,
						},
						canJudge: agentJson.canJudge ?? true,
						status: AgentStatus.ACTIVE,
						teamPrompt: agentJson.teamPrompt ?? undefined,
						aiSummary: agentJson.aiSummary ?? undefined,
						agentType: this.mapAgentType(agentJson.agentType),
						modelTier: this.mapModelTier(agentJson.modelTier),
						thinkingLevel: this.mapThinkingLevel(
							agentJson.thinkingLevel,
						),
						temperature: agentJson.temperature,
						maxTokens: agentJson.maxTokens,
						capabilities: agentJson.capabilities ?? [],
						teamAgentIds: [],
						avatarUrl: agentJson.avatarUrl ?? undefined,
					});

					const agent = await agentRepo.save(entity);
					uuidToAgent.set(uuid, agent);

					if (!mapping.isExportedAgent) {
						teamAgentNames.push(agent.name);
					}
				}

				// Phase 2: Remap team relationships
				for (const [uuid, { mapping }] of parsedAgents) {
					const agent = uuidToAgent.get(uuid);
					if (!agent) continue;

					if (mapping.agenticTeamAgents?.length) {
						const remappedIds = mapping.agenticTeamAgents
							.map((u) => uuidToAgent.get(u)?.id)
							.filter((id): id is string => !!id);

						if (remappedIds.length > 0) {
							agent.teamAgentIds = remappedIds;
							await agentRepo.save(agent);
						}
					}
				}

				// Phase 3: Validate no cycles were introduced
				for (const [, { mapping }] of parsedAgents) {
					const agent = uuidToAgent.get(mapping.uuid);
					if (
						agent &&
						agent.teamAgentIds &&
						agent.teamAgentIds.length > 0
					) {
						await this.teamCycleValidator.validate(
							agent.id,
							agent.teamAgentIds,
							organizationId,
						);
					}
				}

				return { uuidToAgent, teamAgentNames };
			});

		const mainAgent = uuidToAgent.get(mainMapping.uuid);
		if (!mainAgent) {
			throw new BadRequestException('Failed to import main agent');
		}

		// Outside transaction: import documents (best-effort, non-critical)
		if (!skipDocuments) {
			for (const [uuid, { basePath }] of parsedAgents) {
				const agent = uuidToAgent.get(uuid);
				if (!agent) continue;

				const sourcesPath = `${basePath}sources/`;
				const documentFiles = this.findSourceFiles(zip, sourcesPath);
				if (documentFiles.length > 0) {
					await this.importDocumentFiles(
						zip,
						agent.id,
						organizationId,
						documentFiles,
						warnings,
					);
				}
			}
		}

		return {
			success: true,
			agentId: mainAgent.id,
			agentName: mainAgent.name,
			documentsFound: 0,
			documentsImported: 0,
			warnings,
			teamAgentsImported: uuidToAgent.size - 1,
			teamAgentNames,
		};
	}

	// --- Helpers ---

	private async parseAgentJsonFile(
		zip: JSZip,
		path: string,
	): Promise<VmlAgentJson> {
		try {
			const content = await zip.files[path].async('string');
			return JSON.parse(content);
		} catch {
			throw new BadRequestException(
				'Invalid .agent file: malformed agent.json',
			);
		}
	}

	private async parseAgentMapping(
		zip: JSZip,
	): Promise<AgentMapping[] | null> {
		const mappingPath = Object.keys(zip.files).find(
			(p) => p.endsWith('agent-mapping.json') && !zip.files[p].dir,
		);

		if (!mappingPath) return null;

		try {
			const content = await zip.files[mappingPath].async('string');
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	private findAgentJson(zip: JSZip): string | null {
		return (
			Object.keys(zip.files).find(
				(p) => p.endsWith('agent.json') && !zip.files[p].dir,
			) ?? null
		);
	}

	private findAgentJsonByUuid(zip: JSZip, uuid: string): string | null {
		const directPath = `${uuid}/agent.json`;
		if (zip.files[directPath] && !zip.files[directPath].dir) {
			return directPath;
		}

		return (
			Object.keys(zip.files).find(
				(p) => p.includes(`/${uuid}/agent.json`) && !zip.files[p].dir,
			) ?? null
		);
	}

	private findSourceFiles(zip: JSZip, sourcesPath: string): string[] {
		return Object.keys(zip.files).filter(
			(p) =>
				p.startsWith(sourcesPath) &&
				!zip.files[p].dir &&
				!p.endsWith('/'),
		);
	}

	private async importDocumentFiles(
		zip: JSZip,
		agentId: string,
		organizationId: string,
		filePaths: string[],
		warnings: string[],
	): Promise<number> {
		let imported = 0;

		for (const filePath of filePaths) {
			try {
				const fileName = this.extractFileName(filePath);
				const ext = fileName
					.substring(fileName.lastIndexOf('.'))
					.toLowerCase();

				if (!ALLOWED_EXTENSIONS.has(ext)) {
					warnings.push(`Skipped unsupported file: ${fileName}`);
					continue;
				}

				const mimeType = EXTENSION_MIME_MAP[ext];
				if (!mimeType) continue;

				const fileBuffer =
					await zip.files[filePath].async('nodebuffer');

				if (fileBuffer.length > MAX_SINGLE_FILE_SIZE) {
					warnings.push(`Skipped oversized file: ${fileName}`);
					continue;
				}

				// Upload to S3
				const s3Key = `agent-documents/${organizationId}/${agentId}/${Date.now()}-${fileName}`;
				await this.s3
					.upload({
						Bucket: process.env.AWS_S3_BUCKET!,
						Key: s3Key,
						Body: fileBuffer,
						ContentType: mimeType,
					})
					.promise();

				// Add document record
				await this.agentService.addDocument(agentId, {
					filename: fileName,
					mimeType,
					s3Key,
				});

				imported++;
			} catch (error) {
				warnings.push(
					`Failed to import ${this.extractFileName(filePath)}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		return imported;
	}

	private extractFileName(path: string): string {
		const parts = path.split('/');
		let fileName = parts[parts.length - 1];

		// Remove numeric prefix (e.g., "000_filename.pdf" -> "filename.pdf")
		const prefixMatch = fileName.match(/^\d+_(.+)$/);
		if (prefixMatch) {
			fileName = prefixMatch[1];
		}

		return this.sanitizeFileName(fileName);
	}

	/**
	 * Sanitize a filename for use in S3 keys.
	 * Strips path separators, null bytes, non-printable characters,
	 * and path traversal sequences to prevent S3 key injection.
	 */
	private sanitizeFileName(name: string): string {
		return (
			name
				// eslint-disable-next-line no-control-regex
				.replace(/[\x00-\x1f]/g, '') // Remove null bytes and control characters
				.replace(/[/\\]/g, '_') // Replace path separators
				.replace(/\.\./g, '_') // Remove path traversal sequences
				.replace(/^\.+/, '_') // Don't start with dots
				.trim() || 'unnamed'
		);
	}

	private mapAgentType(type?: string): AgentType | undefined {
		if (!type) return undefined;
		if (type.toUpperCase() === 'AUDIENCE') return AgentType.AUDIENCE;
		if (type.toUpperCase() === 'EXPERT') return AgentType.EXPERT;
		return undefined;
	}

	private mapModelTier(tier?: string): ModelTier | undefined {
		if (!tier) return undefined;
		if (tier.toUpperCase() === 'PRO') return ModelTier.PRO;
		if (tier.toUpperCase() === 'FLASH') return ModelTier.FLASH;
		return undefined;
	}

	private mapThinkingLevel(level?: string): ThinkingLevel | undefined {
		if (!level) return undefined;
		const upper = level.toUpperCase();
		if (upper === 'LOW') return ThinkingLevel.LOW;
		if (upper === 'MEDIUM') return ThinkingLevel.MEDIUM;
		if (upper === 'HIGH') return ThinkingLevel.HIGH;
		return undefined;
	}
}
