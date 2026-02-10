import { DataSource } from 'typeorm';
import { Project } from '../../src/project/project.entity';

let projectCounter = 0;

/**
 * Create and persist a real Project entity.
 * Requires an existing organizationId.
 */
export async function createProject(
	ds: DataSource,
	organizationId: string,
	overrides: Partial<Project> = {},
): Promise<Project> {
	projectCounter++;
	const repo = ds.getRepository(Project);

	const project = repo.create({
		organizationId,
		name: `Test Project ${projectCounter}`,
		description: `Test project description ${projectCounter}`,
		settings: {},
		...overrides,
	});

	return repo.save(project);
}
