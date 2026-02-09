import sharp from 'sharp';

import { BoundingBox } from '../interfaces/bounding-box.interface';

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

function validateBounds(
	box: BoundingBox,
	imageWidth: number,
	imageHeight: number,
): void {
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
		const backgroundImage = sharp(backgroundBuffer);
		const metadata = await backgroundImage.metadata();

		if (!metadata.width || !metadata.height) {
			throw new Error('Unable to determine background image dimensions');
		}

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

		// Join alpha channel to RGB image
		let combinedImage = await sharp(imageRGB)
			.joinChannel(alphaChannel)
			.png()
			.toBuffer();

		// Zero out RGB channels for transparent pixels (Gemini expects clean transparency)
		const { data, info } = await sharp(combinedImage)
			.raw()
			.toBuffer({ resolveWithObject: true });

		for (let i = 0; i < data.length; i += info.channels) {
			const a = data[i + 3];
			if (a !== 255) {
				data[i] = 0;
				data[i + 1] = 0;
				data[i + 2] = 0;
			}
		}

		combinedImage = await sharp(data, {
			raw: {
				width: info.width,
				height: info.height,
				channels: info.channels,
			},
		})
			.png()
			.toBuffer();

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
