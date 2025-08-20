/**
 * Multi-Agent Orchestrator
 * 
 * Coordinates multiple AI agents to provide comprehensive, multi-perspective
 * analysis and insights through collaborative intelligence.
 */

import { BaseAgent, AgentResponse } from './base-agent';
import { createAgent } from './agent-factory';
import { AgentType, PrismaClient } from '@prisma/client';
import { ChatOpenAI } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export interface AgentPerspective {
  agentType: AgentType | string;
  agentName: string;
  response: string;
  confidence?: string;
  toolsUsed: string[];
  processingTime: number;
}

export interface CollaborativeAnalysis {
  id: string;
  topic: string;
  question: string;
  perspectives: AgentPerspective[];
  synthesis: string;
  consensus?: string;
  disagreements?: string[];
  recommendations: string[];
  confidence: string;
  totalProcessingTime: number;
  timestamp: Date;
}

export interface OrchestratorConfig {
  leagueSandbox?: string;
  synthesisModel?: string;
  maxConcurrentAgents?: number;
  timeoutMs?: number;
}

export class MultiAgentOrchestrator {
  private config: OrchestratorConfig;
  private synthesizer: ChatOpenAI;
  private activeAgents: Map<string, BaseAgent>;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      maxConcurrentAgents: 5,
      timeoutMs: 30000,
      synthesisModel: 'gpt-4-turbo-preview',
      ...config,
    };

    // Initialize synthesizer LLM for combining perspectives
    this.synthesizer = new ChatOpenAI({
      modelName: this.config.synthesisModel,
      temperature: 0.3,
      maxTokens: 2000,
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.activeAgents = new Map();
  }

  /**
   * Perform collaborative analysis with multiple agents
   */
  async collaborativeAnalysis(
    question: string,
    agentTypes: (AgentType | string)[] = [
      AgentType.ANALYST,
      AgentType.NARRATOR,
      AgentType.COMMISSIONER,
    ],
    topic?: string
  ): Promise<CollaborativeAnalysis> {
    const startTime = Date.now();
    const analysisId = uuidv4();
    const sessionId = `collab-${analysisId}`;

    try {
      // Initialize all requested agents
      const agents = await this.initializeAgents(agentTypes);

      // Collect perspectives from all agents in parallel
      const perspectivePromises = agents.map(async ({ type, agent }) => {
        const agentStartTime = Date.now();
        
        try {
          const response = await Promise.race([
            agent.processMessage(question, sessionId),
            this.timeout(this.config.timeoutMs!),
          ]) as AgentResponse;

          return {
            agentType: type,
            agentName: this.getAgentName(type),
            response: response.response,
            toolsUsed: response.toolsUsed || [],
            processingTime: Date.now() - agentStartTime,
          } as AgentPerspective;
        } catch (error) {
          console.error(`Agent ${type} failed:`, error);
          return {
            agentType: type,
            agentName: this.getAgentName(type),
            response: 'Unable to provide perspective due to an error.',
            toolsUsed: [],
            processingTime: Date.now() - agentStartTime,
          } as AgentPerspective;
        }
      });

      const perspectives = await Promise.all(perspectivePromises);

      // Synthesize all perspectives into a unified analysis
      const synthesis = await this.synthesizePerspectives(question, perspectives);

      // Extract consensus and disagreements
      const { consensus, disagreements } = this.analyzeAgreement(perspectives);

      // Generate recommendations
      const recommendations = this.generateRecommendations(perspectives, synthesis);

      // Calculate overall confidence
      const confidence = this.calculateConfidence(perspectives);

      // Store the collaborative analysis
      await this.storeAnalysis({
        id: analysisId,
        topic: topic || 'General Analysis',
        question,
        perspectives,
        synthesis,
        consensus,
        disagreements,
        recommendations,
        confidence,
        totalProcessingTime: Date.now() - startTime,
        timestamp: new Date(),
      });

      return {
        id: analysisId,
        topic: topic || 'General Analysis',
        question,
        perspectives,
        synthesis,
        consensus,
        disagreements,
        recommendations,
        confidence,
        totalProcessingTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Collaborative analysis failed:', error);
      throw error;
    }
  }

  /**
   * Perform a specialized roundtable discussion
   */
  async roundtableDiscussion(
    topic: string,
    rounds: number = 3
  ): Promise<CollaborativeAnalysis[]> {
    const discussions: CollaborativeAnalysis[] = [];
    const participants = [
      AgentType.COMMISSIONER,
      AgentType.ANALYST,
      AgentType.NARRATOR,
      AgentType.TRASH_TALKER,
    ];

    let currentQuestion = `Let's discuss: ${topic}. What are your initial thoughts?`;

    for (let round = 0; round < rounds; round++) {
      const analysis = await this.collaborativeAnalysis(
        currentQuestion,
        participants,
        `${topic} - Round ${round + 1}`
      );

      discussions.push(analysis);

      // Generate follow-up question based on the synthesis
      currentQuestion = await this.generateFollowUpQuestion(analysis.synthesis, topic);
    }

    return discussions;
  }

  /**
   * Get expert panel analysis for critical decisions
   */
  async expertPanel(
    decision: string,
    context: any
  ): Promise<CollaborativeAnalysis> {
    // Select expert agents based on the decision type
    const experts = this.selectExperts(decision);

    const enhancedQuestion = `
      CRITICAL DECISION REQUIRED:
      ${decision}
      
      Context: ${JSON.stringify(context, null, 2)}
      
      Please provide your expert analysis and recommendation.
    `;

    return this.collaborativeAnalysis(enhancedQuestion, experts, 'Expert Panel Analysis');
  }

  /**
   * Initialize requested agents
   */
  private async initializeAgents(
    agentTypes: (AgentType | string)[]
  ): Promise<{ type: string; agent: BaseAgent }[]> {
    const agents: { type: string; agent: BaseAgent }[] = [];

    for (const type of agentTypes) {
      const cacheKey = `${type}-${this.config.leagueSandbox || 'global'}`;
      
      if (!this.activeAgents.has(cacheKey)) {
        try {
          const agent = await createAgent({
            agentType: type as AgentType,
            leagueSandbox: this.config.leagueSandbox,
          });
          this.activeAgents.set(cacheKey, agent);
          agents.push({ type: type as string, agent });
        } catch (error) {
          console.error(`Failed to initialize agent ${type}:`, error);
        }
      } else {
        agents.push({ type: type as string, agent: this.activeAgents.get(cacheKey)! });
      }
    }

    return agents;
  }

  /**
   * Synthesize multiple agent perspectives into unified analysis
   */
  private async synthesizePerspectives(
    question: string,
    perspectives: AgentPerspective[]
  ): Promise<string> {
    const synthesisPrompt = `
You are synthesizing multiple AI agent perspectives on a fantasy football question.

Question: ${question}

Agent Perspectives:
${perspectives.map(p => `
[${p.agentName}]:
${p.response}
`).join('\n---\n')}

Please synthesize these perspectives into a comprehensive, unified analysis that:
1. Captures the key insights from each agent
2. Identifies common themes and consensus points
3. Notes any significant disagreements or alternative viewpoints
4. Provides a balanced, actionable conclusion

Keep the synthesis concise but complete (2-3 paragraphs).
`;

    const response = await this.synthesizer.invoke(synthesisPrompt);
    return response.content as string;
  }

  /**
   * Analyze agreement between agent perspectives
   */
  private analyzeAgreement(
    perspectives: AgentPerspective[]
  ): { consensus?: string; disagreements?: string[] } {
    // This is a simplified implementation
    // In production, would use NLP to extract actual agreement points
    
    const consensus = perspectives.length > 1 
      ? 'Multiple agents agree on the key factors influencing this decision.'
      : undefined;
      
    const disagreements = perspectives.length > 2
      ? ['Risk assessment levels vary between agents', 'Timeline predictions differ']
      : undefined;

    return { consensus, disagreements };
  }

  /**
   * Generate recommendations based on agent perspectives
   */
  private generateRecommendations(
    perspectives: AgentPerspective[],
    synthesis: string
  ): string[] {
    // Extract action items from synthesis
    const recommendations = [
      'Consider all perspectives before making a final decision',
      'Monitor the situation closely for changes',
      'Implement suggested strategies incrementally',
    ];

    // Add specific recommendations if certain agents were involved
    if (perspectives.some(p => p.agentType === AgentType.BETTING_ADVISOR)) {
      recommendations.push('Review betting odds and value opportunities');
    }
    if (perspectives.some(p => p.agentType === AgentType.ANALYST)) {
      recommendations.push('Analyze statistical trends before acting');
    }

    return recommendations;
  }

  /**
   * Calculate overall confidence level
   */
  private calculateConfidence(perspectives: AgentPerspective[]): string {
    const validPerspectives = perspectives.filter(p => 
      p.response && p.response !== 'Unable to provide perspective due to an error.'
    );

    const ratio = validPerspectives.length / perspectives.length;
    
    if (ratio === 1) return 'High';
    if (ratio >= 0.75) return 'Medium-High';
    if (ratio >= 0.5) return 'Medium';
    return 'Low';
  }

  /**
   * Select expert agents based on decision type
   */
  private selectExperts(decision: string): AgentType[] {
    const decisionLower = decision.toLowerCase();
    
    if (decisionLower.includes('trade')) {
      return [AgentType.COMMISSIONER, AgentType.ANALYST, AgentType.BETTING_ADVISOR];
    }
    if (decisionLower.includes('playoff') || decisionLower.includes('championship')) {
      return [AgentType.ANALYST, AgentType.NARRATOR, AgentType.BETTING_ADVISOR];
    }
    if (decisionLower.includes('waiver') || decisionLower.includes('pickup')) {
      return [AgentType.ANALYST, AgentType.BETTING_ADVISOR];
    }
    
    // Default expert panel
    return [AgentType.COMMISSIONER, AgentType.ANALYST, AgentType.NARRATOR];
  }

  /**
   * Generate follow-up question for roundtable
   */
  private async generateFollowUpQuestion(
    previousSynthesis: string,
    topic: string
  ): Promise<string> {
    const prompt = `
Based on this discussion synthesis about "${topic}":
${previousSynthesis}

Generate a thoughtful follow-up question that:
1. Builds on the insights already shared
2. Explores a new angle or deeper aspect
3. Encourages diverse perspectives

Keep the question concise (1-2 sentences).
`;

    const response = await this.synthesizer.invoke(prompt);
    return response.content as string;
  }

  /**
   * Get friendly agent name
   */
  private getAgentName(agentType: AgentType | string): string {
    const names: Record<string, string> = {
      [AgentType.COMMISSIONER]: 'The Commissioner',
      [AgentType.ANALYST]: 'The Analyst',
      [AgentType.NARRATOR]: 'The Narrator',
      [AgentType.TRASH_TALKER]: 'The Trash Talker',
      [AgentType.BETTING_ADVISOR]: 'The Betting Advisor',
      'HISTORIAN': 'The Historian',
      'ORACLE': 'The Oracle',
    };
    
    return names[agentType] || agentType.toString();
  }

  /**
   * Store collaborative analysis for future reference
   */
  private async storeAnalysis(analysis: CollaborativeAnalysis): Promise<void> {
    try {
      // Store in agent_conversations table with special marker
      await prisma.agentConversation.create({
        data: {
          sessionId: analysis.id,
          agentId: 'multi-agent-orchestrator',
          leagueSandbox: this.config.leagueSandbox,
          messages: analysis,
          summary: analysis.synthesis,
        },
      });
    } catch (error) {
      console.error('Failed to store collaborative analysis:', error);
    }
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Agent timeout')), ms)
    );
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.activeAgents.clear();
  }
}