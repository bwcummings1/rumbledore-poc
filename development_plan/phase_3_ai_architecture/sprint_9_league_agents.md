# Sprint 9: League Agents

## Sprint Overview
Create specialized AI agents for each league with unique personalities, capabilities, and contextual knowledge.

**Duration**: 2 weeks (Week 3-4 of Phase 3)  
**Dependencies**: Sprint 8 (Agent Foundation) must be complete  
**Risk Level**: Medium - Personality consistency and differentiation challenges

## Implementation Guide

### Specialized Agent Types

```typescript
// /lib/ai/agents/league-analyst.ts
import { BaseAgent } from '../base-agent';
import { DynamicTool } from '@langchain/core/tools';
import { createLeagueDataTool, createCalculatorTool, createPlayerStatsTool } from '../tools';

export class LeagueAnalyst extends BaseAgent {
  protected createTools(): DynamicTool[] {
    return [
      createLeagueDataTool(this.config.leagueSandbox!),
      createCalculatorTool(),
      createPlayerStatsTool(),
      new DynamicTool({
        name: 'analyze_trends',
        description: 'Analyze performance trends and patterns',
        func: async (input: string) => {
          const data = JSON.parse(input);
          // Trend analysis implementation
          return JSON.stringify({ trend: 'upward', confidence: 0.85 });
        },
      }),
    ];
  }

  protected getSystemPrompt(): string {
    return `You are the League Analyst for ${this.config.leagueSandbox}.
    
    Your role is to provide data-driven insights, statistical analysis, and strategic recommendations.
    You excel at identifying patterns, trends, and making predictions based on historical data.
    
    Key responsibilities:
    - Analyze team and player performance
    - Identify statistical trends and anomalies
    - Provide strategic recommendations
    - Create power rankings based on data
    - Predict matchup outcomes using analytics
    
    Always support your analysis with specific data points and calculations.`;
  }
}
```

```typescript
// /lib/ai/agents/league-comedian.ts
export class LeagueComedian extends BaseAgent {
  protected createTools(): DynamicTool[] {
    return [
      createLeagueDataTool(this.config.leagueSandbox!),
      new DynamicTool({
        name: 'generate_roast',
        description: 'Generate a funny roast about a team or player',
        func: async (input: string) => {
          // Roast generation logic
          return `Generated roast for ${input}`;
        },
      }),
      new DynamicTool({
        name: 'create_meme_caption',
        description: 'Create a meme caption for a fantasy situation',
        func: async (input: string) => {
          // Meme caption generation
          return `Meme caption: When you bench a player and they score 40 points...`;
        },
      }),
    ];
  }

  protected getSystemPrompt(): string {
    return `You are the League Comedian for ${this.config.leagueSandbox}.
    
    Your role is to bring humor, entertainment, and levity to the league experience.
    You excel at witty observations, playful trash talk, and finding humor in fantasy mishaps.
    
    Key responsibilities:
    - Create humorous commentary on matchups
    - Generate funny nicknames and roasts
    - Point out ironic or amusing situations
    - Keep trash talk playful and fun
    - Celebrate epic fails with humor
    
    Keep it light, fun, and never mean-spirited. Fantasy football should be enjoyable!`;
  }
}
```

### Agent Factory and Management

```typescript
// /lib/ai/agent-factory.ts
import { LeagueAnalyst } from './agents/league-analyst';
import { LeagueComedian } from './agents/league-comedian';
import { LeagueHistorian } from './agents/league-historian';
import { LeagueOracle } from './agents/league-oracle';
import { BaseAgent, AgentConfig } from './base-agent';

export class AgentFactory {
  private static agents = new Map<string, BaseAgent>();

  static createAgent(config: AgentConfig): BaseAgent {
    const key = `${config.type}-${config.leagueSandbox || 'global'}`;
    
    if (this.agents.has(key)) {
      return this.agents.get(key)!;
    }

    let agent: BaseAgent;
    
    switch (config.type) {
      case 'analyst':
        agent = new LeagueAnalyst(config);
        break;
      case 'comedian':
        agent = new LeagueComedian(config);
        break;
      case 'historian':
        agent = new LeagueHistorian(config);
        break;
      case 'oracle':
        agent = new LeagueOracle(config);
        break;
      default:
        throw new Error(`Unknown agent type: ${config.type}`);
    }

    this.agents.set(key, agent);
    return agent;
  }

  static getAgent(type: string, leagueSandbox?: string): BaseAgent | undefined {
    const key = `${type}-${leagueSandbox || 'global'}`;
    return this.agents.get(key);
  }

  static getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  static clearAgents(): void {
    this.agents.clear();
  }
}
```

### Multi-Agent Collaboration

```typescript
// /lib/ai/multi-agent-orchestrator.ts
export class MultiAgentOrchestrator {
  async collaborativeAnalysis(
    topic: string,
    leagueSandbox: string,
    agentTypes: string[] = ['analyst', 'historian', 'oracle']
  ): Promise<CollaborativeResult> {
    const agents = agentTypes.map(type => 
      AgentFactory.getAgent(type, leagueSandbox)
    ).filter(Boolean);

    const perspectives = await Promise.all(
      agents.map(agent => 
        agent!.processMessage(topic, `collab-${Date.now()}`)
      )
    );

    // Synthesize perspectives
    const synthesis = await this.synthesizePerspectives(perspectives);

    return {
      topic,
      perspectives: perspectives.map((p, i) => ({
        agent: agentTypes[i],
        response: p.response,
        toolsUsed: p.toolsUsed,
      })),
      synthesis,
    };
  }

  private async synthesizePerspectives(perspectives: any[]): Promise<string> {
    // Use a synthesizer agent or LLM to combine perspectives
    return `Combined analysis from ${perspectives.length} agents...`;
  }
}
```

## Success Criteria
- [ ] All agent types implemented
- [ ] Personality consistency maintained
- [ ] League-specific knowledge integrated
- [ ] Multi-agent collaboration working
- [ ] Response quality high
- [ ] Performance optimized
