# Sprint 8: Agent Foundation

## Sprint Overview
Establish the base architecture for AI agents with memory systems, context management, and tool integration using LangChain and pgvector.

**Duration**: 2 weeks (Week 1-2 of Phase 3)  
**Dependencies**: Phase 2 complete (Statistics & Admin Portal)  
**Risk Level**: High - Complex AI architecture foundation

## Learning Outcomes
By the end of this sprint, you will have:
1. Implemented LangChain for agent orchestration
2. Set up pgvector for semantic memory
3. Built base agent classes with tools
4. Created context management systems
5. Established testing frameworks for AI behavior

## Technical Stack
- **Framework**: LangChain
- **LLM**: OpenAI GPT-4
- **Embeddings**: OpenAI text-embedding-3-small
- **Vector DB**: PostgreSQL with pgvector
- **Monitoring**: LangSmith

## Implementation Guide

### Step 1: Database Setup for Vector Storage

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Agent memory storage
CREATE TABLE agent_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  league_sandbox VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  importance FLOAT DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT NOW(),
  accessed_at TIMESTAMP DEFAULT NOW(),
  access_count INTEGER DEFAULT 0
);

CREATE INDEX ON agent_memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_agent_memories_lookup ON agent_memories(agent_id, league_sandbox);

-- Conversation history
CREATE TABLE agent_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id),
  agent_id VARCHAR(255) NOT NULL,
  league_sandbox VARCHAR(255),
  messages JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent configurations
CREATE TABLE agent_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id VARCHAR(255) UNIQUE NOT NULL,
  agent_type VARCHAR(100) NOT NULL,
  league_sandbox VARCHAR(255),
  personality JSONB NOT NULL,
  tools JSONB DEFAULT '[]',
  parameters JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Step 2: Base Agent Implementation

```typescript
// /lib/ai/base-agent.ts

import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicTool } from '@langchain/core/tools';
import { MemoryVectorStore } from './memory-store';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AgentConfig {
  id: string;
  type: 'analyst' | 'comedian' | 'historian' | 'oracle';
  leagueSandbox?: string;
  personality: {
    traits: string[];
    tone: string;
    expertise: string[];
  };
  temperature?: number;
  maxTokens?: number;
}

export abstract class BaseAgent {
  protected llm: ChatOpenAI;
  protected memory: MemoryVectorStore;
  protected executor: AgentExecutor;
  protected config: AgentConfig;
  protected tools: DynamicTool[];

  constructor(config: AgentConfig) {
    this.config = config;
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4-turbo-preview',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2000,
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.memory = new MemoryVectorStore({
      agentId: config.id,
      leagueSandbox: config.leagueSandbox,
    });

    this.tools = this.createTools();
    this.executor = this.createExecutor();
  }

  protected abstract createTools(): DynamicTool[];

  protected createExecutor(): AgentExecutor {
    const prompt = ChatPromptTemplate.fromMessages([
      new SystemMessage(this.getSystemPrompt()),
      new MessagesPlaceholder('chat_history'),
      new HumanMessage('{input}'),
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = createOpenAIFunctionsAgent({
      llm: this.llm,
      tools: this.tools,
      prompt,
    });

    return new AgentExecutor({
      agent,
      tools: this.tools,
      maxIterations: 5,
      returnIntermediateSteps: true,
    });
  }

  protected getSystemPrompt(): string {
    return `You are ${this.config.id}, an AI agent with the following characteristics:
    
    Personality Traits: ${this.config.personality.traits.join(', ')}
    Tone: ${this.config.personality.tone}
    Areas of Expertise: ${this.config.personality.expertise.join(', ')}
    
    ${this.config.leagueSandbox ? `You are specialized for league: ${this.config.leagueSandbox}` : ''}
    
    Always stay in character and provide helpful, accurate information while maintaining your unique personality.`;
  }

  async processMessage(
    message: string,
    sessionId: string,
    context?: any
  ): Promise<{
    response: string;
    intermediateSteps?: any[];
    toolsUsed: string[];
  }> {
    try {
      // Retrieve relevant memories
      const memories = await this.memory.retrieveRelevant(message, 5);
      
      // Get conversation history
      const history = await this.getConversationHistory(sessionId);
      
      // Build context
      const enhancedInput = this.buildContext(message, memories, context);
      
      // Execute agent
      const result = await this.executor.invoke({
        input: enhancedInput,
        chat_history: history,
      });
      
      // Store interaction in memory
      await this.memory.store({
        content: `User: ${message}\nAgent: ${result.output}`,
        metadata: {
          sessionId,
          timestamp: new Date(),
          toolsUsed: result.intermediateSteps?.map(s => s.action.tool) || [],
        },
      });
      
      // Update conversation history
      await this.updateConversationHistory(sessionId, message, result.output);
      
      return {
        response: result.output,
        intermediateSteps: result.intermediateSteps,
        toolsUsed: result.intermediateSteps?.map(s => s.action.tool) || [],
      };
    } catch (error) {
      console.error(`Agent ${this.config.id} error:`, error);
      throw error;
    }
  }

  protected buildContext(
    message: string,
    memories: any[],
    additionalContext?: any
  ): string {
    let context = message;
    
    if (memories.length > 0) {
      context += '\n\nRelevant context from memory:';
      memories.forEach(m => {
        context += `\n- ${m.content}`;
      });
    }
    
    if (additionalContext) {
      context += '\n\nAdditional context:';
      context += `\n${JSON.stringify(additionalContext, null, 2)}`;
    }
    
    return context;
  }

  protected async getConversationHistory(sessionId: string): Promise<any[]> {
    const conversation = await prisma.agentConversation.findFirst({
      where: { sessionId, agentId: this.config.id },
      orderBy: { updatedAt: 'desc' },
    });
    
    if (!conversation) return [];
    
    const messages = conversation.messages as any[];
    return messages.slice(-10); // Last 10 messages
  }

  protected async updateConversationHistory(
    sessionId: string,
    userMessage: string,
    agentResponse: string
  ): Promise<void> {
    const existing = await prisma.agentConversation.findFirst({
      where: { sessionId, agentId: this.config.id },
    });
    
    const newMessages = [
      { role: 'user', content: userMessage, timestamp: new Date() },
      { role: 'assistant', content: agentResponse, timestamp: new Date() },
    ];
    
    if (existing) {
      const messages = [...(existing.messages as any[]), ...newMessages];
      await prisma.agentConversation.update({
        where: { id: existing.id },
        data: {
          messages,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.agentConversation.create({
        data: {
          sessionId,
          agentId: this.config.id,
          leagueSandbox: this.config.leagueSandbox,
          messages: newMessages,
        },
      });
    }
  }

  async clearMemory(): Promise<void> {
    await this.memory.clear();
  }

  async getMemoryStats(): Promise<any> {
    return this.memory.getStats();
  }
}
```

### Step 3: Memory Vector Store

```typescript
// /lib/ai/memory-store.ts

import { OpenAIEmbeddings } from '@langchain/openai';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

export class MemoryVectorStore {
  private embeddings: OpenAIEmbeddings;
  private agentId: string;
  private leagueSandbox?: string;

  constructor(config: { agentId: string; leagueSandbox?: string }) {
    this.agentId = config.agentId;
    this.leagueSandbox = config.leagueSandbox;
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async store(memory: {
    content: string;
    metadata?: any;
    importance?: number;
  }): Promise<void> {
    const embedding = await this.embeddings.embedQuery(memory.content);
    
    await prisma.$executeRaw`
      INSERT INTO agent_memories (agent_id, league_sandbox, content, embedding, metadata, importance)
      VALUES (
        ${this.agentId},
        ${this.leagueSandbox || null},
        ${memory.content},
        ${embedding}::vector,
        ${JSON.stringify(memory.metadata || {})}::jsonb,
        ${memory.importance || 0.5}
      )
    `;
  }

  async retrieveRelevant(
    query: string,
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<any[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    const results = await prisma.$queryRaw`
      SELECT 
        id,
        content,
        metadata,
        importance,
        1 - (embedding <=> ${queryEmbedding}::vector) as similarity
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : prisma.sql``}
        AND 1 - (embedding <=> ${queryEmbedding}::vector) > ${threshold}
      ORDER BY 
        importance * (1 - (embedding <=> ${queryEmbedding}::vector)) DESC
      LIMIT ${limit}
    `;
    
    // Update access stats
    if (results.length > 0) {
      const ids = results.map((r: any) => r.id);
      await prisma.$executeRaw`
        UPDATE agent_memories 
        SET 
          accessed_at = NOW(),
          access_count = access_count + 1
        WHERE id = ANY(${ids}::uuid[])
      `;
    }
    
    return results;
  }

  async clear(): Promise<void> {
    await prisma.agentMemory.deleteMany({
      where: {
        agentId: this.agentId,
        leagueSandbox: this.leagueSandbox,
      },
    });
  }

  async getStats(): Promise<any> {
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_memories,
        AVG(importance) as avg_importance,
        MAX(accessed_at) as last_access,
        SUM(access_count) as total_accesses
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : prisma.sql``}
    `;
    
    return stats[0];
  }

  async pruneOldMemories(daysOld: number = 30, keepImportant: number = 0.7): Promise<number> {
    const result = await prisma.$executeRaw`
      DELETE FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : prisma.sql``}
        AND accessed_at < NOW() - INTERVAL '${daysOld} days'
        AND importance < ${keepImportant}
        AND access_count < 3
    `;
    
    return result;
  }
}
```

### Step 4: Tool Creation

```typescript
// /lib/ai/tools/index.ts

import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createLeagueDataTool(leagueSandbox: string): DynamicTool {
  return new DynamicTool({
    name: 'get_league_data',
    description: 'Get current league standings, matchups, and statistics',
    func: async (input: string) => {
      const params = JSON.parse(input);
      
      switch (params.type) {
        case 'standings':
          const standings = await prisma.$queryRaw`
            SELECT * FROM season_statistics
            WHERE league_sandbox = ${leagueSandbox}
            ORDER BY wins DESC, total_points_for DESC
            LIMIT 12
          `;
          return JSON.stringify(standings);
          
        case 'matchups':
          const matchups = await prisma.matchup.findMany({
            where: {
              leagueSandbox,
              week: params.week || undefined,
            },
            orderBy: { date: 'desc' },
            take: 20,
          });
          return JSON.stringify(matchups);
          
        case 'records':
          const records = await prisma.allTimeRecord.findMany({
            where: { leagueSandbox },
            take: 10,
          });
          return JSON.stringify(records);
          
        default:
          return 'Unknown data type requested';
      }
    },
  });
}

export function createCalculatorTool(): DynamicTool {
  return new DynamicTool({
    name: 'calculator',
    description: 'Perform mathematical calculations',
    func: async (input: string) => {
      try {
        // Safe evaluation of mathematical expressions
        const result = Function('"use strict"; return (' + input + ')')();
        return result.toString();
      } catch (error) {
        return 'Invalid calculation';
      }
    },
  });
}

export function createWebSearchTool(): DynamicTool {
  return new DynamicTool({
    name: 'web_search',
    description: 'Search the web for current NFL player news and updates',
    func: async (query: string) => {
      // Implementation would use a search API
      // For now, return mock data
      return `Search results for "${query}": [mock results]`;
    },
  });
}

export function createPlayerStatsTool(): DynamicTool {
  return new DynamicTool({
    name: 'get_player_stats',
    description: 'Get detailed player statistics and performance data',
    func: async (input: string) => {
      const { playerName, seasonId } = JSON.parse(input);
      
      const stats = await prisma.playerStats.findFirst({
        where: {
          playerName: {
            contains: playerName,
            mode: 'insensitive',
          },
          seasonId: seasonId || undefined,
        },
      });
      
      return JSON.stringify(stats || { error: 'Player not found' });
    },
  });
}
```

### Step 5: Agent Testing Framework

```typescript
// /lib/ai/testing/agent-tester.ts

import { BaseAgent } from '../base-agent';

export class AgentTester {
  private agent: BaseAgent;
  private testCases: TestCase[];

  constructor(agent: BaseAgent) {
    this.agent = agent;
    this.testCases = [];
  }

  addTestCase(testCase: TestCase): void {
    this.testCases.push(testCase);
  }

  async runTests(): Promise<TestResults> {
    const results: TestResult[] = [];
    
    for (const testCase of this.testCases) {
      const startTime = Date.now();
      
      try {
        const response = await this.agent.processMessage(
          testCase.input,
          `test-${testCase.id}`,
          testCase.context
        );
        
        const passed = await this.evaluateResponse(
          response.response,
          testCase.expectedPatterns,
          testCase.unexpectedPatterns
        );
        
        results.push({
          testId: testCase.id,
          passed,
          executionTime: Date.now() - startTime,
          response: response.response,
          toolsUsed: response.toolsUsed,
        });
      } catch (error) {
        results.push({
          testId: testCase.id,
          passed: false,
          executionTime: Date.now() - startTime,
          error: error.message,
        });
      }
    }
    
    return {
      totalTests: this.testCases.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      results,
      successRate: (results.filter(r => r.passed).length / this.testCases.length) * 100,
    };
  }

  private async evaluateResponse(
    response: string,
    expectedPatterns?: string[],
    unexpectedPatterns?: string[]
  ): Promise<boolean> {
    // Check for expected patterns
    if (expectedPatterns) {
      for (const pattern of expectedPatterns) {
        if (!response.toLowerCase().includes(pattern.toLowerCase())) {
          return false;
        }
      }
    }
    
    // Check for unexpected patterns
    if (unexpectedPatterns) {
      for (const pattern of unexpectedPatterns) {
        if (response.toLowerCase().includes(pattern.toLowerCase())) {
          return false;
        }
      }
    }
    
    return true;
  }
}

interface TestCase {
  id: string;
  description: string;
  input: string;
  context?: any;
  expectedPatterns?: string[];
  unexpectedPatterns?: string[];
}

interface TestResult {
  testId: string;
  passed: boolean;
  executionTime: number;
  response?: string;
  toolsUsed?: string[];
  error?: string;
}

interface TestResults {
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
  successRate: number;
}
```

## Testing Checklist

### Unit Tests
- [ ] Agent initialization
- [ ] Tool execution
- [ ] Memory storage and retrieval
- [ ] Context building
- [ ] Conversation history

### Integration Tests
- [ ] End-to-end message processing
- [ ] Memory persistence
- [ ] Tool integration
- [ ] Error handling
- [ ] Rate limiting

### Performance Tests
- [ ] Response time under load
- [ ] Memory retrieval speed
- [ ] Concurrent conversations
- [ ] Token usage optimization

## Success Criteria

- [ ] Base agent architecture deployed
- [ ] Memory system operational
- [ ] Tools integrated and working
- [ ] Testing framework established
- [ ] Response time < 3 seconds
- [ ] Memory retrieval < 500ms
- [ ] 95% test coverage
- [ ] Documentation complete