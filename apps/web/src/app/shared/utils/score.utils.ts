export const SCORE_THRESHOLDS = {
	PASS: 80,
	WARN: 60,
} as const;

export function getScoreSeverity(score: number): 'success' | 'warn' | 'danger' {
	if (score >= SCORE_THRESHOLDS.PASS) return 'success';
	if (score >= SCORE_THRESHOLDS.WARN) return 'warn';
	return 'danger';
}

export function getScoreLabel(score: number): string {
	if (score >= SCORE_THRESHOLDS.PASS) return 'Good';
	if (score >= SCORE_THRESHOLDS.WARN) return 'Fair';
	return 'Poor';
}
