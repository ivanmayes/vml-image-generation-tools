import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as mammoth from 'mammoth';

import { AIService } from '../../ai/ai.service';
import { AgentService } from '../../agent/agent.service';
import { DocumentChunk } from '../../agent/agent-document.entity';

interface ParsedDocument {
	text: string;
	metadata?: {
		pageCount?: number;
	};
}

@Injectable()
export class DocumentProcessorService {
	private readonly logger = new Logger(DocumentProcessorService.name);

	// Chunk configuration
	private readonly CHUNK_SIZE = 1000;
	private readonly CHUNK_OVERLAP = 200;

	constructor(
		private readonly aiService: AIService,
		private readonly agentService: AgentService,
	) {}

	/**
	 * Process a document buffer and generate embeddings
	 */
	public async processDocument(
		documentId: string,
		buffer: Buffer,
		mimeType: string,
	): Promise<void> {
		const startTime = Date.now();
		try {
			this.logger.log(
				`[DOC_PROCESS_START] DocID: ${documentId} | ` +
					`MimeType: ${mimeType} | BufferSize: ${buffer.length} bytes`,
			);

			// Parse document content
			const parseStartTime = Date.now();
			const parsed = await this.parseDocument(buffer, mimeType);
			this.logger.debug(
				`[DOC_PARSED] DocID: ${documentId} | ` +
					`TextLength: ${parsed.text.length} chars | ` +
					`PageCount: ${parsed.metadata?.pageCount ?? 'N/A'} | ` +
					`Time: ${Date.now() - parseStartTime}ms`,
			);

			// Split into chunks
			const chunkStartTime = Date.now();
			const textChunks = this.splitIntoChunks(parsed.text);
			this.logger.debug(
				`[DOC_CHUNKED] DocID: ${documentId} | ` +
					`ChunkCount: ${textChunks.length} | ` +
					`ChunkSize: ${this.CHUNK_SIZE} | ` +
					`Overlap: ${this.CHUNK_OVERLAP} | ` +
					`Time: ${Date.now() - chunkStartTime}ms`,
			);

			// Generate embeddings for each chunk
			const embedStartTime = Date.now();
			const chunks = await this.generateChunkEmbeddings(textChunks);
			this.logger.debug(
				`[DOC_EMBEDDED] DocID: ${documentId} | ` +
					`EmbeddingsGenerated: ${chunks.length} | ` +
					`Time: ${Date.now() - embedStartTime}ms`,
			);

			// Update document with chunks
			await this.agentService.updateDocumentChunks(documentId, chunks);

			const totalTime = Date.now() - startTime;
			this.logger.log(
				`[DOC_PROCESS_COMPLETE] DocID: ${documentId} | ` +
					`Chunks: ${chunks.length} | ` +
					`TotalTime: ${totalTime}ms`,
			);
		} catch (error) {
			const totalTime = Date.now() - startTime;
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`[DOC_PROCESS_ERROR] DocID: ${documentId} | ` +
					`Error: ${message} | Time: ${totalTime}ms`,
			);
			await this.agentService.setDocumentProcessingError(
				documentId,
				message,
			);
			throw error;
		}
	}

	/**
	 * Parse document content based on mime type
	 */
	private async parseDocument(
		buffer: Buffer,
		mimeType: string,
	): Promise<ParsedDocument> {
		switch (mimeType) {
			case 'application/pdf':
				return this.parsePdf(buffer);
			case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
				return this.parseDocx(buffer);
			case 'text/plain':
				return { text: buffer.toString('utf-8') };
			default:
				throw new Error(`Unsupported document type: ${mimeType}`);
		}
	}

	/**
	 * Parse PDF document using pdf-parse
	 */
	private async parsePdf(buffer: Buffer): Promise<ParsedDocument> {
		const { PDFParse } = await import('pdf-parse');
		const pdf = new PDFParse({ data: buffer });
		try {
			const info = await pdf.getInfo();
			const textResult = await pdf.getText();
			return {
				text: textResult.text,
				metadata: {
					pageCount: info.total,
				},
			};
		} finally {
			await pdf.destroy();
		}
	}

	/**
	 * Parse DOCX document
	 */
	private async parseDocx(buffer: Buffer): Promise<ParsedDocument> {
		const result = await mammoth.extractRawText({ buffer });
		return {
			text: result.value,
		};
	}

	/**
	 * Split text into overlapping chunks
	 */
	private splitIntoChunks(text: string): string[] {
		const chunks: string[] = [];
		const cleanText = text.replace(/\s+/g, ' ').trim();

		// Handle empty documents
		if (!cleanText) {
			return [];
		}

		if (cleanText.length <= this.CHUNK_SIZE) {
			return [cleanText];
		}

		let start = 0;
		while (start < cleanText.length) {
			let end = start + this.CHUNK_SIZE;

			// Try to break at a sentence or word boundary
			if (end < cleanText.length) {
				const lastPeriod = cleanText.lastIndexOf('.', end);
				const lastSpace = cleanText.lastIndexOf(' ', end);

				if (lastPeriod > start + this.CHUNK_SIZE / 2) {
					end = lastPeriod + 1;
				} else if (lastSpace > start + this.CHUNK_SIZE / 2) {
					end = lastSpace;
				}
			}

			chunks.push(cleanText.slice(start, end).trim());
			start = end - this.CHUNK_OVERLAP;

			// Prevent infinite loop
			if (start >= cleanText.length - this.CHUNK_OVERLAP) {
				break;
			}
		}

		return chunks;
	}

	/**
	 * Generate embeddings for text chunks
	 */
	private async generateChunkEmbeddings(
		textChunks: string[],
	): Promise<DocumentChunk[]> {
		const chunks: DocumentChunk[] = [];

		// Process in batches to avoid rate limits
		const batchSize = 10;
		for (let i = 0; i < textChunks.length; i += batchSize) {
			const batch = textChunks.slice(i, i + batchSize);

			// Generate embeddings for the batch
			const response = await this.aiService.generateEmbedding({
				input: batch,
			});

			for (let j = 0; j < batch.length; j++) {
				chunks.push({
					id: uuidv4(),
					content: batch[j],
					embedding: response.embeddings[j],
					chunkIndex: i + j,
				});
			}
		}

		return chunks;
	}

	/**
	 * Search for relevant chunks using cosine similarity.
	 * Accepts documents directly to avoid re-fetching (documents should already be loaded on the agent).
	 */
	public async searchChunks(
		agentId: string,
		query: string,
		topK: number = 5,
		similarityThreshold: number = 0.7,
	): Promise<{ chunk: DocumentChunk; similarity: number }[]> {
		const startTime = Date.now();
		this.logger.debug(
			`[RAG_SEARCH_START] AgentID: ${agentId} | ` +
				`Query: "${query.substring(0, 50)}..." | ` +
				`TopK: ${topK} | Threshold: ${similarityThreshold}`,
		);

		// Generate query embedding
		const embedStartTime = Date.now();
		const response = await this.aiService.generateEmbedding({
			input: query,
		});
		const queryEmbedding = response.embeddings[0];
		this.logger.debug(
			`[RAG_QUERY_EMBEDDED] AgentID: ${agentId} | ` +
				`EmbeddingDim: ${queryEmbedding.length} | ` +
				`Time: ${Date.now() - embedStartTime}ms`,
		);

		// Get documents directly for this agent (agentId is already validated by caller)
		const documents = await this.agentService.getDocuments(agentId);

		if (!documents?.length) {
			this.logger.debug(
				`[RAG_SEARCH_EMPTY] AgentID: ${agentId} - No documents found`,
			);
			return [];
		}

		// Collect all chunks with their document context
		const allChunks: { chunk: DocumentChunk; documentId: string }[] = [];
		for (const doc of documents) {
			if (!doc.chunks?.length) continue;
			for (const chunk of doc.chunks) {
				allChunks.push({ chunk, documentId: doc.id });
			}
		}

		this.logger.debug(
			`[RAG_CHUNKS_COLLECTED] AgentID: ${agentId} | ` +
				`Documents: ${documents.length} | ` +
				`TotalChunks: ${allChunks.length}`,
		);

		// Calculate similarities
		const allResults = allChunks.map(({ chunk }) => ({
			chunk,
			similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding),
		}));

		const results = allResults
			.filter((result) => result.similarity >= similarityThreshold)
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, topK);

		const totalTime = Date.now() - startTime;
		this.logger.log(
			`[RAG_SEARCH_COMPLETE] AgentID: ${agentId} | ` +
				`ChunksSearched: ${allChunks.length} | ` +
				`ResultsFound: ${results.length} | ` +
				`AboveThreshold: ${allResults.filter((r) => r.similarity >= similarityThreshold).length} | ` +
				`TopSimilarity: ${results[0]?.similarity.toFixed(3) ?? 'N/A'} | ` +
				`Time: ${totalTime}ms`,
		);

		if (results.length > 0) {
			this.logger.debug(
				`[RAG_RESULTS] AgentID: ${agentId} | ` +
					`Similarities: [${results.map((r) => r.similarity.toFixed(3)).join(', ')}]`,
			);
		}

		return results;
	}

	/**
	 * Calculate cosine similarity between two vectors
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			throw new Error('Vectors must have the same length');
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}
}
