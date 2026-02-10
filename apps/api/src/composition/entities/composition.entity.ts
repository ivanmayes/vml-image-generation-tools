import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	OneToMany,
	CreateDateColumn,
	UpdateDateColumn,
	DeleteDateColumn,
} from 'typeorm';

import { Project } from '../../project/project.entity';

import { CompositionVersion } from './composition-version.entity';

/**
 * Canvas state is opaque to the API (frontend-owned FabricJS data).
 * We store it but don't parse it server-side.
 */
export interface CanvasState {
	version: string;
	objects: Record<string, unknown>[];
	[key: string]: unknown;
}

@Entity('compositions')
@Index(['organizationId'])
@Index(['projectId'])
@Index(['organizationId', 'projectId'])
@Index(['organizationId', 'deletedAt'])
export class Composition {
	[key: string]: unknown;

	constructor(value?: Partial<Composition>) {
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
	projectId?: string;

	@ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'projectId' })
	project?: Project;

	@Column('uuid')
	organizationId!: string;

	@Column('uuid', { nullable: true })
	createdBy?: string;

	@Column('varchar')
	name!: string;

	@Column('int', { default: 1024 })
	canvasWidth!: number;

	@Column('int', { default: 1024 })
	canvasHeight!: number;

	@Column('jsonb', { nullable: true })
	canvasState?: CanvasState | null;

	@Column('varchar', { nullable: true })
	thumbnailS3Key?: string;

	@OneToMany(() => CompositionVersion, (version) => version.composition, {
		eager: false,
	})
	versions?: CompositionVersion[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	@DeleteDateColumn({ type: 'timestamptz', nullable: true })
	deletedAt?: Date | null;

	public toPublic() {
		return {
			id: this.id,
			projectId: this.projectId,
			organizationId: this.organizationId,
			createdBy: this.createdBy,
			name: this.name,
			canvasWidth: this.canvasWidth,
			canvasHeight: this.canvasHeight,
			canvasState: this.canvasState,
			thumbnailS3Key: this.thumbnailS3Key,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
		};
	}
}
