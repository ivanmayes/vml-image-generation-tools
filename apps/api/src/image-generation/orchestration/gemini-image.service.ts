import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

interface FetchedReferenceImage {
	base64: string;
	mimeType: string;
}

export interface GeminiImageOptions {
	aspectRatio?: string;
	quality?: string;
	referenceImageUrls?: string[];
	/** Pre-fetched reference images (internal use to avoid re-fetching in batch) */
	_prefetchedReferenceImages?: FetchedReferenceImage[];
}

export interface GeneratedImageResult {
	imageData: Buffer;
	mimeType: string;
	width?: number;
	height?: number;
}

@Injectable()
export class GeminiImageService {
	private readonly logger = new Logger(GeminiImageService.name);
	private readonly client: GoogleGenAI;
	private readonly mockMode: boolean;
	private readonly imageModel = 'gemini-3-pro-image-preview';

	constructor() {
		// Enable mock mode for testing when real image generation isn't available
		this.mockMode = process.env.IMAGE_GEN_MOCK === 'true';

		if (this.mockMode) {
			this.logger.warn(
				'[MOCK_MODE] Image generation running in mock mode - returning placeholder images',
			);
		}

		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey && !this.mockMode) {
			this.logger.warn(
				'GEMINI_API_KEY not set - image generation will fail',
			);
		}

		this.client = new GoogleGenAI({ apiKey: apiKey ?? '' });
	}

	/**
	 * Fetch reference images from URLs and convert to base64
	 */
	private async fetchReferenceImages(
		urls: string[],
	): Promise<FetchedReferenceImage[]> {
		const results: FetchedReferenceImage[] = [];

		for (const url of urls) {
			try {
				this.logger.debug(`[FETCH_REFERENCE] Fetching: ${url}`);
				const response = await fetch(url);

				if (!response.ok) {
					this.logger.warn(
						`[FETCH_REFERENCE_FAILED] URL: ${url} | Status: ${response.status}`,
					);
					continue;
				}

				const buffer = Buffer.from(await response.arrayBuffer());
				const contentType =
					response.headers.get('content-type') || 'image/jpeg';

				results.push({
					base64: buffer.toString('base64'),
					mimeType: contentType,
				});

				this.logger.debug(
					`[FETCH_REFERENCE_OK] URL: ${url} | Size: ${buffer.length} bytes | Type: ${contentType}`,
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Unknown error';
				this.logger.warn(
					`[FETCH_REFERENCE_ERROR] URL: ${url} | Error: ${message}`,
				);
			}
		}

		return results;
	}

	/**
	 * Generate a mock placeholder image (1x1 pixel PNG)
	 */
	private generateMockImage(): GeneratedImageResult {
		// 1x1 pixel red PNG (for visibility in testing)
		const mockPngBase64 =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
		return {
			imageData: Buffer.from(mockPngBase64, 'base64'),
			mimeType: 'image/png',
			width: 1,
			height: 1,
		};
	}

	/**
	 * Generate an image from a prompt using Gemini
	 */
	public async generateImage(
		prompt: string,
		options: GeminiImageOptions = {},
	): Promise<GeneratedImageResult> {
		const startTime = Date.now();
		this.logger.log(
			`[GEMINI_GEN_START] Prompt: "${prompt.substring(0, 80)}..." | ` +
				`RefImages: ${options.referenceImageUrls?.length ?? 0}`,
		);

		// Use mock mode if enabled
		if (this.mockMode) {
			// Simulate API delay
			await new Promise((resolve) => setTimeout(resolve, 100));
			const mockResult = this.generateMockImage();
			const totalTime = Date.now() - startTime;
			this.logger.log(
				`[GEMINI_GEN_MOCK] Generated mock image | ` +
					`Size: ${mockResult.imageData.length} bytes | ` +
					`TotalTime: ${totalTime}ms`,
			);
			return mockResult;
		}

		try {
			// Build the generation request with image output config
			const apiCallStart = Date.now();

			// Build contents array - include reference images if provided
			const contents: any[] = [];

			// Use pre-fetched images if available, otherwise fetch them
			let refImages: FetchedReferenceImage[] = [];
			if (options._prefetchedReferenceImages?.length) {
				refImages = options._prefetchedReferenceImages;
			} else if (options.referenceImageUrls?.length) {
				refImages = await this.fetchReferenceImages(
					options.referenceImageUrls,
				);
			}

			if (refImages.length > 0) {
				this.logger.log(
					`[GEMINI_REF_IMAGES] Including ${refImages.length} reference image(s)`,
				);

				// Add reference images as inline data
				for (const refImg of refImages) {
					contents.push({
						inlineData: {
							mimeType: refImg.mimeType,
							data: refImg.base64,
						},
					});
				}

				// Add instruction for how to use reference images
				contents.push({
					text: 'IMPORTANT: The above image(s) are reference images. You MUST closely match their visual style, color palette, composition, product appearance, and overall aesthetic in the generated image. Treat these references as the ground truth for how the output should look. Now generate the following: ',
				});
			}

			// Add the main prompt
			contents.push({ text: prompt });

			// Use the new Google GenAI SDK with responseModalities for image generation
			// When we have multiple parts (reference images + prompt), pass them as an array
			// When it's just text, pass as a simple string for compatibility
			const result = await this.client.models.generateContent({
				model: this.imageModel,
				contents: contents.length === 1 ? prompt : contents,
				config: {
					responseModalities: ['TEXT', 'IMAGE'],
					...(options.aspectRatio && {
						imageConfig: { aspectRatio: options.aspectRatio },
					}),
				},
			});
			const apiCallTime = Date.now() - apiCallStart;

			// Find the image part in the response
			const imagePart = result.candidates?.[0]?.content?.parts?.find(
				(part: any) => part.inlineData,
			);

			if (!imagePart?.inlineData?.data) {
				this.logger.error(
					`[GEMINI_GEN_ERROR] No image data in response | APITime: ${apiCallTime}ms`,
				);
				// Log what we did get for debugging
				this.logger.debug(
					`[GEMINI_GEN_DEBUG] Response parts: ${JSON.stringify(
						result.candidates?.[0]?.content?.parts?.map((p: any) =>
							Object.keys(p),
						),
					)}`,
				);
				throw new Error('No image data in response');
			}

			const imageData = Buffer.from(
				imagePart.inlineData.data as string,
				'base64',
			);
			const totalTime = Date.now() - startTime;

			this.logger.log(
				`[GEMINI_GEN_COMPLETE] Size: ${imageData.length} bytes | ` +
					`MimeType: ${imagePart.inlineData.mimeType || 'image/jpeg'} | ` +
					`APITime: ${apiCallTime}ms | TotalTime: ${totalTime}ms`,
			);

			return {
				imageData,
				mimeType: imagePart.inlineData.mimeType || 'image/jpeg',
			};
		} catch (error) {
			const totalTime = Date.now() - startTime;
			const message =
				error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(
				`[GEMINI_GEN_FAILED] Error: ${message} | Time: ${totalTime}ms`,
			);
			throw error;
		}
	}

	/**
	 * Generate multiple images from a prompt
	 */
	public async generateImages(
		prompt: string,
		count: number,
		options: GeminiImageOptions = {},
	): Promise<GeneratedImageResult[]> {
		const startTime = Date.now();
		this.logger.log(
			`[GEMINI_BATCH_START] Count: ${count} | ` +
				`AspectRatio: ${options.aspectRatio ?? 'default'} | ` +
				`Quality: ${options.quality ?? 'default'} | ` +
				`RefImages: ${options.referenceImageUrls?.length ?? 0}`,
		);

		// Pre-fetch reference images once for the entire batch
		let prefetchedRefs: FetchedReferenceImage[] = [];
		if (options.referenceImageUrls?.length) {
			this.logger.debug(
				`[GEMINI_BATCH_PREFETCH] Fetching ${options.referenceImageUrls.length} reference images`,
			);
			prefetchedRefs = await this.fetchReferenceImages(
				options.referenceImageUrls,
			);
		}

		// Generate images in parallel for faster throughput
		// Use Promise.allSettled to avoid unhandled rejections when one fails before others complete
		const promises = Array.from({ length: count }, (_, i) => {
			this.logger.debug(
				`[GEMINI_BATCH_PROGRESS] Generating image ${i + 1}/${count}`,
			);
			return this.generateImage(prompt, {
				...options,
				_prefetchedReferenceImages: prefetchedRefs,
			});
		});
		const settled = await Promise.allSettled(promises);
		const errors = settled.filter(
			(r): r is PromiseRejectedResult => r.status === 'rejected',
		);
		if (errors.length > 0) {
			this.logger.error(
				`[GEMINI_BATCH_FAIL] ${errors.length}/${count} images failed`,
			);
			throw errors[0].reason;
		}
		const results = settled.map(
			(r) => (r as PromiseFulfilledResult<GeneratedImageResult>).value,
		);

		const totalTime = Date.now() - startTime;
		const totalBytes = results.reduce(
			(sum, r) => sum + r.imageData.length,
			0,
		);
		this.logger.log(
			`[GEMINI_BATCH_COMPLETE] Generated: ${results.length}/${count} | ` +
				`TotalBytes: ${totalBytes} | ` +
				`TotalTime: ${totalTime}ms | ` +
				`AvgTimePerImage: ${Math.round(totalTime / count)}ms`,
		);

		return results;
	}
}
