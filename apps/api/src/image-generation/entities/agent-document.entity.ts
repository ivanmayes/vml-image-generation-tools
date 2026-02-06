import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
} from 'typeorm';

import { Agent } from './agent.entity';

/**
 * Document chunk with embedding for RAG retrieval
 */
export interface DocumentChunk {
	id: string;
	content: string;
	embedding: number[];
	chunkIndex: number;
	metadata?: {
		pageNumber?: number;
		sectionHeader?: string;
		sourceOffset?: number;
	};
}

/**
 * AgentDocument entity representing reference documents uploaded for a judge agent.
 * Chunks are stored as JSONB for simplicity (consolidated from separate table).
 * Embeddings use 1536 dimensions for OpenAI text-embedding-3-small.
 */
@Entity('image_generation_agent_documents')
@Index(['agentId'])
export class AgentDocument {
	[key: string]: unknown;

	constructor(value?: Partial<AgentDocument>) {
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
	agentId!: string;

	@ManyToOne(() => Agent, (agent) => agent.documents, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'agentId' })
	agent!: Agent;

	@Column('text')
	filename!: string;

	@Column('text')
	mimeType!: string;

	@Column('text')
	s3Key!: string;

	@Column('int', { default: 1 })
	version!: number;

	@Column('int', { default: 0 })
	chunkCount!: number;

	@Column('jsonb', { default: [] })
	chunks!: DocumentChunk[];

	@Column('jsonb', { nullable: true })
	metadata?: {
		fileSize?: number;
		pageCount?: number;
		processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
		processingError?: string;
	};

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	/**
	 * Public representation (excludes embeddings for size)
	 */
	public toPublic() {
		return {
			id: this.id,
			agentId: this.agentId,
			filename: this.filename,
			mimeType: this.mimeType,
			version: this.version,
			chunkCount: this.chunkCount,
			metadata: this.metadata,
			createdAt: this.createdAt,
		};
	}
}
