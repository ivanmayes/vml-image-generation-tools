import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, FindManyOptions, In } from 'typeorm';
import * as AWS from 'aws-sdk';
import { v4 as uuid } from 'uuid';

import {
	GenerationRequest,
	GenerationRequestStatus,
	CompletionReason,
	GeneratedImage,
	IterationSnapshot,
	RequestCosts,
	GenerationMode,
} from '../entities';

@Injectable()
export class GenerationRequestService {
	private readonly s3: AWS.S3;

	constructor(
		@InjectRepository(GenerationRequest)
		private readonly requestRepository: Repository<GenerationRequest>,
		@InjectRepository(GeneratedImage)
		private readonly imageRepository: Repository<GeneratedImage>,
	) {
		this.s3 = new AWS.S3({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			region: process.env.AWS_REGION || 'us-east-1',
		});
	}

	public async find(options: FindManyOptions<GenerationRequest>) {
		return this.requestRepository.find(options);
	}

	public async findOne(options: FindOneOptions<GenerationRequest>) {
		return this.requestRepository.findOne(options);
	}

	public async create(request: Partial<GenerationRequest>) {
		const entity = this.requestRepository.create(request);
		return this.requestRepository.save(entity);
	}

	public async findByOrganization(
		organizationId: string,
		status?: GenerationRequestStatus,
		limit: number = 50,
		offset: number = 0,
		projectId?: string,
		spaceId?: string,
	) {
		const qb = this.requestRepository
			.createQueryBuilder('request')
			.where('request.organizationId = :organizationId', {
				organizationId,
			})
			.orderBy('request.createdAt', 'DESC')
			.take(limit)
			.skip(offset);

		if (status) {
			qb.andWhere('request.status = :status', { status });
		}

		if (projectId) {
			qb.andWhere('request.projectId = :projectId', { projectId });
		}

		if (spaceId) {
			qb.andWhere('request.spaceId = :spaceId', { spaceId });
		}

		return qb.getMany();
	}

	public async getWithImages(id: string, organizationId: string) {
		return this.requestRepository.findOne({
			where: { id, organizationId },
			relations: ['images'],
		});
	}

	public async updateStatus(
		id: string,
		status: GenerationRequestStatus,
		additionalData?: Partial<GenerationRequest>,
	) {
		const request = await this.requestRepository.findOne({ where: { id } });

		if (!request) {
			throw new NotFoundException('Generation request not found');
		}

		request.status = status;

		if (additionalData) {
			Object.assign(request, additionalData);
		}

		if (
			status === GenerationRequestStatus.COMPLETED ||
			status === GenerationRequestStatus.FAILED ||
			status === GenerationRequestStatus.CANCELLED
		) {
			request.completedAt = new Date();
		}

		return this.requestRepository.save(request);
	}

	public async addIteration(id: string, iteration: IterationSnapshot) {
		const request = await this.requestRepository.findOne({ where: { id } });

		if (!request) {
			throw new NotFoundException('Generation request not found');
		}

		// Ensure iterations array exists (handles potential null from legacy data)
		if (!request.iterations) {
			request.iterations = [];
		}

		request.iterations.push(iteration);
		request.currentIteration = iteration.iterationNumber;

		return this.requestRepository.save(request);
	}

	public async updateCosts(id: string, costs: Partial<RequestCosts>) {
		const request = await this.requestRepository.findOne({ where: { id } });

		if (!request) {
			throw new NotFoundException('Generation request not found');
		}

		// Ensure costs object exists (handles potential null from legacy data)
		const currentCosts = request.costs ?? {
			llmTokens: 0,
			imageGenerations: 0,
			embeddingTokens: 0,
			totalEstimatedCost: 0,
		};

		request.costs = {
			llmTokens: currentCosts.llmTokens + (costs.llmTokens ?? 0),
			imageGenerations:
				currentCosts.imageGenerations + (costs.imageGenerations ?? 0),
			embeddingTokens:
				currentCosts.embeddingTokens + (costs.embeddingTokens ?? 0),
			totalEstimatedCost:
				currentCosts.totalEstimatedCost +
				(costs.totalEstimatedCost ?? 0),
		};

		return this.requestRepository.save(request);
	}

	public async complete(
		id: string,
		finalImageId: string,
		completionReason: CompletionReason,
	) {
		return this.updateStatus(id, GenerationRequestStatus.COMPLETED, {
			finalImageId,
			completionReason,
		});
	}

	public async fail(id: string, errorMessage: string) {
		return this.updateStatus(id, GenerationRequestStatus.FAILED, {
			errorMessage,
			completionReason: CompletionReason.ERROR,
		});
	}

	public async cancel(id: string) {
		return this.updateStatus(id, GenerationRequestStatus.CANCELLED, {
			completionReason: CompletionReason.CANCELLED,
		});
	}

	// Image methods
	public async createImage(image: Partial<GeneratedImage>) {
		const entity = this.imageRepository.create(image);
		return this.imageRepository.save(entity);
	}

	public async getImage(id: string) {
		return this.imageRepository.findOne({ where: { id } });
	}

	public async getImagesByRequest(requestId: string) {
		return this.imageRepository.find({
			where: { requestId },
			order: { createdAt: 'DESC' },
		});
	}

	public async getImagesByIteration(
		requestId: string,
		iterationNumber: number,
	) {
		return this.imageRepository.find({
			where: { requestId, iterationNumber },
			order: { createdAt: 'ASC' },
		});
	}

	public async getPendingRequests(limit: number = 10) {
		return this.requestRepository.find({
			where: { status: GenerationRequestStatus.PENDING },
			order: { createdAt: 'ASC' },
			take: limit,
		});
	}

	/**
	 * Find images across all requests for an organization, ordered by newest first
	 */
	public async findImagesByOrganization(
		organizationId: string,
		limit: number = 50,
		offset: number = 0,
	) {
		return this.imageRepository
			.createQueryBuilder('image')
			.innerJoin('image.request', 'request')
			.where('request.organizationId = :organizationId', {
				organizationId,
			})
			.orderBy('image.createdAt', 'DESC')
			.take(limit)
			.skip(offset)
			.getMany();
	}

	/**
	 * Batch-fetch images by IDs, returning only id and s3Url
	 */
	public async getImagesByIds(
		ids: string[],
	): Promise<Pick<GeneratedImage, 'id' | 's3Url'>[]> {
		if (!ids.length) return [];
		return this.imageRepository.find({
			where: { id: In(ids) },
			select: ['id', 's3Url'],
		});
	}

	public async getActiveRequests() {
		return this.requestRepository.find({
			where: {
				status: In([
					GenerationRequestStatus.OPTIMIZING,
					GenerationRequestStatus.GENERATING,
					GenerationRequestStatus.EVALUATING,
				]),
			},
		});
	}

	/**
	 * Prepare a terminal request for continuation by resetting state and extending iterations budget
	 */
	public async prepareForContinuation(
		id: string,
		additionalIterations: number,
		judgeIds?: string[],
		promptOverride?: string,
		generationMode?: GenerationMode,
	): Promise<GenerationRequest> {
		const request = await this.requestRepository.findOne({ where: { id } });

		if (!request) {
			throw new NotFoundException('Generation request not found');
		}

		// Reset terminal state (use null, not undefined — TypeORM skips undefined on save)
		request.status = GenerationRequestStatus.PENDING;
		request.completionReason = null as any;
		request.completedAt = null as any;
		request.errorMessage = null as any;
		request.finalImageId = null as any;

		// Extend iterations budget from current position
		request.maxIterations =
			(request.currentIteration ?? 0) + additionalIterations;

		// Swap judges if provided
		if (judgeIds?.length) {
			request.judgeIds = judgeIds;
		}

		// Set prompt override for next iteration
		if (promptOverride) {
			request.initialPrompt = promptOverride;
		}

		// Switch mode if provided
		if (generationMode) {
			request.generationMode = generationMode;
		}

		return this.requestRepository.save(request);
	}

	/**
	 * Update negative prompts for a request (used for accumulating failures)
	 */
	public async updateNegativePrompts(
		id: string,
		negativePrompts: string,
	): Promise<GenerationRequest> {
		const request = await this.requestRepository.findOne({ where: { id } });

		if (!request) {
			throw new NotFoundException('Generation request not found');
		}

		request.negativePrompts = negativePrompts;
		return this.requestRepository.save(request);
	}

	/**
	 * Upload an image to S3 for compliance evaluation (not tied to a generation request)
	 */
	public async uploadComplianceImage(
		organizationId: string,
		buffer: Buffer,
		mimeType: string,
		ext: string,
	): Promise<string> {
		const id = uuid();
		const s3Key = `compliance-images/${organizationId}/${id}.${ext}`;

		await this.s3
			.putObject({
				Bucket: process.env.AWS_S3_BUCKET!,
				Key: s3Key,
				Body: buffer,
				ContentType: mimeType,
			})
			.promise();

		return `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${s3Key}`;
	}
}
