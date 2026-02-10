import {
	Injectable,
	Logger,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { S3 } from '../_core/third-party/aws/aws.s3';
import {
	GeminiImageService,
	GeneratedImageResult,
} from '../image-generation/orchestration/gemini-image.service';
import { DebugOutputService } from '../image-generation/orchestration/debug-output.service';
import { getImageDimensions } from '../image-generation/utils/image-processing.utils';

import { Composition } from './entities/composition.entity';
import {
	CompositionVersion,
	CompositionVersionStatus,
} from './entities/composition-version.entity';
import { CreateCompositionDto } from './dtos/create-composition.dto';
import { UpdateCompositionDto } from './dtos/update-composition.dto';
import {
	CreateCompositionVersionDto,
	CompositionVersionMode,
} from './dtos/create-composition-version.dto';

@Injectable()
export class CompositionService {
	private readonly logger = new Logger(CompositionService.name);

	constructor(
		@InjectRepository(Composition)
		private readonly compositionRepository: Repository<Composition>,
		@InjectRepository(CompositionVersion)
		private readonly versionRepository: Repository<CompositionVersion>,
		private readonly geminiImageService: GeminiImageService,
		private readonly debugOutput: DebugOutputService,
		private readonly dataSource: DataSource,
	) {}

	// ─── Composition CRUD ───────────────────────────────────────────────────────

	async create(
		organizationId: string,
		dto: CreateCompositionDto,
		createdBy?: string,
	): Promise<Composition> {
		const composition = this.compositionRepository.create({
			organizationId,
			projectId: dto.projectId,
			name: dto.name,
			canvasWidth: dto.canvasWidth ?? 1024,
			canvasHeight: dto.canvasHeight ?? 1024,
			createdBy,
		});
		return this.compositionRepository.save(composition);
	}

	async findByOrganization(
		organizationId: string,
		options?: {
			projectId?: string;
			limit?: number;
			offset?: number;
		},
	): Promise<{ data: Composition[]; total: number }> {
		const limit = Math.min(options?.limit ?? 50, 200);
		const offset = Math.max(options?.offset ?? 0, 0);

		const qb = this.compositionRepository
			.createQueryBuilder('composition')
			.where('composition.organizationId = :organizationId', {
				organizationId,
			})
			.orderBy('composition.createdAt', 'DESC')
			.take(limit)
			.skip(offset);

		if (options?.projectId) {
			qb.andWhere('composition.projectId = :projectId', {
				projectId: options.projectId,
			});
		}

		const [data, total] = await qb.getManyAndCount();
		return { data, total };
	}

	async findOne(
		organizationId: string,
		compositionId: string,
	): Promise<Composition> {
		const composition = await this.compositionRepository.findOne({
			where: { id: compositionId, organizationId },
		});
		if (!composition) {
			throw new NotFoundException(
				`Composition ${compositionId} not found`,
			);
		}
		return composition;
	}

	async update(
		organizationId: string,
		compositionId: string,
		dto: UpdateCompositionDto,
	): Promise<Composition> {
		const composition = await this.findOne(organizationId, compositionId);
		if (dto.name !== undefined) {
			composition.name = dto.name;
		}
		if (dto.canvasState !== undefined) {
			// Validate canvas state size (max 2MB when stringified)
			const stateSize = JSON.stringify(dto.canvasState).length;
			if (stateSize > 2 * 1024 * 1024) {
				throw new BadRequestException(
					'Canvas state exceeds maximum size of 2MB',
				);
			}
			composition.canvasState = dto.canvasState as any;
		}
		if (dto.canvasWidth !== undefined) {
			composition.canvasWidth = dto.canvasWidth;
		}
		if (dto.canvasHeight !== undefined) {
			composition.canvasHeight = dto.canvasHeight;
		}
		return this.compositionRepository.save(composition);
	}

	async softDelete(
		organizationId: string,
		compositionId: string,
	): Promise<void> {
		const composition = await this.findOne(organizationId, compositionId);
		await this.compositionRepository.softRemove(composition);
	}

	// ─── Version Operations ─────────────────────────────────────────────────────

	async createVersion(
		organizationId: string,
		compositionId: string,
		dto: CreateCompositionVersionDto,
		createdBy?: string,
	): Promise<CompositionVersion> {
		this.validateVersionDto(dto);

		// Transaction-safe version numbering
		const version = await this.dataSource.transaction(async (manager) => {
			// Lock the composition row to prevent concurrent version inserts
			const composition = await manager
				.createQueryBuilder(Composition, 'composition')
				.setLock('pessimistic_write')
				.where(
					'composition.id = :id AND composition.organizationId = :organizationId',
					{
						id: compositionId,
						organizationId,
					},
				)
				.getOne();

			if (!composition) {
				throw new NotFoundException(
					`Composition ${compositionId} not found`,
				);
			}

			// Get next version number
			const lastVersion = await manager
				.createQueryBuilder(CompositionVersion, 'v')
				.where('v.compositionId = :compositionId', { compositionId })
				.orderBy('v.versionNumber', 'DESC')
				.getOne();

			const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

			// Create the version record in PROCESSING state
			const newVersion = manager.create(CompositionVersion, {
				compositionId,
				createdBy,
				prompt: dto.prompt,
				canvasStateSnapshot: dto.canvasStateSnapshot,
				versionNumber,
				status: CompositionVersionStatus.PROCESSING,
			});

			return manager.save(newVersion);
		});

		// Process asynchronously (don't block the response)
		this.processVersion(organizationId, compositionId, version, dto).catch(
			(err) => {
				this.logger.error(
					`Failed to process version ${version.id}: ${err.message}`,
					err.stack,
				);
			},
		);

		return version;
	}

	async findVersionsByComposition(
		compositionId: string,
		options?: { limit?: number; offset?: number },
	): Promise<{ data: CompositionVersion[]; total: number }> {
		const limit = Math.min(options?.limit ?? 50, 200);
		const offset = Math.max(options?.offset ?? 0, 0);

		const [data, total] = await this.versionRepository.findAndCount({
			where: { compositionId },
			order: { versionNumber: 'DESC' },
			take: limit,
			skip: offset,
		});

		return { data, total };
	}

	async findVersion(
		compositionId: string,
		versionId: string,
	): Promise<CompositionVersion> {
		const version = await this.versionRepository.findOne({
			where: { id: versionId, compositionId },
		});
		if (!version) {
			throw new NotFoundException(
				`Version ${versionId} not found in composition ${compositionId}`,
			);
		}
		return version;
	}

	// ─── Private Helpers ────────────────────────────────────────────────────────

	private validateVersionDto(dto: CreateCompositionVersionDto): void {
		switch (dto.mode) {
			case CompositionVersionMode.UPLOAD:
				if (!dto.backgroundImage) {
					throw new BadRequestException(
						'Upload mode requires backgroundImage',
					);
				}
				break;
			case CompositionVersionMode.GENERATE:
				if (!dto.prompt) {
					throw new BadRequestException(
						'Generate mode requires prompt',
					);
				}
				break;
			case CompositionVersionMode.STITCH:
				if (!dto.prompt || !dto.boundingBox || !dto.backgroundImage) {
					throw new BadRequestException(
						'Stitch mode requires prompt, boundingBox, and backgroundImage',
					);
				}
				break;
			case CompositionVersionMode.INPAINT:
				if (!dto.prompt || !dto.maskImage || !dto.backgroundImage) {
					throw new BadRequestException(
						'Inpaint mode requires prompt, maskImage, and backgroundImage',
					);
				}
				break;
		}
	}

	private async processVersion(
		organizationId: string,
		compositionId: string,
		version: CompositionVersion,
		dto: CreateCompositionVersionDto,
	): Promise<void> {
		try {
			let result: GeneratedImageResult | null = null;
			let imageBuffer: Buffer | null = null;

			this.logger.log(
				`[VERSION_PROCESS] VersionId: ${version.id} | Mode: ${dto.mode} | ` +
					`Prompt: "${(dto.prompt ?? '').substring(0, 100)}" | ` +
					`HasBackgroundImage: ${!!dto.backgroundImage} (${dto.backgroundImage ? Math.round((dto.backgroundImage.length * 0.75) / 1024) : 0}KB) | ` +
					`HasMaskImage: ${!!dto.maskImage} (${dto.maskImage ? Math.round((dto.maskImage.length * 0.75) / 1024) : 0}KB) | ` +
					`HasBoundingBox: ${!!dto.boundingBox}`,
			);

			switch (dto.mode) {
				case CompositionVersionMode.UPLOAD: {
					imageBuffer = Buffer.from(dto.backgroundImage!, 'base64');
					this.logger.log(
						`[VERSION_UPLOAD] Decoded buffer size: ${imageBuffer.length} bytes`,
					);
					break;
				}
				case CompositionVersionMode.GENERATE: {
					this.logger.log(
						`[VERSION_GENERATE] Calling gemini generateImage...`,
					);
					result = await this.geminiImageService.generateImage(
						dto.prompt!,
					);
					imageBuffer = result.imageData;
					this.logger.log(
						`[VERSION_GENERATE] Result: ${imageBuffer.length} bytes | MimeType: ${result.mimeType}`,
					);
					break;
				}
				case CompositionVersionMode.STITCH: {
					const bgBuffer = Buffer.from(
						dto.backgroundImage!,
						'base64',
					);
					this.logger.log(
						`[VERSION_STITCH] Background buffer: ${bgBuffer.length} bytes | BBox: ${JSON.stringify(dto.boundingBox)}`,
					);
					result = await this.geminiImageService.generateInRegion(
						dto.prompt!,
						bgBuffer,
						dto.boundingBox!,
					);
					imageBuffer = result.imageData;
					this.logger.log(
						`[VERSION_STITCH] Result: ${imageBuffer.length} bytes | MimeType: ${result.mimeType}`,
					);
					break;
				}
				case CompositionVersionMode.INPAINT: {
					this.logger.log(
						`[VERSION_INPAINT] BackgroundBase64: ${dto.backgroundImage!.length} chars | ` +
							`MaskBase64: ${dto.maskImage!.length} chars | ` +
							`HasBoundingBox: ${!!dto.boundingBox}`,
					);
					result = await this.geminiImageService.inpaintImage(
						dto.backgroundImage!,
						dto.maskImage!,
						dto.prompt!,
						undefined,
						dto.boundingBox,
					);
					imageBuffer = result.imageData;
					this.logger.log(
						`[VERSION_INPAINT] Result: ${imageBuffer.length} bytes | MimeType: ${result.mimeType}`,
					);
					break;
				}
			}

			if (!imageBuffer) {
				throw new Error('No image data produced');
			}

			// Save debug output for composition editor
			if (this.debugOutput.isEnabled()) {
				const dir = this.debugOutput.getCompositionDir(version.id);
				if (dir) {
					this.debugOutput.saveFile(
						dir,
						'metadata.json',
						JSON.stringify(
							{
								versionId: version.id,
								compositionId,
								mode: dto.mode,
								prompt: dto.prompt,
								boundingBox: dto.boundingBox,
								hasMask: !!dto.maskImage,
								hasBackground: !!dto.backgroundImage,
								timestamp: new Date().toISOString(),
							},
							null,
							2,
						),
					);

					if (dto.prompt) {
						this.debugOutput.saveFile(
							dir,
							'prompt.txt',
							dto.prompt,
						);
					}

					if (dto.backgroundImage) {
						this.debugOutput.saveFile(
							dir,
							'01-background.jpg',
							Buffer.from(dto.backgroundImage, 'base64'),
						);
					}

					if (dto.maskImage) {
						this.debugOutput.saveFile(
							dir,
							'02-mask.png',
							Buffer.from(dto.maskImage, 'base64'),
						);
					}

					if (result?.debugData) {
						for (const [key, value] of Object.entries(
							result.debugData,
						)) {
							if (Buffer.isBuffer(value)) {
								const ext =
									key.includes('mask') ||
									key.includes('Mask') ||
									key.includes('tile') ||
									key.includes('Tile')
										? 'png'
										: 'jpg';
								this.debugOutput.saveFile(
									dir,
									`${key}.${ext}`,
									value,
								);
							} else if (typeof value === 'string') {
								this.debugOutput.saveFile(
									dir,
									`${key}.txt`,
									value,
								);
							} else {
								this.debugOutput.saveFile(
									dir,
									`${key}.json`,
									JSON.stringify(value, null, 2),
								);
							}
						}
					}

					this.debugOutput.saveFile(
						dir,
						'06-final-result.png',
						imageBuffer,
					);
				}
			}

			// Get image dimensions
			const dimensions = await getImageDimensions(imageBuffer);

			// Upload to S3
			const s3Folder = `compositions/${organizationId}/${compositionId}/`;
			const s3FileName = `${uuidv4()}.jpg`;
			const s3Key = `${s3Folder}${s3FileName}`;
			await S3.upload(
				imageBuffer,
				s3FileName,
				'image/jpeg',
				s3Folder,
				false,
				'private',
			);

			// Update version record
			await this.versionRepository.update(version.id, {
				baseImageS3Key: s3Key,
				imageWidth: dimensions.width,
				imageHeight: dimensions.height,
				status: CompositionVersionStatus.SUCCESS,
			});

			// Update composition thumbnail
			await this.compositionRepository.update(compositionId, {
				thumbnailS3Key: s3Key,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`Version processing failed: ${errorMessage}`,
				error instanceof Error ? error.stack : undefined,
			);
			try {
				await this.versionRepository.update(version.id, {
					status: CompositionVersionStatus.FAILED,
					errorMessage: errorMessage.slice(0, 2000),
				});
			} catch (updateError) {
				this.logger.error(
					`Failed to mark version ${version.id} as FAILED: ${updateError instanceof Error ? updateError.message : 'Unknown'}`,
				);
			}
		}
	}
}
