# RAG Documents

RAG (Retrieval-Augmented Generation) allows judge agents to reference uploaded documents during evaluation. Instead of relying solely on the agent's system prompt, RAG injects relevant excerpts from brand guidelines, product specifications, or quality standards directly into the evaluation context.

## Why RAG?

A system prompt can only hold so much context. If you have a 50-page brand guidelines PDF, you can't paste it all into the system prompt. RAG solves this by:

1. Chunking the document into smaller pieces
2. Creating vector embeddings for each chunk
3. At evaluation time, searching for chunks relevant to the current brief
4. Injecting only the relevant chunks into the evaluation prompt

This means a "Brand Compliance" judge can reference specific brand guidelines about logo placement, color codes, or typography — without needing the entire document in every evaluation.

## Document Processing Pipeline

**Source:** `apps/api/src/image-generation/document-processor/document-processor.service.ts`

### Upload

When you upload a document to an agent via `POST /organization/:orgId/agents/:id/documents`:

1. The file is uploaded to S3 at `agent-documents/{orgId}/{agentId}/{timestamp}-{filename}`
2. An `AgentDocument` entity is created with `processingStatus: 'pending'`
3. The document processing job is triggered

### Processing

The `DocumentProcessorService.processDocument()` handles:

1. **Parse** — Extracts text content from the document
   - **PDF** — Uses `pdf-parse` library
   - **DOCX** — Uses `mammoth` library
   - Other formats may be supported in the future

2. **Chunk** — Splits the text into overlapping chunks
   - **Chunk size:** 1000 characters
   - **Overlap:** 200 characters
   - Overlap ensures that context at chunk boundaries isn't lost

3. **Embed** — Creates vector embeddings for each chunk
   - Embeddings are stored alongside the chunk content in the `AgentDocument` entity

### Search

At evaluation time, `searchChunks(agentId, query, topK, threshold)`:

1. Creates an embedding for the search query (brief + prompt)
2. Performs cosine similarity search against all chunks for that agent
3. Returns the top K chunks that exceed the similarity threshold
4. These chunks are injected as "Reference Guidelines" in the evaluation prompt

## RAG Configuration

Each agent has a `ragConfig` field that controls search behavior:

```json
{
  "topK": 5,
  "similarityThreshold": 0.7
}
```

| Field                 | Default | Description                                              |
| --------------------- | ------- | -------------------------------------------------------- |
| `topK`                | 5       | Maximum number of chunks to retrieve per search          |
| `similarityThreshold` | 0.7     | Minimum cosine similarity score (0–1) to include a chunk |

### Tuning RAG

- **Increase `topK`** — When you want more context (e.g., complex brand guidelines that span many topics)
- **Decrease `topK`** — When you want more focused context (e.g., a short product spec)
- **Increase `similarityThreshold`** — When you want only highly relevant chunks (reduces noise)
- **Decrease `similarityThreshold`** — When the document content is tangentially related to the brief

## How RAG Context Appears in Prompts

### In Evaluation Prompts

When a judge evaluates an image, relevant chunks appear as:

```
Reference Guidelines:
[chunk 1 content]

[chunk 2 content]

[chunk 3 content]
```

This section appears after the brief and prompt, giving the judge specific reference material to evaluate against.

### In Optimization Context

The `PromptOptimizerService.getAgentRagContext()` also searches all agents' documents to provide reference context during prompt optimization:

```
### Context from Brand Compliance Judge's documents:
[relevant brand guideline excerpts]

### Context from Product Accuracy Judge's documents:
[relevant product specification excerpts]
```

This helps the optimizer generate prompts that align with the reference materials.

## Supported File Types

| Format | Library     | Notes                                              |
| ------ | ----------- | -------------------------------------------------- |
| PDF    | `pdf-parse` | Text extraction only (no OCR for image-based PDFs) |
| DOCX   | `mammoth`   | Extracts text content, ignores formatting          |

## Managing Documents via API

Documents are managed through the agent endpoints:

| Method                                | Path                                             | Description |
| ------------------------------------- | ------------------------------------------------ | ----------- |
| `GET /agents/:id/documents`           | List all documents for an agent                  |
| `POST /agents/:id/documents`          | Upload a new document (multipart file upload)    |
| `DELETE /agents/:id/documents/:docId` | Delete a document (removes from S3 and database) |

### Upload Example

```bash
curl -X POST \
  http://localhost:8002/organization/{orgId}/agents/{agentId}/documents \
  -H "Authorization: Bearer {token}" \
  -F "file=@brand-guidelines.pdf"
```

Response:

```json
{
  "status": "success",
  "message": "Document uploaded. Processing will begin shortly.",
  "data": {
    "id": "uuid",
    "filename": "brand-guidelines.pdf",
    "mimeType": "application/pdf",
    "metadata": {
      "fileSize": 1048576,
      "processingStatus": "pending"
    }
  }
}
```

Processing happens asynchronously. Once complete, the document's chunks are available for RAG searches.
