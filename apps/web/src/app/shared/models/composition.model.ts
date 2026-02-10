/**
 * Composition and version models with discriminated union types.
 * Version status uses discriminated unions to make impossible states unrepresentable.
 */

// Import DTOs from API - these are the source of truth for request payloads
export type { CreateCompositionDto } from '@api/composition/dtos';
export type { UpdateCompositionDto } from '@api/composition/dtos';
export type { CreateCompositionVersionDto } from '@api/composition/dtos';
export { CompositionVersionMode } from '@api/composition/dtos';

// ─── Composition ─────────────────────────────────────────────────────────────

export interface Composition {
	id: string;
	projectId?: string;
	organizationId: string;
	createdBy?: string;
	name: string;
	canvasWidth: number;
	canvasHeight: number;
	canvasState?: Record<string, unknown> | null;
	thumbnailS3Key?: string;
	createdAt: string;
	updatedAt: string;
}

// ─── Composition Version (discriminated union) ───────────────────────────────

interface CompositionVersionBase {
	id: string;
	compositionId: string;
	createdBy?: string;
	canvasStateSnapshot?: Record<string, unknown> | null;
	prompt?: string;
	versionNumber: number;
	createdAt: string;
}

export type CompositionVersion =
	| (CompositionVersionBase & { status: 'processing' })
	| (CompositionVersionBase & {
			status: 'success';
			baseImageS3Key: string;
			imageWidth: number;
			imageHeight: number;
	  })
	| (CompositionVersionBase & {
			status: 'failed';
			errorMessage?: string;
	  });

// ─── List Page State (discriminated union) ───────────────────────────────────

export type CompositionListState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'loaded'; compositions: Composition[]; total: number }
	| { status: 'error'; message: string };

// ─── API Response Types ──────────────────────────────────────────────────────

export interface CompositionListResponse {
	data: Composition[];
	total: number;
}

export interface VersionListResponse {
	data: CompositionVersion[];
	total: number;
}

export interface SignedUrlResponse {
	url: string;
}
