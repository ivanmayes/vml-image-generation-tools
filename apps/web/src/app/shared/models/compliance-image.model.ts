import type { EvaluationResult } from './agent.model';

interface ComplianceImageBase {
	id: string;
	url: string;
	fileName?: string;
	addedAt: number;
}

export type ComplianceImage =
	| (ComplianceImageBase & { status: 'uploading' })
	| (ComplianceImageBase & { status: 'queued' })
	| (ComplianceImageBase & { status: 'evaluating' })
	| (ComplianceImageBase & {
			status: 'complete';
			aggregateScore: number;
			evaluations: EvaluationResult[];
	  })
	| (ComplianceImageBase & { status: 'failed'; error: string });
