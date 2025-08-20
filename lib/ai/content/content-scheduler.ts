// Content Scheduler Service
// Sprint 10: Content Pipeline - Automated scheduling and cron management

import cron from 'node-cron';
import { PrismaClient, ContentType, AgentType } from '@prisma/client';
import { ContentGenerator } from './content-generator';
import { ContentReviewer } from './content-reviewer';
import { ContentPublisher } from './content-publisher';
import { ContentRequest, ScheduleConfig } from '@/types/content';

const prisma = new PrismaClient();

export class ContentScheduler {
  private generator: ContentGenerator;
  private reviewer: ContentReviewer;
  private publisher: ContentPublisher;
  private activeSchedules: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.generator = new ContentGenerator();
    this.reviewer = new ContentReviewer();
    this.publisher = new ContentPublisher();
  }

  /**
   * Initialize and start all active schedules
   */
  async initialize(): Promise<void> {
    if (this.isRunning) {
      console.log('[ContentScheduler] Already running');
      return;
    }

    console.log('[ContentScheduler] Initializing content schedules...');
    this.isRunning = true;

    // Load all enabled schedules
    const schedules = await prisma.contentSchedule.findMany({
      where: { enabled: true },
      include: { league: true },
    });

    console.log(`[ContentScheduler] Found ${schedules.length} active schedules`);

    // Activate each schedule
    for (const schedule of schedules) {
      await this.activateSchedule(schedule);
    }

    // Set up default schedules if none exist
    if (schedules.length === 0) {
      await this.setupDefaultSchedules();
    }

    console.log('[ContentScheduler] Initialization complete');
  }

  /**
   * Activate a single schedule
   */
  private async activateSchedule(schedule: any): Promise<void> {
    const { id, name, cronExpression, type, agentType, leagueId, leagueSandbox } = schedule;

    if (!cron.validate(cronExpression)) {
      console.error(`[ContentScheduler] Invalid cron expression for schedule ${name}: ${cronExpression}`);
      return;
    }

    // Create cron job
    const task = cron.schedule(cronExpression, async () => {
      console.log(`[ContentScheduler] Executing schedule: ${name}`);
      
      try {
        await this.executeSchedule(schedule);
        
        // Update last run time
        await prisma.contentSchedule.update({
          where: { id },
          data: {
            lastRunAt: new Date(),
            nextRunAt: this.getNextRunTime(cronExpression),
          },
        });
      } catch (error) {
        console.error(`[ContentScheduler] Failed to execute schedule ${name}:`, error);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York', // Use league timezone
    });

    this.activeSchedules.set(id, task);
    console.log(`[ContentScheduler] Activated schedule: ${name} (${cronExpression})`);
  }

  /**
   * Execute a scheduled content generation
   */
  private async executeSchedule(schedule: any): Promise<void> {
    const { type, agentType, leagueId, leagueSandbox, templateId, metadata } = schedule;

    // Build content request
    const request: ContentRequest = {
      leagueId,
      leagueSandbox,
      type,
      agentType,
      templateId,
      metadata: {
        ...metadata,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
      },
      priority: 5, // Medium priority for scheduled content
    };

    // Generate content
    const jobId = await this.generator.scheduleContent(request);
    console.log(`[ContentScheduler] Content generation job created: ${jobId}`);

    // Optional: Auto-publish after review
    if (metadata?.autoPublish) {
      await this.scheduleAutoPublish(jobId, leagueId);
    }
  }

  /**
   * Schedule auto-publishing after review
   */
  private async scheduleAutoPublish(jobId: string, leagueId: string): Promise<void> {
    // Wait for generation to complete (poll or use events)
    setTimeout(async () => {
      try {
        const status = await this.generator.getJobStatus(jobId);
        if (status?.result?.id) {
          // Review content
          const reviewResult = await this.reviewer.reviewContent(status.result.id);
          
          // Auto-publish if approved
          if (reviewResult.approved) {
            await this.publisher.publishContent(status.result.id, {
              notify: true,
            });
            console.log(`[ContentScheduler] Auto-published content: ${status.result.id}`);
          }
        }
      } catch (error) {
        console.error('[ContentScheduler] Auto-publish failed:', error);
      }
    }, 30000); // Check after 30 seconds
  }

  /**
   * Set up default schedules for new leagues
   */
  private async setupDefaultSchedules(): Promise<void> {
    console.log('[ContentScheduler] Setting up default schedules...');

    // Get all active leagues
    const leagues = await prisma.league.findMany({
      where: { isActive: true },
      take: 10,
    });

    for (const league of leagues) {
      // Check if league already has schedules
      const existingSchedules = await prisma.contentSchedule.count({
        where: { leagueId: league.id },
      });

      if (existingSchedules === 0) {
        await this.createDefaultSchedulesForLeague(league);
      }
    }
  }

  /**
   * Create default schedules for a league
   */
  private async createDefaultSchedulesForLeague(league: any): Promise<void> {
    const defaultSchedules: ScheduleConfig[] = [
      {
        name: 'Weekly Recap',
        description: 'Comprehensive recap every Tuesday morning',
        type: ContentType.WEEKLY_RECAP,
        agentType: AgentType.COMMISSIONER,
        cronExpression: '0 9 * * 2', // Every Tuesday at 9 AM
        enabled: true,
        metadata: { autoPublish: false },
      },
      {
        name: 'Power Rankings',
        description: 'Updated power rankings every Wednesday',
        type: ContentType.POWER_RANKINGS,
        agentType: AgentType.ANALYST,
        cronExpression: '0 10 * * 3', // Every Wednesday at 10 AM
        enabled: true,
        metadata: { autoPublish: false },
      },
      {
        name: 'Matchup Preview',
        description: 'Preview upcoming matchups every Friday',
        type: ContentType.MATCHUP_PREVIEW,
        agentType: AgentType.ORACLE,
        cronExpression: '0 14 * * 5', // Every Friday at 2 PM
        enabled: true,
        metadata: { autoPublish: false },
      },
    ];

    for (const scheduleConfig of defaultSchedules) {
      const schedule = await prisma.contentSchedule.create({
        data: {
          ...scheduleConfig,
          leagueId: league.id,
          leagueSandbox: league.sandboxNamespace,
          nextRunAt: this.getNextRunTime(scheduleConfig.cronExpression),
        },
      });

      await this.activateSchedule(schedule);
    }

    console.log(`[ContentScheduler] Created default schedules for league: ${league.name}`);
  }

  /**
   * Create a new schedule
   */
  async createSchedule(
    leagueId: string,
    config: ScheduleConfig
  ): Promise<string> {
    // Validate cron expression
    if (!cron.validate(config.cronExpression)) {
      throw new Error(`Invalid cron expression: ${config.cronExpression}`);
    }

    // Get league
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });

    if (!league) {
      throw new Error(`League ${leagueId} not found`);
    }

    // Create schedule
    const schedule = await prisma.contentSchedule.create({
      data: {
        ...config,
        leagueId,
        leagueSandbox: league.sandboxNamespace,
        nextRunAt: this.getNextRunTime(config.cronExpression),
      },
    });

    // Activate if enabled
    if (config.enabled) {
      await this.activateSchedule(schedule);
    }

    return schedule.id;
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<ScheduleConfig>
  ): Promise<void> {
    // Validate cron expression if provided
    if (updates.cronExpression && !cron.validate(updates.cronExpression)) {
      throw new Error(`Invalid cron expression: ${updates.cronExpression}`);
    }

    // Deactivate current schedule
    this.deactivateSchedule(scheduleId);

    // Update in database
    const schedule = await prisma.contentSchedule.update({
      where: { id: scheduleId },
      data: {
        ...updates,
        nextRunAt: updates.cronExpression 
          ? this.getNextRunTime(updates.cronExpression)
          : undefined,
      },
      include: { league: true },
    });

    // Reactivate if enabled
    if (schedule.enabled) {
      await this.activateSchedule(schedule);
    }
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    // Deactivate schedule
    this.deactivateSchedule(scheduleId);

    // Delete from database
    await prisma.contentSchedule.delete({
      where: { id: scheduleId },
    });
  }

  /**
   * Enable/disable a schedule
   */
  async toggleSchedule(scheduleId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const schedule = await prisma.contentSchedule.findUnique({
        where: { id: scheduleId },
        include: { league: true },
      });

      if (schedule) {
        await this.activateSchedule(schedule);
      }
    } else {
      this.deactivateSchedule(scheduleId);
    }

    // Update database
    await prisma.contentSchedule.update({
      where: { id: scheduleId },
      data: { enabled },
    });
  }

  /**
   * Deactivate a schedule
   */
  private deactivateSchedule(scheduleId: string): void {
    const task = this.activeSchedules.get(scheduleId);
    if (task) {
      task.stop();
      this.activeSchedules.delete(scheduleId);
      console.log(`[ContentScheduler] Deactivated schedule: ${scheduleId}`);
    }
  }

  /**
   * Get next run time for cron expression
   */
  private getNextRunTime(cronExpression: string): Date {
    // Parse cron expression to determine next run
    // This is a simplified implementation
    const now = new Date();
    const parts = cronExpression.split(' ');
    
    // Basic calculation (would need more sophisticated parsing)
    if (parts[4] === '2') { // Tuesday
      const next = new Date(now);
      next.setDate(now.getDate() + ((2 - now.getDay() + 7) % 7 || 7));
      next.setHours(parseInt(parts[1]) || 0);
      next.setMinutes(parseInt(parts[0]) || 0);
      next.setSeconds(0);
      return next;
    }

    // Default to tomorrow same time
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  /**
   * Get schedule statistics
   */
  async getScheduleStats(leagueId?: string): Promise<any> {
    const where = leagueId ? { leagueId } : {};

    const [total, enabled, byType] = await Promise.all([
      prisma.contentSchedule.count({ where }),
      prisma.contentSchedule.count({ where: { ...where, enabled: true } }),
      prisma.contentSchedule.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);

    // Get recent executions
    const recent = await prisma.contentSchedule.findMany({
      where: {
        ...where,
        lastRunAt: { not: null },
      },
      orderBy: { lastRunAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        type: true,
        lastRunAt: true,
        nextRunAt: true,
      },
    });

    return {
      total,
      enabled,
      active: this.activeSchedules.size,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count;
        return acc;
      }, {} as Record<string, number>),
      recentExecutions: recent,
    };
  }

  /**
   * Manually trigger a schedule
   */
  async triggerSchedule(scheduleId: string): Promise<void> {
    const schedule = await prisma.contentSchedule.findUnique({
      where: { id: scheduleId },
      include: { league: true },
    });

    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    console.log(`[ContentScheduler] Manually triggering schedule: ${schedule.name}`);
    await this.executeSchedule(schedule);
  }

  /**
   * Shutdown scheduler
   */
  async shutdown(): Promise<void> {
    console.log('[ContentScheduler] Shutting down...');
    
    // Stop all active schedules
    for (const [id, task] of this.activeSchedules) {
      task.stop();
    }
    
    this.activeSchedules.clear();
    this.isRunning = false;
    
    // Clean up resources
    await this.generator.shutdown();
    
    console.log('[ContentScheduler] Shutdown complete');
  }
}