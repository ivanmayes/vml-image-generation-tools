export interface AspectRatioPreset {
	ratio: string;
	displayName: string;
	useCase: string;
	value: number;
}

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
	{
		ratio: '1:1',
		displayName: 'Square',
		useCase: 'Social media posts, Instagram feed',
		value: 1,
	},
	{
		ratio: '4:3',
		displayName: 'Standard',
		useCase: 'Traditional photography, presentations',
		value: 4 / 3,
	},
	{
		ratio: '3:2',
		displayName: 'Classic',
		useCase: '35mm film, DSLR standard',
		value: 3 / 2,
	},
	{
		ratio: '16:9',
		displayName: 'Widescreen',
		useCase: 'Video, YouTube, modern displays',
		value: 16 / 9,
	},
	{
		ratio: '21:9',
		displayName: 'Ultrawide',
		useCase: 'Cinematic video, ultrawide monitors',
		value: 21 / 9,
	},
	{
		ratio: '32:9',
		displayName: 'Super Ultrawide',
		useCase: 'Panoramic, dual monitor setups',
		value: 32 / 9,
	},
	{
		ratio: '3:4',
		displayName: 'Portrait Standard',
		useCase: 'Portrait photography, prints',
		value: 3 / 4,
	},
	{
		ratio: '2:3',
		displayName: 'Portrait Classic',
		useCase: 'Portrait photography, 35mm vertical',
		value: 2 / 3,
	},
	{
		ratio: '9:16',
		displayName: 'Vertical Video',
		useCase: 'Instagram Stories, TikTok, Reels',
		value: 9 / 16,
	},
];

export const ASPECT_RATIO_MAP = new Map<string, AspectRatioPreset>(
	ASPECT_RATIO_PRESETS.map((preset) => [preset.ratio, preset]),
);

export const ASPECT_RATIO_VALUES = ASPECT_RATIO_PRESETS.map(
	(preset) => preset.ratio,
);

export const DEFAULT_ASPECT_RATIO = '1:1';

export const ASPECT_RATIO_TOLERANCE = 0.05;
