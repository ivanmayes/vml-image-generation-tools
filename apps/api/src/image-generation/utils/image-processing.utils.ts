import * as fs from 'fs';
import * as path from 'path';

import sharp from 'sharp';

import { BoundingBox } from '../interfaces/bounding-box.interface';

/**
 * Fix #5: Sharp Memory Management Strategy
 *
 * Sharp uses libvips which has automatic resource cleanup, but under high load
 * or in error scenarios, explicit cleanup can prevent memory pressure.
 *
 * Strategy:
 * 1. Sharp instances created via sharp(buffer) are automatically cleaned up when GC'd
 * 2. For error-handling paths, we wrap operations in try-catch blocks
 * 3. Operations use .toBuffer() which releases resources after completion
 * 4. Avoid keeping Sharp instances in memory - process and release immediately
 *
 * Current Implementation:
 * - All functions return Buffer results via .toBuffer() or .toFile()
 * - No Sharp instances are stored in variables or returned
 * - Error handling wraps operations with ImageProcessingError
 * - Automatic cleanup happens when functions return
 *
 * Note: Sharp v0.30+ has improved automatic cleanup. Explicit .destroy() is rarely
 * needed with modern Sharp unless you're creating long-lived instances. Our code
 * follows the recommended pattern of creating, using, and releasing immediately.
 */

// Debug helper: save intermediate images to /tmp for inspection
const DEBUG_IMAGES = process.env.DEBUG_COMPOSITION_IMAGES === 'true';
async function debugSaveImage(buffer: Buffer, label: string): Promise<void> {
	if (!DEBUG_IMAGES) return;
	const dir = '/tmp/composition-debug';
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, `${Date.now()}-${label}.png`);
	// Create Sharp instance, use it, and let it be GC'd immediately
	await sharp(buffer).png().toFile(filePath);
	console.log(`[DEBUG_IMAGE] Saved: ${filePath}`);
}

// ─── Error Handling ──────────────────────────────────────────────────────────

export class ImageProcessingError extends Error {
	constructor(
		message: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'ImageProcessingError';
	}
}

// ─── Gemini 3 Resolution Tables (hardcoded, this repo is Gemini 3 only) ──────

const SUPPORTED_RATIOS = [
	[1, 1],
	[2, 3],
	[3, 2],
	[3, 4],
	[4, 3],
	[4, 5],
	[5, 4],
	[9, 16],
	[16, 9],
	[21, 9],
];

const SUPPORTED_RESOLUTIONS: Record<string, number[][]> = {
	'1K': [
		[1024, 1024],
		[848, 1264],
		[1264, 848],
		[896, 1200],
		[1200, 896],
		[928, 1152],
		[1152, 928],
		[768, 1376],
		[1376, 768],
		[1584, 672],
	],
	'2K': [
		[2048, 2048],
		[1696, 2528],
		[2528, 1696],
		[1792, 2400],
		[2400, 1792],
		[1856, 2304],
		[2304, 1856],
		[1536, 2752],
		[2752, 1536],
		[3168, 1344],
	],
	'4K': [
		[4096, 4096],
		[3392, 5056],
		[5056, 3392],
		[3584, 4800],
		[4800, 3584],
		[3712, 4608],
		[4608, 3712],
		[3072, 5504],
		[5504, 3072],
		[6336, 2688],
	],
};

const MAX_PIXEL_MAP: Record<string, number> = {
	'1K': Math.max(...SUPPORTED_RESOLUTIONS['1K'].map(([w, h]) => w * h)),
	'2K': Math.max(...SUPPORTED_RESOLUTIONS['2K'].map(([w, h]) => w * h)),
	'4K': Math.max(...SUPPORTED_RESOLUTIONS['4K'].map(([w, h]) => w * h)),
};

const RATIOS_FLAT = SUPPORTED_RATIOS.map(([w, h]) => w / h);

// ─── Internal Helpers ────────────────────────────────────────────────────────

function getResolutionScale(
	width: number,
	height: number,
): [number[][], string] {
	const pixelCount = width * height;
	if (pixelCount <= MAX_PIXEL_MAP['1K']) {
		return [SUPPORTED_RESOLUTIONS['1K'], '1K'];
	} else if (pixelCount <= MAX_PIXEL_MAP['2K']) {
		return [SUPPORTED_RESOLUTIONS['2K'], '2K'];
	} else {
		return [SUPPORTED_RESOLUTIONS['4K'], '4K'];
	}
}

function findNearestRatio(
	width: number,
	height: number,
): {
	ratio: number[];
	resolution: number[];
	imageSize: string;
} {
	const currentRatio = width / height;
	const [resolutions, imageSize] = getResolutionScale(width, height);

	const comparisons = RATIOS_FLAT.map((r) => Math.abs(r - currentRatio));
	const minDiff = Math.min(...comparisons);
	const index = comparisons.indexOf(minDiff);

	return {
		ratio: SUPPORTED_RATIOS[index],
		resolution: resolutions[index],
		imageSize,
	};
}

/**
 * Fix #7: Comprehensive bounding box validation
 * Validates that a bounding box is within image bounds and has valid dimensions.
 *
 * @param box Bounding box to validate
 * @param imageWidth Image width in pixels
 * @param imageHeight Image height in pixels
 * @throws ImageProcessingError if validation fails
 */
function validateBounds(
	box: BoundingBox,
	imageWidth: number,
	imageHeight: number,
): void {
	// Fix #7: Validate image dimensions are positive
	if (imageWidth <= 0 || imageHeight <= 0) {
		throw new ImageProcessingError(
			`Invalid image dimensions: ${imageWidth}x${imageHeight} (must be positive)`,
			{ box, imageWidth, imageHeight },
		);
	}

	// Fix #7: Validate bounding box position is not negative
	if (box.left < 0 || box.top < 0) {
		throw new ImageProcessingError(
			`Bounding box position cannot be negative: left=${box.left}, top=${box.top}`,
			{ box, imageWidth, imageHeight },
		);
	}

	// Fix #7: Validate bounding box dimensions are positive
	if (box.width <= 0 || box.height <= 0) {
		throw new ImageProcessingError(
			`Bounding box dimensions must be positive: width=${box.width}, height=${box.height}`,
			{ box, imageWidth, imageHeight },
		);
	}

	// Fix #7: Validate dimensions are integers (Sharp requires integer pixel values)
	if (
		!Number.isInteger(box.left) ||
		!Number.isInteger(box.top) ||
		!Number.isInteger(box.width) ||
		!Number.isInteger(box.height)
	) {
		throw new ImageProcessingError(
			`Bounding box coordinates must be integers: ` +
				`left=${box.left}, top=${box.top}, width=${box.width}, height=${box.height}`,
			{ box, imageWidth, imageHeight },
		);
	}

	// Existing validations: check box doesn't exceed image bounds
	if (box.left + box.width > imageWidth) {
		throw new ImageProcessingError(
			`Bounding box exceeds image width: left(${box.left}) + width(${box.width}) > imageWidth(${imageWidth})`,
			{ box, imageWidth, imageHeight },
		);
	}
	if (box.top + box.height > imageHeight) {
		throw new ImageProcessingError(
			`Bounding box exceeds image height: top(${box.top}) + height(${box.height}) > imageHeight(${imageHeight})`,
			{ box, imageWidth, imageHeight },
		);
	}
}

// ─── Sharp Operations ────────────────────────────────────────────────────────

/**
 * Extract a region from an image as a PNG buffer.
 * Optionally resize to fit a target resolution.
 */
export async function boundingBoxToBuffer(
	image: Buffer,
	boundingBox: BoundingBox,
	fitToResolution?: { width: number; height: number },
): Promise<Buffer> {
	try {
		const chain = sharp(image).extract({
			left: boundingBox.left,
			top: boundingBox.top,
			width: boundingBox.width,
			height: boundingBox.height,
		});

		if (fitToResolution) {
			chain.resize(fitToResolution.width, fitToResolution.height);
		}

		return await chain.png().toBuffer();
	} catch (error) {
		throw new ImageProcessingError(
			`Failed to extract bounding box: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ boundingBox, fitToResolution },
		);
	}
}

/**
 * Resize an image buffer to exact dimensions.
 */
export async function resizeBuffer(
	image: Buffer,
	width: number,
	height: number,
): Promise<Buffer> {
	try {
		return await sharp(image).resize(width, height).toBuffer();
	} catch (error) {
		throw new ImageProcessingError(
			`Failed to resize image: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ width, height },
		);
	}
}

/**
 * Get width and height from an image buffer.
 */
export async function getImageDimensions(
	image: Buffer,
): Promise<{ width: number; height: number }> {
	try {
		const metadata = await sharp(image).metadata();
		if (!metadata.width || !metadata.height) {
			throw new Error('Unable to determine image dimensions');
		}
		return { width: metadata.width, height: metadata.height };
	} catch (error) {
		throw new ImageProcessingError(
			`Failed to get image dimensions: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

/**
 * Composite a tile image back into the base image at the specified bounding box coordinates.
 * Optionally resizes the tile to match the bounding box dimensions.
 */
export async function replaceBoundingBox(
	baseImage: Buffer,
	tileImage: Buffer,
	boundingBox: BoundingBox,
	resizeTile: boolean = false,
): Promise<Buffer> {
	try {
		let tileBuffer = tileImage;

		if (resizeTile) {
			tileBuffer = await resizeBuffer(
				tileImage,
				boundingBox.width,
				boundingBox.height,
			);
		}

		return await sharp(baseImage)
			.composite([
				{
					input: tileBuffer,
					left: boundingBox.left,
					top: boundingBox.top,
				},
			])
			.png()
			.toBuffer();
	} catch (error) {
		throw new ImageProcessingError(
			`Failed to replace bounding box: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ boundingBox, resizeTile },
		);
	}
}

/**
 * Combine a mask with a background image to create transparent areas.
 * The mask should be white (stroke) on black (keep) — this function inverts
 * the mask to create an alpha channel (255=opaque, 0=transparent) and zeros
 * out RGB channels in transparent areas for clean Gemini input.
 *
 * @param backgroundBuffer - Background image buffer
 * @param maskBuffer - Binary mask image buffer (white strokes on black)
 * @returns PNG buffer with transparent areas where mask was white
 */
export async function combineMaskWithBackground(
	backgroundBuffer: Buffer,
	maskBuffer: Buffer,
): Promise<Buffer> {
	try {
		console.log(
			`[MASK_COMBINE] Starting | BackgroundBuffer: ${backgroundBuffer.length} bytes | MaskBuffer: ${maskBuffer.length} bytes`,
		);

		const backgroundImage = sharp(backgroundBuffer);
		const metadata = await backgroundImage.metadata();

		if (!metadata.width || !metadata.height) {
			throw new Error('Unable to determine background image dimensions');
		}

		console.log(
			`[MASK_COMBINE] Background dimensions: ${metadata.width}x${metadata.height} | Channels: ${metadata.channels} | Format: ${metadata.format}`,
		);

		// Log mask metadata
		const maskMeta = await sharp(maskBuffer).metadata();
		console.log(
			`[MASK_COMBINE] Mask dimensions: ${maskMeta.width}x${maskMeta.height} | Channels: ${maskMeta.channels} | Format: ${maskMeta.format}`,
		);

		await debugSaveImage(backgroundBuffer, '01-background-input');
		await debugSaveImage(maskBuffer, '02-mask-input');

		// Process background and mask in parallel
		const [imageRGB, alphaChannel] = await Promise.all([
			// Remove any existing alpha channel (ensure 3-channel RGB)
			backgroundImage.removeAlpha().toBuffer(),

			// Resize mask to match background, grayscale, invert, extract single channel
			// Alpha convention: 255=opaque, 0=transparent
			// Our mask: white=remove, black=keep → needs inversion
			sharp(maskBuffer)
				.resize(metadata.width, metadata.height, { fit: 'fill' })
				.greyscale()
				.negate()
				.extractChannel('red')
				.toBuffer(),
		]);

		console.log(
			`[MASK_COMBINE] RGB buffer: ${imageRGB.length} bytes | Alpha channel (encoded): ${alphaChannel.length} bytes`,
		);

		// Decode alpha to raw pixels for analysis (force single channel)
		const alphaRaw = await sharp(alphaChannel)
			.extractChannel(0)
			.raw()
			.toBuffer();
		console.log(
			`[MASK_COMBINE] Alpha raw buffer: ${alphaRaw.length} bytes (expected ${metadata.width * metadata.height})`,
		);

		// Analyze alpha channel: count transparent vs opaque pixels
		const alphaStats = await sharp(alphaRaw, {
			raw: {
				width: metadata.width,
				height: metadata.height,
				channels: 1,
			},
		}).stats();
		console.log(
			`[MASK_COMBINE] Alpha stats (inverted mask): min=${alphaStats.channels[0].min} max=${alphaStats.channels[0].max} mean=${alphaStats.channels[0].mean.toFixed(1)}`,
		);

		// Count transparent pixels (alpha < 128 = masked area)
		let transparentCount = 0;
		let opaqueCount = 0;
		for (const alphaValue of alphaRaw) {
			if (alphaValue < 128) transparentCount++;
			else opaqueCount++;
		}
		const totalPixels = metadata.width * metadata.height;
		const maskedPercent = ((transparentCount / totalPixels) * 100).toFixed(
			1,
		);
		console.log(
			`[MASK_COMBINE] Pixel analysis: ${transparentCount} transparent (${maskedPercent}%) | ${opaqueCount} opaque | Total: ${totalPixels}`,
		);

		// Join alpha channel to RGB image
		let combinedImage = await sharp(imageRGB)
			.joinChannel(alphaChannel)
			.png()
			.toBuffer();

		await debugSaveImage(combinedImage, '03-combined-before-zero');

		// Zero out RGB channels for transparent pixels (Gemini expects clean transparency)
		const { data, info } = await sharp(combinedImage)
			.raw()
			.toBuffer({ resolveWithObject: true });

		let zeroedPixels = 0;
		for (let i = 0; i < data.length; i += info.channels) {
			const a = data[i + 3];
			if (a !== 255) {
				data[i] = 0;
				data[i + 1] = 0;
				data[i + 2] = 0;
				zeroedPixels++;
			}
		}
		console.log(
			`[MASK_COMBINE] Zeroed RGB for ${zeroedPixels} semi/fully-transparent pixels out of ${data.length / info.channels} total`,
		);

		combinedImage = await sharp(data, {
			raw: {
				width: info.width,
				height: info.height,
				channels: info.channels,
			},
		})
			.png()
			.toBuffer();

		await debugSaveImage(combinedImage, '04-final-masked-output');

		console.log(
			`[MASK_COMBINE] Final output: ${combinedImage.length} bytes (PNG with transparency)`,
		);

		return combinedImage;
	} catch (error) {
		throw new ImageProcessingError(
			`Failed to combine mask with background: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

// ─── Stitch / Ratio-Fitting Operations ───────────────────────────────────────

export interface FittedBoundingBox extends BoundingBox {
	aspectRatio: string;
	resolution: { width: number; height: number };
	imageSize: string;
	needsResize: boolean;
}

/**
 * Adjusts a bounding box to fit Gemini's supported aspect ratios.
 * Centers the adjusted box within the original box dimensions.
 */
export function fitBoundingBoxToModelRatios(
	box: BoundingBox,
): FittedBoundingBox {
	const { ratio, resolution, imageSize } = findNearestRatio(
		box.width,
		box.height,
	);

	let left = box.left;
	let top = box.top;
	let width = box.width;
	let height = box.height;

	// Adjust dimensions to match the nearest supported ratio
	if (resolution[0] >= resolution[1]) {
		// Width-based or square
		height = box.width * (resolution[1] / resolution[0]);
		top += (box.height - height) / 2;
	} else {
		// Height-based
		width = box.height * (resolution[0] / resolution[1]);
		left += (box.width - width) / 2;
	}

	width = Math.floor(width);
	height = Math.floor(height);

	const needsResize = width !== resolution[0] || height !== resolution[1];

	return {
		left: Math.max(Math.floor(left), 0),
		top: Math.max(Math.floor(top), 0),
		width,
		height,
		aspectRatio: `${ratio[0]}:${ratio[1]}`,
		resolution: { width: resolution[0], height: resolution[1] },
		imageSize,
		needsResize,
	};
}

export interface ExtractedBoundingBox {
	tile: Buffer;
	aspectRatio: string;
	imageSize: string;
	fittedBoundingBox: BoundingBox;
}

/**
 * Extracts a bounding box region from an image, fitting to Gemini model ratios.
 * The extracted tile is resized to the nearest supported resolution if needed.
 */
export async function extractBoundingBox(
	image: Buffer,
	boundingBox: BoundingBox,
): Promise<ExtractedBoundingBox> {
	// Validate bounds before processing
	const dims = await getImageDimensions(image);
	validateBounds(boundingBox, dims.width, dims.height);

	const fitted = fitBoundingBoxToModelRatios(boundingBox);

	const tile = await boundingBoxToBuffer(
		image,
		{
			left: fitted.left,
			top: fitted.top,
			width: fitted.width,
			height: fitted.height,
		},
		fitted.needsResize ? fitted.resolution : undefined,
	);

	const { aspectRatio, resolution, needsResize, imageSize, ...rest } = fitted;

	return {
		tile,
		aspectRatio,
		imageSize,
		fittedBoundingBox: rest,
	};
}

/**
 * Replaces a region in the original image with a generated tile.
 * The tile is resized to match the bounding box dimensions before compositing.
 */
export async function stitchTileBack(
	originalImage: Buffer,
	generatedTile: Buffer,
	boundingBox: BoundingBox,
): Promise<Buffer> {
	return replaceBoundingBox(originalImage, generatedTile, boundingBox, true);
}
