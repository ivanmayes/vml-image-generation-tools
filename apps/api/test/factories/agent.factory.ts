import { DataSource } from 'typeorm';
import { Agent, AgentStatus } from '../../src/agent/agent.entity';

let agentCounter = 0;

/**
 * Create and persist a real Agent entity.
 * Requires an existing organizationId.
 */
export async function createAgent(
	ds: DataSource,
	organizationId: string,
	overrides: Partial<Agent> = {},
): Promise<Agent> {
	agentCounter++;
	const repo = ds.getRepository(Agent);

	const agent = repo.create({
		organizationId,
		name: `Test Agent ${agentCounter}`,
		systemPrompt: 'You are a test evaluation agent.',
		evaluationCategories: 'composition,lighting,color',
		optimizationWeight: 50,
		scoringWeight: 50,
		ragConfig: { topK: 5, similarityThreshold: 0.7 },
		canJudge: true,
		status: AgentStatus.ACTIVE,
		capabilities: [],
		teamAgentIds: [],
		...overrides,
	});

	return repo.save(agent);
}
