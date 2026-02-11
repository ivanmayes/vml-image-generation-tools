/**
 * Judge Analytics models matching backend DTOs.
 */

export interface ChecklistPassRate {
	criteria: string;
	passRate: number;
	timesEvaluated: number;
	flag: 'never_passes' | 'always_passes' | null;
}

export interface CategoryScoreAverage {
	category: string;
	avg: number;
	min: number;
	max: number;
	stdDev: number;
}

export interface ScoreDistributionBucket {
	bucket: string;
	count: number;
	percentage: number;
}

export interface SeverityBreakdown {
	severity: 'critical' | 'major' | 'moderate' | 'minor';
	count: number;
	percentage: number;
}

export interface JudgeAnalyticsResponse {
	agentId: string;
	agentName: string;
	requestsAnalyzed: number;
	dateRange: { from: string; to: string };
	avgOverallScore: number;
	checklistPassRates: ChecklistPassRate[];
	categoryScoreAverages: CategoryScoreAverage[];
	scoreDistribution: ScoreDistributionBucket[];
	severityBreakdown: SeverityBreakdown[];
}

export interface QualitativeAnalysisResponse {
	recurringThemes: string[];
	blindSpots: string[];
	feedbackQuality: string;
	strengthsRecognized: string[];
	summary: string;
}

export interface PromptOptimizationResponse {
	currentPrompt: string;
	suggestedPrompt: string;
	changes: string[];
	isUsingDefaultTemplate: boolean;
}
