/**
 * Agent Factory
 * 
 * Factory pattern implementation for creating and managing AI agents.
 * Handles agent instantiation, caching, and lifecycle management.
 */

import { BaseAgent } from './base-agent';
import { CommissionerAgent } from './agents/commissioner';
import { AnalystAgent } from './agents/analyst';
import { AgentType } from '@prisma/client';

// Agent cache to avoid recreating agents unnecessarily
const agentCache = new Map<string, BaseAgent>();

/**
 * Agent factory configuration
 */
export interface AgentFactoryConfig {
  agentType: AgentType;
  leagueSandbox?: string;
  forceNew?: boolean; // Force creation of new instance
}

/**
 * Create an agent based on type and configuration
 */
export async function createAgent(config: AgentFactoryConfig): Promise<BaseAgent> {
  const cacheKey = `${config.agentType}-${config.leagueSandbox || 'global'}`;

  // Check cache unless forced to create new
  if (!config.forceNew && agentCache.has(cacheKey)) {
    const cachedAgent = agentCache.get(cacheKey)!;
    
    // Verify agent is healthy
    const health = await cachedAgent.healthCheck();
    if (health.status === 'healthy') {
      return cachedAgent;
    }
    
    // Remove unhealthy agent from cache
    agentCache.delete(cacheKey);
  }

  // Create new agent instance
  let agent: BaseAgent;

  switch (config.agentType) {
    case AgentType.COMMISSIONER:
      agent = new CommissionerAgent(config.leagueSandbox);
      break;

    case AgentType.ANALYST:
      agent = new AnalystAgent(config.leagueSandbox);
      break;

    case AgentType.NARRATOR:
      // TODO: Implement NarratorAgent
      agent = new CommissionerAgent(config.leagueSandbox); // Fallback for now
      break;

    case AgentType.TRASH_TALKER:
      // TODO: Implement TrashTalkerAgent
      agent = new CommissionerAgent(config.leagueSandbox); // Fallback for now
      break;

    case AgentType.BETTING_ADVISOR:
      // TODO: Implement BettingAdvisorAgent
      agent = new AnalystAgent(config.leagueSandbox); // Fallback for now
      break;

    default:
      throw new Error(`Unknown agent type: ${config.agentType}`);
  }

  // Initialize the agent
  await agent.initialize();

  // Cache the agent
  agentCache.set(cacheKey, agent);

  return agent;
}

/**
 * Get all cached agents
 */
export function getCachedAgents(): Map<string, BaseAgent> {
  return new Map(agentCache);
}

/**
 * Clear agent cache
 */
export function clearAgentCache(): void {
  agentCache.clear();
}

/**
 * Remove specific agent from cache
 */
export function removeCachedAgent(agentType: AgentType, leagueSandbox?: string): boolean {
  const cacheKey = `${agentType}-${leagueSandbox || 'global'}`;
  return agentCache.delete(cacheKey);
}

/**
 * Get agent health status
 */
export async function getAgentHealth(
  agentType: AgentType,
  leagueSandbox?: string
): Promise<{ status: string; details?: any }> {
  const cacheKey = `${agentType}-${leagueSandbox || 'global'}`;
  const agent = agentCache.get(cacheKey);

  if (!agent) {
    return { status: 'not_initialized' };
  }

  return agent.healthCheck();
}

/**
 * Preload agents for a league
 */
export async function preloadLeagueAgents(leagueSandbox: string): Promise<void> {
  const agentTypes = Object.values(AgentType);

  await Promise.all(
    agentTypes.map(type =>
      createAgent({
        agentType: type,
        leagueSandbox,
      })
    )
  );
}

/**
 * Clean up old agents (for memory management)
 */
export async function cleanupInactiveAgents(maxAge: number = 3600000): Promise<number> {
  let cleaned = 0;
  const now = Date.now();

  for (const [key, agent] of agentCache.entries()) {
    const stats = await agent.getMemoryStats();
    
    // Remove agents that haven't been accessed recently
    if (stats.lastAccess && (now - new Date(stats.lastAccess).getTime()) > maxAge) {
      agentCache.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Get agent statistics
 */
export async function getAgentStatistics(): Promise<{
  totalCached: number;
  byType: Record<string, number>;
  healthStatus: Record<string, string>;
}> {
  const byType: Record<string, number> = {};
  const healthStatus: Record<string, string> = {};

  for (const [key, agent] of agentCache.entries()) {
    const config = agent.getConfig();
    byType[config.type] = (byType[config.type] || 0) + 1;

    const health = await agent.healthCheck();
    healthStatus[key] = health.status;
  }

  return {
    totalCached: agentCache.size,
    byType,
    healthStatus,
  };
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: any): boolean {
  if (!config.agentType || !Object.values(AgentType).includes(config.agentType)) {
    return false;
  }

  if (config.leagueSandbox && typeof config.leagueSandbox !== 'string') {
    return false;
  }

  return true;
}

/**
 * Get available agent types
 */
export function getAvailableAgentTypes(): AgentType[] {
  return Object.values(AgentType);
}

/**
 * Get agent type description
 */
export function getAgentTypeDescription(agentType: AgentType): string {
  const descriptions: Record<AgentType, string> = {
    [AgentType.COMMISSIONER]: 'The authoritative voice of the league, handling rules and disputes',
    [AgentType.ANALYST]: 'Data-driven expert providing statistical insights and projections',
    [AgentType.NARRATOR]: 'Dramatic storyteller bringing league events to life',
    [AgentType.TRASH_TALKER]: 'Playful provocateur keeping rivalries entertaining',
    [AgentType.BETTING_ADVISOR]: 'Strategic advisor for paper betting opportunities',
  };

  return descriptions[agentType] || 'Unknown agent type';
}

/**
 * Export agent configurations for backup
 */
export async function exportAgentConfigurations(): Promise<any[]> {
  const configs = [];

  for (const [key, agent] of agentCache.entries()) {
    const config = agent.getConfig();
    const stats = await agent.getMemoryStats();

    configs.push({
      key,
      config,
      stats,
      tools: agent.getTools(),
    });
  }

  return configs;
}

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    clearAgentCache();
  });
}