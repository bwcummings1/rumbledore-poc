// Content Generator Service
// Sprint 10: Content Pipeline - Core content generation with AI agents

import { PrismaClient, ContentType, ContentStatus, AgentType } from '@prisma/client';
import Bull from 'bull';
import { AgentFactory } from '../agent-factory';
import { BaseAgent } from '../base-agent';
import { 
  ContentRequest, 
  GeneratedContentResult, 
  DEFAULT_TEMPLATES,
  ContentTemplateData 
} from '@/types/content';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export class ContentGenerator {
  private queue: Bull.Queue;
  private processingJobs: Map<string, Bull.Job> = new Map();

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Initialize queue for content generation
    this.queue = new Bull('content-generation', redisUrl, {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Process content generation jobs
    this.queue.process('generate', 3, async (job) => {
      return await this.processContentJob(job.data);
    });

    // Process review jobs
    this.queue.process('review', 5, async (job) => {
      return await this.processReviewJob(job.data);
    });

    // Event handlers
    this.queue.on('completed', (job) => {
      console.log(`[ContentGenerator] Job ${job.id} completed`);
      this.processingJobs.delete(job.id);
    });

    this.queue.on('failed', (job, err) => {
      console.error(`[ContentGenerator] Job ${job.id} failed:`, err);
      this.processingJobs.delete(job.id);
    });

    this.queue.on('stalled', (job) => {
      console.warn(`[ContentGenerator] Job ${job.id} stalled`);
    });
  }

  /**
   * Schedule content generation
   */
  async scheduleContent(request: ContentRequest): Promise<string> {
    const jobId = request.id || uuidv4();
    
    // Validate request
    if (!request.leagueId || !request.leagueSandbox) {
      throw new Error('League ID and sandbox are required');
    }

    // Add to queue with optional delay
    const delay = request.scheduledFor 
      ? new Date(request.scheduledFor).getTime() - Date.now() 
      : 0;

    const job = await this.queue.add('generate', {
      ...request,
      id: jobId,
    }, {
      delay: Math.max(0, delay),
      priority: request.priority || 0,
      jobId,
    });

    this.processingJobs.set(job.id.toString(), job);
    return job.id.toString();
  }

  /**
   * Process content generation job
   */
  private async processContentJob(request: ContentRequest): Promise<GeneratedContentResult> {
    const startTime = Date.now();
    
    try {
      // Get or create agent
      const agent = await this.getAgent(request.agentType, request.leagueSandbox);
      if (!agent) {
        throw new Error(`Agent ${request.agentType} not found`);
      }

      // Build prompt from template or custom
      const prompt = await this.buildPrompt(request);
      
      // Add league context
      const context = await this.buildContext(request);

      // Generate content
      const sessionId = `content-${request.id || uuidv4()}`;
      const result = await agent.processMessage(prompt, sessionId, context);

      // Parse and enhance result
      const enhanced = await this.enhanceContent(result, request);

      // Save to database
      const content = await prisma.generatedContent.create({
        data: {
          leagueId: request.leagueId,
          leagueSandbox: request.leagueSandbox,
          type: request.type,
          title: enhanced.title || request.title || this.generateTitle(request.type),
          content: enhanced.content,
          excerpt: enhanced.excerpt,
          agentId: agent.id,
          agentType: request.agentType,
          status: ContentStatus.DRAFT,
          metadata: {
            request,
            toolsUsed: result.toolsUsed || [],
            generationTime: Date.now() - startTime,
            context: context,
          },
          scheduleId: request.metadata?.scheduleId,
        },
      });

      // Queue for review
      await this.queueForReview(content.id);

      return {
        id: content.id,
        title: content.title,
        content: content.content,
        excerpt: content.excerpt || undefined,
        metadata: content.metadata as Record<string, any>,
        toolsUsed: result.toolsUsed,
        generationTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[ContentGenerator] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Process review job
   */
  private async processReviewJob(data: { contentId: string }): Promise<void> {
    // This will be handled by ContentReviewer service
    console.log(`[ContentGenerator] Queuing review for content ${data.contentId}`);
  }

  /**
   * Get agent instance
   */
  private async getAgent(agentType: AgentType, leagueSandbox: string): Promise<BaseAgent | null> {
    try {
      return AgentFactory.getAgent(agentType, leagueSandbox);
    } catch (error) {
      console.error(`[ContentGenerator] Failed to get agent ${agentType}:`, error);
      return null;
    }
  }

  /**
   * Build prompt from template or custom
   */
  private async buildPrompt(request: ContentRequest): Promise<string> {
    // Use custom prompt if provided
    if (request.customPrompt) {
      return request.customPrompt;
    }

    // Get template
    let template: ContentTemplateData | undefined;
    
    if (request.templateId) {
      const dbTemplate = await prisma.contentTemplate.findUnique({
        where: { id: request.templateId },
      });
      if (dbTemplate) {
        template = {
          name: dbTemplate.name,
          description: dbTemplate.description || undefined,
          type: dbTemplate.type,
          prompt: dbTemplate.prompt,
          structure: dbTemplate.structure as any,
          metadata: dbTemplate.metadata as any,
        };
      }
    }

    // Fall back to default template
    if (!template) {
      const defaultTemplate = DEFAULT_TEMPLATES[request.type];
      if (defaultTemplate && defaultTemplate.prompt) {
        return defaultTemplate.prompt;
      }
    }

    // Use template prompt
    if (template?.prompt) {
      return this.interpolateTemplate(template.prompt, request.context || {});
    }

    // Generic fallback
    return `Generate ${request.type.toLowerCase().replace(/_/g, ' ')} content for the fantasy football league.`;
  }

  /**
   * Build context for content generation
   */
  private async buildContext(request: ContentRequest): Promise<Record<string, any>> {
    const context: Record<string, any> = {
      ...request.context,
      leagueId: request.leagueId,
      leagueSandbox: request.leagueSandbox,
      contentType: request.type,
      timestamp: new Date().toISOString(),
    };

    // Add league-specific data
    try {
      const league = await prisma.league.findUnique({
        where: { id: request.leagueId },
        include: {
          teams: {
            take: 20,
            orderBy: { standing: 'asc' },
          },
        },
      });

      if (league) {
        context.leagueName = league.name;
        context.season = league.season;
        context.teams = league.teams;
      }

      // Add recent matchups for certain content types
      if ([ContentType.WEEKLY_RECAP, ContentType.MATCHUP_PREVIEW].includes(request.type)) {
        const recentMatchups = await prisma.leagueMatchup.findMany({
          where: { 
            leagueId: request.leagueId,
          },
          orderBy: { week: 'desc' },
          take: 10,
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        });
        context.recentMatchups = recentMatchups;
      }
    } catch (error) {
      console.error('[ContentGenerator] Failed to build context:', error);
    }

    return context;
  }

  /**
   * Enhance generated content
   */
  private async enhanceContent(
    result: any, 
    request: ContentRequest
  ): Promise<{ title: string; content: string; excerpt?: string }> {
    let content = result.response || result.content || result;
    
    // Extract title if present in content
    let title = request.title || '';
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1];
    } else if (!title) {
      title = this.generateTitle(request.type);
    }

    // Generate excerpt
    const excerpt = this.generateExcerpt(content);

    // Format content based on type
    if (request.type === ContentType.POWER_RANKINGS) {
      content = this.formatPowerRankings(content);
    } else if (request.type === ContentType.WEEKLY_RECAP) {
      content = this.formatWeeklyRecap(content);
    }

    return { title, content, excerpt };
  }

  /**
   * Generate title for content type
   */
  private generateTitle(type: ContentType): string {
    const date = new Date();
    const week = Math.ceil((date.getTime() - new Date(date.getFullYear(), 8, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    
    const titles: Record<ContentType, string> = {
      WEEKLY_RECAP: `Week ${week} Recap`,
      POWER_RANKINGS: `Power Rankings - Week ${week}`,
      MATCHUP_PREVIEW: `Week ${week + 1} Matchup Preview`,
      TRADE_ANALYSIS: `Trade Analysis & Market Report`,
      INJURY_REPORT: `Injury Report - Week ${week}`,
      SEASON_NARRATIVE: `The Season Story Continues`,
      PLAYOFF_PREVIEW: `Playoff Preview & Predictions`,
      CHAMPIONSHIP_RECAP: `Championship Game Recap`,
      DRAFT_ANALYSIS: `Draft Analysis & Grades`,
      WAIVER_WIRE: `Waiver Wire Report - Week ${week}`,
      CUSTOM: `League Update`,
    };

    return titles[type] || 'League Content';
  }

  /**
   * Generate excerpt from content
   */
  private generateExcerpt(content: string): string {
    // Remove markdown formatting
    const plain = content
      .replace(/^#+ /gm, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    // Get first 200 characters
    if (plain.length <= 200) {
      return plain;
    }

    // Find sentence boundary
    const excerpt = plain.substring(0, 200);
    const lastPeriod = excerpt.lastIndexOf('.');
    if (lastPeriod > 100) {
      return excerpt.substring(0, lastPeriod + 1);
    }

    return excerpt + '...';
  }

  /**
   * Format power rankings content
   */
  private formatPowerRankings(content: string): string {
    // Ensure proper formatting for power rankings
    if (!content.includes('##')) {
      // Add section headers if missing
      const sections = content.split('\n\n');
      if (sections.length > 1) {
        content = `## Power Rankings\n\n${sections[0]}\n\n## Analysis\n\n${sections.slice(1).join('\n\n')}`;
      }
    }
    return content;
  }

  /**
   * Format weekly recap content
   */
  private formatWeeklyRecap(content: string): string {
    // Ensure proper formatting for weekly recap
    if (!content.includes('##')) {
      const sections = content.split('\n\n');
      if (sections.length > 2) {
        content = `## Overview\n\n${sections[0]}\n\n## Matchup Summaries\n\n${sections[1]}\n\n## Key Takeaways\n\n${sections.slice(2).join('\n\n')}`;
      }
    }
    return content;
  }

  /**
   * Interpolate template variables
   */
  private interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] || match;
    });
  }

  /**
   * Queue content for review
   */
  private async queueForReview(contentId: string): Promise<void> {
    await this.queue.add('review', { contentId }, {
      priority: 10,
      delay: 1000, // Small delay to ensure content is saved
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    };
  }

  /**
   * Cancel a scheduled job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return false;
    }

    await job.remove();
    this.processingJobs.delete(jobId);
    return true;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      processing: this.processingJobs.size,
    };
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    await this.queue.close();
  }
}