import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Agent } from '../agent.entity';

export interface CycleValidationResult {
	hasCycle: boolean;
	cyclePath?: string[];
}

/**
 * Validates team configurations for circular references.
 *
 * Uses DFS with recursion stack to detect cycles in the agent team graph.
 * A cycle occurs when an agent includes another agent in its team that
 * directly or indirectly includes the first agent.
 */
@Injectable()
export class TeamCycleValidator {
	constructor(
		@InjectRepository(Agent)
		private readonly agentRepository: Repository<Agent>,
	) {}

	/**
	 * Validate that adding the proposed team members to an agent won't create a cycle.
	 * Resolves agent names for user-friendly error messages.
	 *
	 * @throws BadRequestException if a cycle would be created
	 */
	async validate(
		agentId: string,
		proposedTeamIds: string[],
		organizationId: string,
	): Promise<void> {
		if (!proposedTeamIds?.length) {
			return;
		}

		const filteredTeamIds = proposedTeamIds.filter((id) => id !== agentId);
		if (!filteredTeamIds.length) {
			return;
		}

		const agents = await this.agentRepository.find({
			where: { organizationId },
			select: ['id', 'teamAgentIds', 'name'],
		});

		const nameMap = new Map<string, string>();
		const graph = new Map<string, string[]>();

		for (const agent of agents) {
			nameMap.set(agent.id, agent.name);
			graph.set(agent.id, agent.teamAgentIds ?? []);
		}

		// Temporarily add the proposed team to the graph
		graph.set(agentId, filteredTeamIds);

		const result = this.detectCycle(agentId, graph);

		if (result.hasCycle && result.cyclePath) {
			const namedPath = result.cyclePath.map(
				(id) => nameMap.get(id) || id,
			);
			throw new BadRequestException(
				`Circular team reference detected: ${namedPath.join(' → ')}. ` +
					`An agent cannot include itself in its team hierarchy.`,
			);
		}
	}

	private detectCycle(
		startNode: string,
		graph: Map<string, string[]>,
	): CycleValidationResult {
		const visited = new Set<string>();
		const recursionStack = new Set<string>();
		const path: string[] = [];

		const dfs = (node: string): CycleValidationResult => {
			visited.add(node);
			recursionStack.add(node);
			path.push(node);

			const neighbors = graph.get(node) || [];

			for (const neighbor of neighbors) {
				if (recursionStack.has(neighbor)) {
					const cycleStartIndex = path.indexOf(neighbor);
					const cyclePath = [
						...path.slice(cycleStartIndex),
						neighbor,
					];
					return { hasCycle: true, cyclePath };
				}

				if (!visited.has(neighbor)) {
					const result = dfs(neighbor);
					if (result.hasCycle) {
						return result;
					}
				}
			}

			recursionStack.delete(node);
			path.pop();

			return { hasCycle: false };
		};

		return dfs(startNode);
	}
}
