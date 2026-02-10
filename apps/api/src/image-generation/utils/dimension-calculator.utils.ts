/**
 * Utility for calculating optimal upscale dimensions based on input size.
 * Ported from vml-ai-product-photography, converted from class to standalone functions.
 */

export interface DimensionCalculation {
	targetWidth: number;
	targetHeight: number;
	upscaleFactor: number;
	originalWidth: number;
	originalHeight: number;
}

/**
 * Calculate optimal upscale dimensions based on source image size.
 * - <1024px: 4x upscale
 * - 1024-2048px: 2x upscale
 * - >2048px: 1.5x upscale
 * - Respects maximum dimension limits (8192px for Gemini)
 */
export function calculateOptimalUpscaleDimensions(
	originalWidth: number,
	originalHeight: number,
	maxDimension: number = 8192,
): DimensionCalculation {
	if (originalWidth <= 0 || originalHeight <= 0) {
		return {
			targetWidth: 0,
			targetHeight: 0,
			upscaleFactor: 0,
			originalWidth,
			originalHeight,
		};
	}

	const smallerDimension = Math.min(originalWidth, originalHeight);

	let upscaleFactor: number;
	if (smallerDimension < 1024) {
		upscaleFactor = 4;
	} else if (smallerDimension <= 2048) {
		upscaleFactor = 2;
	} else {
		upscaleFactor = 1.5;
	}

	let targetWidth = Math.round(originalWidth * upscaleFactor);
	let targetHeight = Math.round(originalHeight * upscaleFactor);

	if (targetWidth > maxDimension || targetHeight > maxDimension) {
		const scale = maxDimension / Math.max(targetWidth, targetHeight);
		targetWidth = Math.round(targetWidth * scale);
		targetHeight = Math.round(targetHeight * scale);
		upscaleFactor = Math.min(
			targetWidth / originalWidth,
			targetHeight / originalHeight,
		);
	}

	return {
		targetWidth,
		targetHeight,
		upscaleFactor,
		originalWidth,
		originalHeight,
	};
}

/**
 * Calculate dimensions with a specific upscale factor.
 */
export function calculateWithFactor(
	originalWidth: number,
	originalHeight: number,
	upscaleFactor: number,
	maxDimension: number = 8192,
): DimensionCalculation {
	if (originalWidth <= 0 || originalHeight <= 0) {
		return {
			targetWidth: 0,
			targetHeight: 0,
			upscaleFactor: 0,
			originalWidth,
			originalHeight,
		};
	}

	let targetWidth = Math.round(originalWidth * upscaleFactor);
	let targetHeight = Math.round(originalHeight * upscaleFactor);

	if (targetWidth > maxDimension || targetHeight > maxDimension) {
		const scale = maxDimension / Math.max(targetWidth, targetHeight);
		targetWidth = Math.round(targetWidth * scale);
		targetHeight = Math.round(targetHeight * scale);
		upscaleFactor = Math.min(
			targetWidth / originalWidth,
			targetHeight / originalHeight,
		);
	}

	return {
		targetWidth,
		targetHeight,
		upscaleFactor,
		originalWidth,
		originalHeight,
	};
}

/**
 * Validate and adjust target dimensions to respect min/max limits.
 */
export function validateDimensions(
	targetWidth: number,
	targetHeight: number,
	originalWidth: number,
	originalHeight: number,
	minDimension: number = 1024,
	maxDimension: number = 8192,
): DimensionCalculation {
	if (originalWidth <= 0 || originalHeight <= 0) {
		return {
			targetWidth: 0,
			targetHeight: 0,
			upscaleFactor: 0,
			originalWidth,
			originalHeight,
		};
	}

	if (targetWidth > maxDimension || targetHeight > maxDimension) {
		const scale = maxDimension / Math.max(targetWidth, targetHeight);
		targetWidth = Math.round(targetWidth * scale);
		targetHeight = Math.round(targetHeight * scale);
	}

	if (targetWidth < minDimension || targetHeight < minDimension) {
		const scale = minDimension / Math.min(targetWidth, targetHeight);
		targetWidth = Math.round(targetWidth * scale);
		targetHeight = Math.round(targetHeight * scale);
	}

	const upscaleFactor = Math.min(
		targetWidth / originalWidth,
		targetHeight / originalHeight,
	);

	return {
		targetWidth,
		targetHeight,
		upscaleFactor,
		originalWidth,
		originalHeight,
	};
}
