export interface Project {
	id: string;
	organizationId: string;
	spaceId?: string;
	name: string;
	description?: string;
	settings: Record<string, unknown>;
	createdBy?: string;
	createdAt: string;
}
