import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
} from 'typeorm';

import { GenerationRequest } from './generation-request.entity';

/**
 * Generation parameters used for the image
 */
export interface GenerationParams {
	aspectRatio?: string;
	quality?: string; // "1K", "2K", "4K"
	model?: string;
	referenceImageUrls?: string[];
}

/**
 * GeneratedImage entity - all images generated during requests.
 * Each image is associated with a specific iteration of a request.
 */
@Entity('image_generation_images')
@Index(['requestId'])
@Index(['requestId', 'iterationNumber'])
export class GeneratedImage {
	[key: string]: unknown;

	constructor(value?: Partial<GeneratedImage>) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid')
	requestId!: string;

	@ManyToOne(() => GenerationRequest, (request) => request.images, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'requestId' })
	request!: GenerationRequest;

	@Column('int')
	iterationNumber!: number;

	@Column('text')
	s3Url!: string;

	@Column('text')
	s3Key!: string;

	@Column('text')
	promptUsed!: string;

	@Column('jsonb', { default: {} })
	generationParams!: GenerationParams;

	@Column('int', { nullable: true })
	width?: number;

	@Column('int', { nullable: true })
	height?: number;

	@Column('text', { default: 'image/jpeg' })
	mimeType!: string;

	@Column('int', { nullable: true })
	fileSizeBytes?: number;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	/**
	 * Public representation
	 */
	public toPublic() {
		return {
			id: this.id,
			requestId: this.requestId,
			iterationNumber: this.iterationNumber,
			s3Url: this.s3Url,
			promptUsed: this.promptUsed,
			generationParams: this.generationParams,
			width: this.width,
			height: this.height,
			mimeType: this.mimeType,
			createdAt: this.createdAt,
		};
	}
}
