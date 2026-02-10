import { DataSource } from 'typeorm';
import { Organization } from '../../src/organization/organization.entity';

let orgCounter = 0;

/**
 * Create and persist a real Organization entity.
 */
export async function createOrganization(
	ds: DataSource,
	overrides: Partial<Organization> = {},
): Promise<Organization> {
	orgCounter++;
	const repo = ds.getRepository(Organization);

	const org = repo.create({
		name: `Test Org ${orgCounter}`,
		slug: `test-org-${orgCounter}-${Date.now()}`,
		enabled: true,
		redirectToSpace: false,
		...overrides,
	});

	return repo.save(org);
}
