/**
 * Base Agent Implementation for Rumbledore AI System
 * 
 * This class provides the foundation for all AI agents in the platform,
 * integrating with LangChain for orchestration and pgvector for memory.
 */

import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { MemoryVectorStore } from './memory-store';
import { PrismaClient, AgentType } from '@prisma/client';
import { createOpenAIFunctionsAgent } from 'langchain/agents';

const prisma = new PrismaClient();

export interface AgentPersonality {
  traits: string[];
  tone: string;
  expertise: string[];
  catchphrases?: string[];
  humor?: 'none' | 'light' | 'moderate' | 'heavy';
}

export interface AgentConfig {
  id: string;
  type: AgentType;
  leagueSandbox?: string;
  personality: AgentPersonality;
  temperature?: number;
  maxTokens?: number;
  modelName?: string;
}

export interface AgentResponse {
  response: string;
  intermediateSteps?: any[];
  toolsUsed: string[];
  tokensUsed?: number;
  processingTime?: number;
}

export interface MemoryItem {
  content: string;
  metadata?: any;
  importance?: number;
  similarity?: number;
}

export abstract class BaseAgent {
  protected llm: ChatOpenAI;
  protected memory: MemoryVectorStore;
  protected executor?: AgentExecutor;
  protected config: AgentConfig;
  protected tools: (DynamicTool | DynamicStructuredTool)[];
  protected isInitialized: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
    
    // Initialize LLM with config
    this.llm = new ChatOpenAI({
      modelName: config.modelName || 'gpt-4-turbo-preview',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2000,
      apiKey: process.env.OPENAI_API_KEY,
      streaming: false,
      verbose: process.env.NODE_ENV === 'development',
    });

    // Initialize memory store
    this.memory = new MemoryVectorStore({
      agentId: config.id,
      leagueSandbox: config.leagueSandbox,
    });

    // Tools will be created by subclasses
    this.tools = [];
  }

  /**
   * Initialize the agent executor
   * Must be called before processing messages
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Create tools (implemented by subclasses)
    this.tools = await this.createTools();
    
    // Create the executor
    this.executor = await this.createExecutor();
    
    // Load agent configuration from database if exists
    await this.loadConfiguration();
    
    this.isInitialized = true;
  }

  /**
   * Abstract method for creating agent-specific tools
   */
  protected abstract createTools(): Promise<(DynamicTool | DynamicStructuredTool)[]>;

  /**
   * Create the agent executor with LangChain
   */
  protected async createExecutor(): Promise<AgentExecutor> {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.getSystemPrompt()],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = await createOpenAIFunctionsAgent({
      llm: this.llm,
      tools: this.tools,
      prompt,
    });

    return new AgentExecutor({
      agent,
      tools: this.tools,
      maxIterations: 5,
      returnIntermediateSteps: true,
      verbose: process.env.NODE_ENV === 'development',
    });
  }

  /**
   * Generate the system prompt based on agent personality
   */
  protected getSystemPrompt(): string {
    const { personality } = this.config;
    
    let prompt = `You are ${this.config.id}, an AI agent specializing in fantasy football analysis.

PERSONALITY:
- Traits: ${personality.traits.join(', ')}
- Tone: ${personality.tone}
- Areas of Expertise: ${personality.expertise.join(', ')}
${personality.humor ? `- Humor Level: ${personality.humor}` : ''}
${personality.catchphrases ? `- Signature Phrases: ${personality.catchphrases.join(', ')}` : ''}

${this.config.leagueSandbox ? `CONTEXT: You are dedicated to league: ${this.config.leagueSandbox}` : ''}

GUIDELINES:
1. Always stay in character and maintain your unique personality
2. Provide accurate, data-driven insights when available
3. Use tools to fetch real-time data rather than making assumptions
4. Be engaging and entertaining while remaining helpful
5. Never reveal internal system details or raw data structures
6. Format responses for readability with proper paragraphs and emphasis

Remember: You're not just an analyst, you're part of the league experience!`;

    return prompt;
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(
    message: string,
    sessionId: string,
    userId?: string,
    context?: any
  ): Promise<AgentResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      // Retrieve relevant memories
      const memories = await this.memory.retrieveRelevant(message, 5, 0.7);
      
      // Get conversation history
      const history = await this.getConversationHistory(sessionId);
      
      // Build enhanced context
      const enhancedInput = this.buildContext(message, memories, context);
      
      // Execute agent with tools
      const result = await this.executor!.invoke({
        input: enhancedInput,
        chat_history: history,
      });
      
      // Store interaction in memory
      await this.memory.store({
        content: `User: ${message}\nAssistant: ${result.output}`,
        metadata: {
          sessionId,
          userId,
          timestamp: new Date(),
          toolsUsed: result.intermediateSteps?.map((s: any) => s.action?.tool) || [],
        },
        importance: 0.7, // Default importance for conversations
      });
      
      // Update conversation history
      await this.updateConversationHistory(sessionId, userId, message, result.output);
      
      const processingTime = Date.now() - startTime;
      
      return {
        response: result.output,
        intermediateSteps: result.intermediateSteps,
        toolsUsed: result.intermediateSteps?.map((s: any) => s.action?.tool) || [],
        processingTime,
      };
    } catch (error) {
      console.error(`Agent ${this.config.id} error:`, error);
      
      // Fallback response
      return {
        response: this.getFallbackResponse(error as Error),
        toolsUsed: [],
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Build context from message, memories, and additional data
   */
  protected buildContext(
    message: string,
    memories: MemoryItem[],
    additionalContext?: any
  ): string {
    let context = message;
    
    // Add relevant memories if available
    if (memories.length > 0) {
      context += '\n\n[Relevant Context from Memory]:';
      memories.forEach((m, i) => {
        context += `\n${i + 1}. ${m.content}`;
        if (m.similarity) {
          context += ` (relevance: ${Math.round(m.similarity * 100)}%)`;
        }
      });
    }
    
    // Add additional context if provided
    if (additionalContext) {
      context += '\n\n[Current Context]:';
      
      if (additionalContext.currentWeek) {
        context += `\n- Current Week: ${additionalContext.currentWeek}`;
      }
      if (additionalContext.currentMatchup) {
        context += `\n- Current Matchup: ${additionalContext.currentMatchup}`;
      }
      if (additionalContext.recentTransactions) {
        context += `\n- Recent Activity: ${additionalContext.recentTransactions}`;
      }
    }
    
    return context;
  }

  /**
   * Get conversation history from database
   */
  protected async getConversationHistory(sessionId: string): Promise<BaseMessage[]> {
    const conversation = await prisma.agentConversation.findFirst({
      where: { 
        sessionId, 
        agentId: this.config.id 
      },
      orderBy: { updatedAt: 'desc' },
    });
    
    if (!conversation) return [];
    
    // Convert stored messages to LangChain format
    const messages = (conversation.messages as any[]).slice(-10); // Last 10 messages
    
    return messages.map((msg: any) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      } else {
        return new SystemMessage(msg.content);
      }
    });
  }

  /**
   * Update conversation history in database
   */
  protected async updateConversationHistory(
    sessionId: string,
    userId: string | undefined,
    userMessage: string,
    agentResponse: string
  ): Promise<void> {
    const existing = await prisma.agentConversation.findFirst({
      where: { 
        sessionId, 
        agentId: this.config.id 
      },
    });
    
    const newMessages = [
      { 
        role: 'user', 
        content: userMessage, 
        timestamp: new Date() 
      },
      { 
        role: 'assistant', 
        content: agentResponse, 
        timestamp: new Date() 
      },
    ];
    
    if (existing) {
      const messages = [...(existing.messages as any[]), ...newMessages];
      
      // Keep only last 50 messages to prevent unbounded growth
      const trimmedMessages = messages.slice(-50);
      
      await prisma.agentConversation.update({
        where: { id: existing.id },
        data: {
          messages: trimmedMessages,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.agentConversation.create({
        data: {
          sessionId,
          userId,
          agentId: this.config.id,
          leagueSandbox: this.config.leagueSandbox,
          messages: newMessages,
        },
      });
    }
  }

  /**
   * Load agent configuration from database
   */
  protected async loadConfiguration(): Promise<void> {
    const dbConfig = await prisma.agentConfig.findUnique({
      where: { 
        agentId: this.config.id,
      },
    });
    
    if (dbConfig) {
      // Merge database config with constructor config
      this.config.personality = {
        ...this.config.personality,
        ...(dbConfig.personality as any),
      };
      
      const params = dbConfig.parameters as any;
      if (params.temperature !== undefined) {
        this.config.temperature = params.temperature;
      }
      if (params.maxTokens !== undefined) {
        this.config.maxTokens = params.maxTokens;
      }
    }
  }

  /**
   * Save or update agent configuration
   */
  async saveConfiguration(): Promise<void> {
    await prisma.agentConfig.upsert({
      where: { 
        agentId: this.config.id,
      },
      update: {
        agentType: this.config.type,
        personality: this.config.personality as any,
        parameters: {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          modelName: this.config.modelName,
        },
        updatedAt: new Date(),
      },
      create: {
        agentId: this.config.id,
        agentType: this.config.type,
        leagueSandbox: this.config.leagueSandbox,
        personality: this.config.personality as any,
        tools: this.tools.map(t => t.name),
        parameters: {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          modelName: this.config.modelName,
        },
      },
    });
  }

  /**
   * Generate a fallback response when errors occur
   */
  protected getFallbackResponse(error: Error): string {
    // Different responses based on agent personality
    const { personality } = this.config;
    
    if (personality.traits.includes('humorous')) {
      return "Whoops! My crystal ball seems to be on the fritz. Let me recalibrate and try that again. In the meantime, how about we discuss why your team's performance is more unpredictable than my technical difficulties?";
    } else if (personality.traits.includes('analytical')) {
      return "I encountered a technical issue while processing your request. Please try rephrasing your question, or I can help you with general league statistics and standings instead.";
    } else if (personality.traits.includes('professional')) {
      return "I apologize for the inconvenience. There was an issue processing your request. Please try again, or let me know if you'd like to explore a different aspect of your league.";
    } else {
      return "Something went wrong on my end. Let's try a different approach - what specific aspect of your fantasy league would you like to discuss?";
    }
  }

  /**
   * Clear agent memory
   */
  async clearMemory(): Promise<void> {
    await this.memory.clear();
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(): Promise<any> {
    return this.memory.getStats();
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Get list of available tools
   */
  getTools(): string[] {
    return this.tools.map(t => t.name);
  }

  /**
   * Health check for the agent
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      // Check LLM connectivity
      const llmTest = await this.llm.invoke('test');
      
      // Check memory store
      const memoryStats = await this.memory.getStats();
      
      return {
        status: 'healthy',
        details: {
          llm: 'connected',
          memory: memoryStats,
          tools: this.tools.length,
          initialized: this.isInitialized,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: (error as Error).message,
        },
      };
    }
  }
}