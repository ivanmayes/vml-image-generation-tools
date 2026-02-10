import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
	Unique,
} from 'typeorm';

import { Composition, CanvasState } from './composition.entity';

export enum CompositionVersionStatus {
	PROCESSING = 'processing',
	SUCCESS = 'success',
	FAILED = 'failed',
}

@Entity('composition_versions')
@Index(['compositionId'])
@Unique(['compositionId', 'versionNumber'])
export class CompositionVersion {
	[key: string]: unknown;

	constructor(value?: Partial<CompositionVersion>) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid', { nullable: true })
	compositionId?: string;

	@ManyToOne(() => Composition, (c) => c.versions, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'compositionId' })
	composition?: Composition;

	@Column('uuid', { nullable: true })
	createdBy?: string;

	@Column('varchar', { nullable: true })
	baseImageS3Key?: string;

	@Column('jsonb', { nullable: true })
	canvasStateSnapshot?: CanvasState | null;

	@Column('text', { nullable: true })
	prompt?: string;

	@Column('int')
	versionNumber!: number;

	@Column('int', { nullable: true })
	imageWidth?: number;

	@Column('int', { nullable: true })
	imageHeight?: number;

	@Column({
		type: 'enum',
		enum: CompositionVersionStatus,
		default: CompositionVersionStatus.PROCESSING,
	})
	status!: CompositionVersionStatus;

	@Column('text', { nullable: true })
	errorMessage?: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	public toPublic() {
		return {
			id: this.id,
			compositionId: this.compositionId,
			createdBy: this.createdBy,
			baseImageS3Key: this.baseImageS3Key,
			canvasStateSnapshot: this.canvasStateSnapshot,
			prompt: this.prompt,
			versionNumber: this.versionNumber,
			imageWidth: this.imageWidth,
			imageHeight: this.imageHeight,
			status: this.status,
			errorMessage: this.errorMessage,
			createdAt: this.createdAt,
		};
	}
}
