export enum PromptEnhancementMode {
	ENHANCE = 'enhance',
	CONTEXTUAL = 'contextual',
	DESCRIBE_PRODUCT = 'describe-product',
}

export interface SuggestPromptRequest {
	mode: PromptEnhancementMode;
	prompt?: string;
	canvasImage?: string;
	referenceImage?: string;
}

export interface SuggestPromptResponse {
	enhancedPrompt: string;
	metadata?: {
		model?: string;
		mode?: string;
		processingTimeMs?: number;
		userId?: string;
	};
}
