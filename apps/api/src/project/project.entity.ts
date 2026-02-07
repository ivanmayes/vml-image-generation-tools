import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	OneToMany,
	DeleteDateColumn,
	CreateDateColumn,
} from 'typeorm';

import { Organization } from '../organization/organization.entity';
import { Space } from '../space/space.entity';
import { GenerationRequest } from '../image-generation/entities/generation-request.entity';

/**
 * Project entity — groups multiple tool types (image generation, etc.) under one hub.
 * Belongs to an organization and optionally to a space (workspace).
 */
@Entity('projects')
@Index(['organizationId'])
@Index(['organizationId', 'spaceId'])
@Index(['organizationId', 'deletedAt'])
export class Project {
	[key: string]: unknown;

	constructor(value?: Partial<Project>) {
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
	organizationId!: string;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'organizationId' })
	organization!: Organization;

	@Column('uuid', { nullable: true })
	spaceId?: string;

	@ManyToOne(() => Space, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'spaceId' })
	space?: Space;

	@Column('text')
	name!: string;

	@Column('text', { nullable: true })
	description?: string;

	@Column('jsonb', { default: {} })
	settings!: Record<string, any>;

	@OneToMany(() => GenerationRequest, (request) => request.project, {
		eager: false,
	})
	requests?: GenerationRequest[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@DeleteDateColumn({ type: 'timestamptz', nullable: true })
	deletedAt?: Date | null;

	public toPublic() {
		return {
			id: this.id,
			organizationId: this.organizationId,
			spaceId: this.spaceId,
			name: this.name,
			description: this.description,
			settings: this.settings,
			createdAt: this.createdAt,
		};
	}
}
