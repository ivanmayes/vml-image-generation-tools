export interface ToolDefinition {
	id: string;
	name: string;
	description: string;
	icon: string;
	routeFragment: string;
	comingSoon?: boolean;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
	{
		id: 'iterative-image-generation',
		name: 'Iterative Image Generation',
		description:
			'AI-powered iterative image generation with judge evaluation',
		icon: 'images',
		routeFragment: 'iterative-image-generation',
	},
	{
		id: 'image-compliance',
		name: 'Image Compliance',
		description:
			'Evaluate images against one or more judges to check compliance',
		icon: 'verified',
		routeFragment: 'compliance',
	},
];
