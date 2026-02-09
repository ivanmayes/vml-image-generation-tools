/**
 * Internal bounding box type for utility functions.
 * Separate from BoundingBoxDto to avoid coupling utils to class-validator.
 */
export interface BoundingBox {
	left: number;
	top: number;
	width: number;
	height: number;
}
