/**
 * Google AI Client
 * Static utility class for Google Gemini API interactions
 */

import {
	GoogleGenerativeAI,
	Content,
	Part,
	FunctionDeclaration,
	Tool,
} from '@google/generative-ai';

import {
	AIProvider,
	AIModel,
	AIMessageRole,
	AIFinishReason,
} from '../../models/enums';
import type {
	AITextRequest,
	AITextResponse,
	AITextStream,
	AITextStreamChunk,
	AIVisionRequest,
	AIVisionResponse,
	AIEmbeddingRequest,
	AIEmbeddingResponse,
	AIMessage,
	AIUsage,
	AIContentPart,
} from '../../models/interfaces';
import type { GoogleAIConfig } from '../../models/config';
import { AIConfigurationError, parseProviderError } from '../../models/errors';

/**
 * Get API key lazily at runtime (after dotenv has loaded)
 */
function getApiKey(): string | undefined {
	const key = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
	console.log(
		`[GoogleClient:getApiKey] GOOGLE_AI_API_KEY: ${process.env.GOOGLE_AI_API_KEY ? 'SET' : 'NOT SET'}, GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET'}, returning: ${key ? 'KEY_PRESENT' : 'undefined'}`,
	);
	return key;
}

/**
 * Default configuration (without apiKey - will be resolved lazily)
 */
const DEFAULT_CONFIG: Omit<GoogleAIConfig, 'apiKey'> = {
	defaultModel: AIModel.Gemini15Pro,
	timeout: 60000,
	maxRetries: 3,
};

/**
 * Google AI API client wrapper
 */
export class GoogleClient {
	private static config: GoogleAIConfig = {
		...DEFAULT_CONFIG,
		apiKey: undefined,
	};

	/**
	 * Get or create Google AI client instance
	 */
	private static getClient(
		configOverride?: GoogleAIConfig,
	): GoogleGenerativeAI {
		// Debug logging
		console.log(
			'[GoogleClient:getClient] configOverride?.apiKey:',
			configOverride?.apiKey ? 'SET' : 'NOT SET',
		);
		console.log(
			'[GoogleClient:getClient] this.config.apiKey:',
			this.config.apiKey ? 'SET' : 'NOT SET',
		);

		// Resolve API key lazily at runtime
		const lazyKey = getApiKey();
		console.log(
			'[GoogleClient:getClient] getApiKey() returned:',
			lazyKey ? 'KEY_PRESENT' : 'undefined',
		);

		const apiKey = configOverride?.apiKey ?? this.config.apiKey ?? lazyKey;
		console.log(
			'[GoogleClient:getClient] Final apiKey:',
			apiKey ? 'KEY_PRESENT' : 'undefined',
		);

		const config = { ...this.config, ...configOverride, apiKey };

		if (!config.apiKey) {
			throw new AIConfigurationError(
				'Google AI API key is not configured',
				{
					provider: AIProvider.Google,
					configKey: 'apiKey',
				},
			);
		}

		return new GoogleGenerativeAI(config.apiKey);
	}

	/**
	 * Convert internal message format to Google format
	 */
	private static async convertMessages(messages: AIMessage[]): Promise<{
		systemInstruction?: string;
		contents: Content[];
	}> {
		let systemInstruction: string | undefined;
		const contents: Content[] = [];

		for (const msg of messages) {
			// Extract system message
			if (msg.role === AIMessageRole.System) {
				if (typeof msg.content === 'string') {
					systemInstruction = systemInstruction
						? `${systemInstruction}\n\n${msg.content}`
						: msg.content;
				}
				continue;
			}

			// Handle tool response messages
			if (msg.role === AIMessageRole.Tool && msg.toolCallId) {
				contents.push({
					role: 'function',
					parts: [
						{
							functionResponse: {
								name: msg.toolCallId,
								response:
									typeof msg.content === 'string'
										? { result: msg.content }
										: msg.content,
							},
						},
					],
				});
				continue;
			}

			// Handle assistant messages with tool calls
			if (msg.role === AIMessageRole.Assistant && msg.toolCalls?.length) {
				const parts: Part[] = [];

				if (typeof msg.content === 'string' && msg.content) {
					parts.push({ text: msg.content });
				}

				for (const tc of msg.toolCalls) {
					parts.push({
						functionCall: {
							name: tc.function.name,
							args: JSON.parse(tc.function.arguments),
						},
					});
				}

				contents.push({
					role: 'model',
					parts,
				});
				continue;
			}

			// Handle multimodal content
			if (Array.isArray(msg.content)) {
				const parts: Part[] = [];

				for (const part of msg.content as AIContentPart[]) {
					if (part.type === 'text' && part.text) {
						parts.push({ text: part.text });
					} else if (part.type === 'image' && part.image) {
						if (part.image.base64) {
							parts.push({
								inlineData: {
									mimeType:
										part.image.mimeType ?? 'image/png',
									data: part.image.base64,
								},
							});
						} else if (part.image.url) {
							try {
								const response = await fetch(part.image.url);
								if (!response.ok) {
									console.warn(
										`[GoogleClient] Failed to fetch image from URL (HTTP ${response.status}): ${part.image.url}`,
									);
									continue;
								}
								const buffer = Buffer.from(
									await response.arrayBuffer(),
								);
								const contentType =
									response.headers.get('content-type');
								const mimeType =
									part.image.mimeType ??
									(contentType
										? contentType.split(';')[0].trim()
										: 'image/jpeg');
								parts.push({
									inlineData: {
										mimeType,
										data: buffer.toString('base64'),
									},
								});
							} catch (err) {
								console.warn(
									`[GoogleClient] Error fetching image from URL: ${part.image.url}`,
									err instanceof Error ? err.message : err,
								);
							}
						} else {
							console.warn(
								'[GoogleClient] Image part has neither base64 nor url — skipping',
							);
						}
					}
				}

				contents.push({
					role: msg.role === AIMessageRole.User ? 'user' : 'model',
					parts,
				});
				continue;
			}

			// Simple text message
			contents.push({
				role: msg.role === AIMessageRole.User ? 'user' : 'model',
				parts: [{ text: msg.content }],
			});
		}

		return { systemInstruction, contents };
	}

	/**
	 * Parse Google finish reason to internal format
	 */
	private static parseFinishReason(reason?: string): AIFinishReason {
		switch (reason) {
			case 'STOP':
				return AIFinishReason.Stop;
			case 'MAX_TOKENS':
				return AIFinishReason.Length;
			case 'SAFETY':
				return AIFinishReason.ContentFilter;
			default:
				return AIFinishReason.Stop;
		}
	}

	/**
	 * Parse usage data
	 */
	private static parseUsage(metadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		totalTokenCount?: number;
	}): AIUsage | undefined {
		if (!metadata) return undefined;
		return {
			promptTokens: metadata.promptTokenCount ?? 0,
			completionTokens: metadata.candidatesTokenCount ?? 0,
			totalTokens: metadata.totalTokenCount ?? 0,
		};
	}

	/**
	 * Convert tools to Google format (function declarations + built-in tools)
	 */
	private static convertTools(
		tools?: AITextRequest['tools'],
		builtInTools?: AITextRequest['builtInTools'],
	): Tool[] | undefined {
		const result: Tool[] = [];

		// Existing function declarations
		if (tools?.length) {
			result.push({
				functionDeclarations: tools.map((t) => ({
					name: t.function.name,
					description: t.function.description ?? '',
					parameters: t.function
						.parameters as FunctionDeclaration['parameters'],
				})),
			});
		}

		// Built-in: Code Execution
		if (builtInTools?.codeExecution) {
			result.push({ codeExecution: {} } as Tool);
		}

		// Built-in: Google Search
		if (builtInTools?.googleSearch) {
			result.push({ googleSearch: {} } as unknown as Tool);
		}

		return result.length > 0 ? result : undefined;
	}

	/**
	 * Generate text completion
	 */
	public static async generateText(
		request: AITextRequest,
		configOverride?: GoogleAIConfig,
	): Promise<AITextResponse> {
		const client = this.getClient(configOverride);
		const modelName =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.Gemini15Pro;

		const { systemInstruction, contents } = await this.convertMessages(
			request.messages,
		);

		try {
			const model = client.getGenerativeModel({
				model: modelName,
				systemInstruction,
				generationConfig: {
					maxOutputTokens: request.maxTokens,
					temperature: request.temperature,
					topP: request.topP,
					stopSequences:
						typeof request.stop === 'string'
							? [request.stop]
							: request.stop,
					responseMimeType:
						request.responseFormat?.type === 'json_object'
							? 'application/json'
							: undefined,
				},
				tools: this.convertTools(request.tools, request.builtInTools),
			});

			const result = await model.generateContent({ contents });
			const response = result.response;
			const candidate = response.candidates?.[0];

			// Extract text and function calls
			let textContent = '';
			const toolCalls: {
				id: string;
				type: 'function';
				function: { name: string; arguments: string };
			}[] = [];

			if (candidate?.content?.parts) {
				for (const part of candidate.content.parts) {
					if ('text' in part && part.text) {
						textContent += part.text;
					} else if ('functionCall' in part && part.functionCall) {
						toolCalls.push({
							id: `call_${Date.now()}_${toolCalls.length}`,
							type: 'function',
							function: {
								name: part.functionCall.name,
								arguments: JSON.stringify(
									part.functionCall.args,
								),
							},
						});
					}
				}
			}

			return {
				provider: AIProvider.Google,
				model: modelName,
				content: textContent,
				finishReason: this.parseFinishReason(candidate?.finishReason),
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				usage: this.parseUsage(response.usageMetadata),
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Google);
		}
	}

	/**
	 * Generate streaming text completion
	 */
	public static async *generateTextStream(
		request: AITextRequest,
		configOverride?: GoogleAIConfig,
	): AITextStream {
		const client = this.getClient(configOverride);
		const modelName =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.Gemini15Pro;

		const { systemInstruction, contents } = await this.convertMessages(
			request.messages,
		);

		try {
			const model = client.getGenerativeModel({
				model: modelName,
				systemInstruction,
				generationConfig: {
					maxOutputTokens: request.maxTokens,
					temperature: request.temperature,
					topP: request.topP,
					stopSequences:
						typeof request.stop === 'string'
							? [request.stop]
							: request.stop,
				},
				tools: this.convertTools(request.tools, request.builtInTools),
			});

			const result = await model.generateContentStream({ contents });

			for await (const chunk of result.stream) {
				const candidate = chunk.candidates?.[0];
				let textContent = '';
				const toolCalls: Partial<{
					id: string;
					type: 'function';
					function: { name: string; arguments: string };
				}>[] = [];

				if (candidate?.content?.parts) {
					for (const part of candidate.content.parts) {
						if ('text' in part && part.text) {
							textContent += part.text;
						} else if (
							'functionCall' in part &&
							part.functionCall
						) {
							toolCalls.push({
								id: `call_${Date.now()}_${toolCalls.length}`,
								type: 'function',
								function: {
									name: part.functionCall.name,
									arguments: JSON.stringify(
										part.functionCall.args,
									),
								},
							});
						}
					}
				}

				const streamChunk: AITextStreamChunk = {
					content: textContent,
					finishReason: candidate?.finishReason
						? this.parseFinishReason(candidate.finishReason)
						: undefined,
					toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
					usage: chunk.usageMetadata
						? this.parseUsage(chunk.usageMetadata)
						: undefined,
				};

				yield streamChunk;
			}
		} catch (error) {
			throw parseProviderError(error, AIProvider.Google);
		}
	}

	/**
	 * Analyze image using Gemini vision
	 */
	public static async analyzeImage(
		request: AIVisionRequest,
		configOverride?: GoogleAIConfig,
	): Promise<AIVisionResponse> {
		const client = this.getClient(configOverride);
		const modelName =
			(request.model as string) ??
			configOverride?.defaultModel ??
			AIModel.Gemini15Pro;

		try {
			const model = client.getGenerativeModel({
				model: modelName,
				generationConfig: {
					maxOutputTokens: request.maxTokens,
					temperature: request.temperature,
				},
			});

			const parts: Part[] = [];

			for (const img of request.images) {
				if (img.base64) {
					parts.push({
						inlineData: {
							mimeType: img.mimeType ?? 'image/png',
							data: img.base64,
						},
					});
				} else if (img.url) {
					try {
						const response = await fetch(img.url);
						if (!response.ok) {
							console.warn(
								`[GoogleClient] Failed to fetch image from URL (HTTP ${response.status}): ${img.url}`,
							);
							continue;
						}
						const buffer = Buffer.from(
							await response.arrayBuffer(),
						);
						const contentType =
							response.headers.get('content-type');
						const mimeType =
							img.mimeType ??
							(contentType
								? contentType.split(';')[0].trim()
								: 'image/jpeg');
						parts.push({
							inlineData: {
								mimeType,
								data: buffer.toString('base64'),
							},
						});
					} catch (err) {
						console.warn(
							`[GoogleClient] Error fetching image from URL: ${img.url}`,
							err instanceof Error ? err.message : err,
						);
					}
				} else {
					console.warn(
						'[GoogleClient] Vision image has neither base64 nor url — skipping',
					);
				}
			}

			parts.push({ text: request.prompt });

			const result = await model.generateContent({
				contents: [{ role: 'user', parts }],
			});
			const response = result.response;
			const candidate = response.candidates?.[0];

			let textContent = '';
			if (candidate?.content?.parts) {
				for (const part of candidate.content.parts) {
					if ('text' in part && part.text) {
						textContent += part.text;
					}
				}
			}

			return {
				provider: AIProvider.Google,
				model: modelName,
				content: textContent,
				finishReason: this.parseFinishReason(candidate?.finishReason),
				usage: this.parseUsage(response.usageMetadata),
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Google);
		}
	}

	/**
	 * Generate embeddings
	 */
	public static async generateEmbedding(
		request: AIEmbeddingRequest,
		configOverride?: GoogleAIConfig,
	): Promise<AIEmbeddingResponse> {
		const client = this.getClient(configOverride);
		const modelName = (request.model as string) ?? AIModel.TextEmbedding004;

		try {
			const model = client.getGenerativeModel({ model: modelName });

			const inputs = Array.isArray(request.input)
				? request.input
				: [request.input];

			const embeddings: number[][] = [];

			for (const input of inputs) {
				const result = await model.embedContent(input);
				embeddings.push(result.embedding.values);
			}

			return {
				provider: AIProvider.Google,
				model: modelName,
				embeddings,
				dimensions: embeddings[0]?.length ?? 0,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Google);
		}
	}

	/**
	 * Update default configuration
	 */
	public static configure(config: Partial<GoogleAIConfig>): void {
		this.config = { ...this.config, ...config };
	}
}
