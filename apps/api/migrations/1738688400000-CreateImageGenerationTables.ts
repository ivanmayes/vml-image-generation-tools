import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImageGenerationTables1738688400000
	implements MigrationInterface
{
	name = 'CreateImageGenerationTables1738688400000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Enable pgvector extension if not already enabled
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

		// Create enum types
		await queryRunner.query(`
			CREATE TYPE "generation_request_status_enum" AS ENUM (
				'pending', 'optimizing', 'generating', 'evaluating', 'completed', 'failed', 'cancelled'
			)
		`);

		await queryRunner.query(`
			CREATE TYPE "completion_reason_enum" AS ENUM (
				'SUCCESS', 'MAX_RETRIES_REACHED', 'DIMINISHING_RETURNS', 'CANCELLED', 'ERROR'
			)
		`);

		// Create image_generation_agents table
		await queryRunner.query(`
			CREATE TABLE "image_generation_agents" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"organizationId" uuid NOT NULL,
				"name" text NOT NULL,
				"systemPrompt" text NOT NULL,
				"evaluationCategories" text,
				"optimizationWeight" integer NOT NULL DEFAULT 50,
				"scoringWeight" integer NOT NULL DEFAULT 50,
				"ragConfig" jsonb NOT NULL DEFAULT '{"topK": 5, "similarityThreshold": 0.7}',
				"templateId" text,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"deletedAt" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_image_generation_agents" PRIMARY KEY ("id"),
				CONSTRAINT "FK_image_generation_agents_organization" FOREIGN KEY ("organizationId")
					REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_agents_organizationId" ON "image_generation_agents" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_agents_organizationId_deletedAt" ON "image_generation_agents" ("organizationId", "deletedAt")`,
		);

		// Create image_generation_agent_documents table
		await queryRunner.query(`
			CREATE TABLE "image_generation_agent_documents" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"agentId" uuid NOT NULL,
				"filename" text NOT NULL,
				"mimeType" text NOT NULL,
				"s3Key" text NOT NULL,
				"version" integer NOT NULL DEFAULT 1,
				"chunkCount" integer NOT NULL DEFAULT 0,
				"chunks" jsonb NOT NULL DEFAULT '[]',
				"metadata" jsonb,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_image_generation_agent_documents" PRIMARY KEY ("id"),
				CONSTRAINT "FK_image_generation_agent_documents_agent" FOREIGN KEY ("agentId")
					REFERENCES "image_generation_agents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_agent_documents_agentId" ON "image_generation_agent_documents" ("agentId")`,
		);

		// Create image_generation_requests table
		await queryRunner.query(`
			CREATE TABLE "image_generation_requests" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"organizationId" uuid NOT NULL,
				"brief" text NOT NULL,
				"referenceImageUrls" jsonb,
				"negativePrompts" text,
				"judgeIds" uuid[] NOT NULL,
				"imageParams" jsonb NOT NULL DEFAULT '{"imagesPerGeneration": 1}',
				"threshold" integer NOT NULL DEFAULT 75,
				"maxIterations" integer NOT NULL DEFAULT 5,
				"status" "generation_request_status_enum" NOT NULL DEFAULT 'pending',
				"currentIteration" integer NOT NULL DEFAULT 0,
				"finalImageId" uuid,
				"completionReason" "completion_reason_enum",
				"iterations" jsonb NOT NULL DEFAULT '[]',
				"costs" jsonb NOT NULL DEFAULT '{"llmTokens": 0, "imageGenerations": 0, "embeddingTokens": 0, "totalEstimatedCost": 0}',
				"errorMessage" text,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"completedAt" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_image_generation_requests" PRIMARY KEY ("id"),
				CONSTRAINT "FK_image_generation_requests_organization" FOREIGN KEY ("organizationId")
					REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_requests_organizationId" ON "image_generation_requests" ("organizationId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_requests_status" ON "image_generation_requests" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_requests_organizationId_status" ON "image_generation_requests" ("organizationId", "status")`,
		);

		// Create image_generation_images table
		await queryRunner.query(`
			CREATE TABLE "image_generation_images" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"requestId" uuid NOT NULL,
				"iterationNumber" integer NOT NULL,
				"s3Url" text NOT NULL,
				"s3Key" text NOT NULL,
				"promptUsed" text NOT NULL,
				"generationParams" jsonb NOT NULL DEFAULT '{}',
				"width" integer,
				"height" integer,
				"mimeType" text NOT NULL DEFAULT 'image/jpeg',
				"fileSizeBytes" integer,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_image_generation_images" PRIMARY KEY ("id"),
				CONSTRAINT "FK_image_generation_images_request" FOREIGN KEY ("requestId")
					REFERENCES "image_generation_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_images_requestId" ON "image_generation_images" ("requestId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_image_generation_images_requestId_iterationNumber" ON "image_generation_images" ("requestId", "iterationNumber")`,
		);

		// Create image_generation_prompt_optimizer table (singleton)
		await queryRunner.query(`
			CREATE TABLE "image_generation_prompt_optimizer" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
				"systemPrompt" text NOT NULL DEFAULT 'You are an expert prompt optimizer for AI image generation.

Your task is to synthesize feedback from multiple judge agents into a single, optimized image generation prompt.

Guidelines:
1. Combine suggestions from all judges while resolving any conflicts
2. Prioritize feedback based on judge weights (higher weight = more influence)
3. Output ONLY the optimized prompt - no explanations or rationale
4. Preserve the core intent from the original brief
5. Incorporate specific technical details (lighting, composition, style) when suggested
6. If there was previous feedback, address the issues mentioned

The output should be a clear, detailed prompt ready for image generation.',
				"config" jsonb NOT NULL DEFAULT '{"model": "gemini-3-flash-preview", "temperature": 0.7}',
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_image_generation_prompt_optimizer" PRIMARY KEY ("id")
			)
		`);

		// Insert default prompt optimizer configuration
		await queryRunner.query(`
			INSERT INTO "image_generation_prompt_optimizer" ("id") VALUES (uuid_generate_v4())
		`);

		// Create HNSW index for vector similarity search on chunks
		// Using GIN index on JSONB for now since chunks contain embeddings as JSON arrays
		// For production, consider a separate table with native vector column
		await queryRunner.query(`
			CREATE INDEX "IDX_image_generation_agent_documents_chunks_gin"
			ON "image_generation_agent_documents" USING GIN ("chunks")
		`);

		// Create function for cosine similarity search on JSONB embeddings
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION search_document_chunks(
				p_agent_id uuid,
				p_query_embedding float8[],
				p_top_k integer DEFAULT 5,
				p_similarity_threshold float8 DEFAULT 0.7
			)
			RETURNS TABLE (
				document_id uuid,
				chunk_id text,
				chunk_content text,
				chunk_index integer,
				similarity float8
			)
			LANGUAGE plpgsql
			AS $$
			DECLARE
				query_vec vector;
			BEGIN
				-- Convert float8 array to vector type
				query_vec := p_query_embedding::vector;

				RETURN QUERY
				SELECT
					d.id as document_id,
					(chunk->>'id')::text as chunk_id,
					(chunk->>'content')::text as chunk_content,
					(chunk->>'chunkIndex')::integer as chunk_index,
					1 - (
						(chunk->'embedding')::text::vector <=> query_vec
					) as similarity
				FROM image_generation_agent_documents d,
					jsonb_array_elements(d.chunks) as chunk
				WHERE d."agentId" = p_agent_id
				AND 1 - ((chunk->'embedding')::text::vector <=> query_vec) >= p_similarity_threshold
				ORDER BY similarity DESC
				LIMIT p_top_k;
			END;
			$$
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop function
		await queryRunner.query(
			`DROP FUNCTION IF EXISTS search_document_chunks`,
		);

		// Drop indexes
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_image_generation_agent_documents_chunks_gin"`,
		);

		// Drop tables in reverse order of creation (respecting foreign keys)
		await queryRunner.query(
			`DROP TABLE IF EXISTS "image_generation_prompt_optimizer"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "image_generation_images"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "image_generation_requests"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "image_generation_agent_documents"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "image_generation_agents"`,
		);

		// Drop enum types
		await queryRunner.query(`DROP TYPE IF EXISTS "completion_reason_enum"`);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "generation_request_status_enum"`,
		);

		// Note: We don't drop the vector extension as it might be used elsewhere
	}
}
