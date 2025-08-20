// Content Pipeline Types
// Sprint 10: Content Pipeline

import { AgentType, ContentType, ContentStatus } from '@prisma/client';

// Content Generation Request
export interface ContentRequest {
  id?: string;
  leagueId: string;
  leagueSandbox: string;
  type: ContentType;
  title?: string;
  agentType: AgentType;
  templateId?: string;
  customPrompt?: string;
  context?: Record<string, any>;
  scheduledFor?: Date;
  priority?: number;
  metadata?: Record<string, any>;
}

// Content Review Result
export interface ReviewResult {
  approved: boolean;
  aiReview: AIReviewResult;
  qualityScore: number;
  safetyCheck: SafetyCheckResult;
  suggestions?: string[];
  requiresManualReview?: boolean;
}

// AI Review Result
export interface AIReviewResult {
  score: number; // 0-1
  feedback: string;
  suggestions: string[];
  strengths: string[];
  weaknesses: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

// Safety Check Result
export interface SafetyCheckResult {
  safe: boolean;
  flags: SafetyFlag[];
  confidence: number;
  details?: string;
}

// Safety Flag
export interface SafetyFlag {
  type: 'profanity' | 'harassment' | 'discrimination' | 'violence' | 'sensitive_content' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  location?: string; // text snippet or section
}

// Quality Metrics
export interface QualityMetrics {
  length: number;
  structure: boolean;
  formatting: boolean;
  readability: number;
  engagement: number;
  relevance: number;
  originality: number;
}

// Content Template
export interface ContentTemplateData {
  name: string;
  description?: string;
  type: ContentType;
  prompt: string;
  structure: TemplateStructure;
  metadata?: Record<string, any>;
  variables?: TemplateVariable[];
}

// Template Structure
export interface TemplateStructure {
  sections: TemplateSection[];
  minLength?: number;
  maxLength?: number;
  format?: 'markdown' | 'html' | 'plain';
  style?: string;
}

// Template Section
export interface TemplateSection {
  name: string;
  required: boolean;
  order: number;
  minLength?: number;
  maxLength?: number;
  prompt?: string;
}

// Template Variable
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description?: string;
}

// Publishing Options
export interface PublishingOptions {
  immediate?: boolean;
  scheduledFor?: Date;
  notify?: boolean;
  featured?: boolean;
  tags?: string[];
  excerpt?: string;
}

// Content Schedule Configuration
export interface ScheduleConfig {
  name: string;
  description?: string;
  type: ContentType;
  agentType: AgentType;
  cronExpression: string;
  templateId?: string;
  enabled: boolean;
  metadata?: Record<string, any>;
}

// Content Generation Job
export interface ContentGenerationJob {
  id: string;
  request: ContentRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: GeneratedContentResult;
}

// Generated Content Result
export interface GeneratedContentResult {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  metadata: Record<string, any>;
  toolsUsed?: string[];
  tokensUsed?: number;
  generationTime?: number;
}

// Content Metrics
export interface ContentMetrics {
  totalGenerated: number;
  totalPublished: number;
  totalViews: number;
  avgQualityScore: number;
  avgGenerationTime: number;
  approvalRate: number;
  byType: Record<ContentType, number>;
  byAgent: Record<AgentType, number>;
  recentContent: ContentSummary[];
}

// Content Summary
export interface ContentSummary {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  agentType: AgentType;
  createdAt: Date;
  publishedAt?: Date;
  viewCount?: number;
  qualityScore?: number;
}

// Notification Event
export interface ContentNotification {
  type: 'content_published' | 'content_scheduled' | 'review_required' | 'generation_failed';
  contentId?: string;
  leagueId: string;
  title?: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Content Filter Options
export interface ContentFilterOptions {
  leagueId?: string;
  type?: ContentType;
  status?: ContentStatus;
  agentType?: AgentType;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  featured?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'publishedAt' | 'viewCount' | 'qualityScore';
  sortOrder?: 'asc' | 'desc';
}

// Bulk Operations
export interface BulkContentOperation {
  action: 'publish' | 'archive' | 'delete' | 'review';
  contentIds: string[];
  options?: Record<string, any>;
}

// Content Pipeline Configuration
export interface ContentPipelineConfig {
  enableAutoGeneration: boolean;
  enableAutoPublishing: boolean;
  requireReview: boolean;
  minQualityScore: number;
  maxRetries: number;
  generationTimeout: number;
  reviewTimeout: number;
  defaultAgentType: AgentType;
  notificationChannels: ('email' | 'websocket' | 'slack')[];
}

// Template Library
export const DEFAULT_TEMPLATES: Record<ContentType, Partial<ContentTemplateData>> = {
  WEEKLY_RECAP: {
    name: 'Weekly Recap',
    prompt: 'Write a comprehensive weekly recap covering all matchups, standout performances, and key storylines. Include dramatic moments, surprising outcomes, and implications for the standings.',
    structure: {
      sections: [
        { name: 'Introduction', required: true, order: 1 },
        { name: 'Matchup Summaries', required: true, order: 2 },
        { name: 'Player Performances', required: true, order: 3 },
        { name: 'Standings Update', required: true, order: 4 },
        { name: 'Looking Ahead', required: false, order: 5 }
      ],
      format: 'markdown',
      minLength: 800,
      maxLength: 2000
    }
  },
  POWER_RANKINGS: {
    name: 'Power Rankings',
    prompt: 'Create power rankings for all teams with detailed explanations for their positions. Consider recent performance, strength of roster, and momentum.',
    structure: {
      sections: [
        { name: 'Overview', required: true, order: 1 },
        { name: 'Rankings', required: true, order: 2 },
        { name: 'Biggest Movers', required: true, order: 3 },
        { name: 'Analysis', required: false, order: 4 }
      ],
      format: 'markdown',
      minLength: 600,
      maxLength: 1500
    }
  },
  MATCHUP_PREVIEW: {
    name: 'Matchup Preview',
    prompt: 'Preview the upcoming matchups with analysis of key players, potential game-changers, and predictions.',
    structure: {
      sections: [
        { name: 'Headlines', required: true, order: 1 },
        { name: 'Matchup Analysis', required: true, order: 2 },
        { name: 'Players to Watch', required: true, order: 3 },
        { name: 'Predictions', required: true, order: 4 }
      ],
      format: 'markdown',
      minLength: 500,
      maxLength: 1200
    }
  },
  TRADE_ANALYSIS: {
    name: 'Trade Analysis',
    prompt: 'Analyze recent trades in the league, evaluating winners and losers, and providing trade recommendations.',
    structure: {
      sections: [
        { name: 'Recent Trades', required: true, order: 1 },
        { name: 'Impact Analysis', required: true, order: 2 },
        { name: 'Trade Recommendations', required: false, order: 3 }
      ],
      format: 'markdown',
      minLength: 400,
      maxLength: 1000
    }
  },
  INJURY_REPORT: {
    name: 'Injury Report',
    prompt: 'Provide comprehensive injury updates and their fantasy football implications.',
    structure: {
      sections: [
        { name: 'Critical Injuries', required: true, order: 1 },
        { name: 'Fantasy Impact', required: true, order: 2 },
        { name: 'Waiver Recommendations', required: false, order: 3 }
      ],
      format: 'markdown',
      minLength: 300,
      maxLength: 800
    }
  },
  SEASON_NARRATIVE: {
    name: 'Season Narrative',
    prompt: 'Tell the ongoing story of the season in dramatic, narrative form.',
    structure: {
      sections: [
        { name: 'Story Arc', required: true, order: 1 },
        { name: 'Character Development', required: true, order: 2 },
        { name: 'Dramatic Moments', required: true, order: 3 },
        { name: 'Foreshadowing', required: false, order: 4 }
      ],
      format: 'markdown',
      minLength: 1000,
      maxLength: 2500
    }
  },
  PLAYOFF_PREVIEW: {
    name: 'Playoff Preview',
    prompt: 'Preview the playoffs with bracket analysis, team breakdowns, and championship predictions.',
    structure: {
      sections: [
        { name: 'Playoff Picture', required: true, order: 1 },
        { name: 'Team Analysis', required: true, order: 2 },
        { name: 'Championship Odds', required: true, order: 3 }
      ],
      format: 'markdown',
      minLength: 700,
      maxLength: 1800
    }
  },
  CHAMPIONSHIP_RECAP: {
    name: 'Championship Recap',
    prompt: 'Recap the championship game and season finale with epic storytelling.',
    structure: {
      sections: [
        { name: 'Championship Summary', required: true, order: 1 },
        { name: 'Season Retrospective', required: true, order: 2 },
        { name: 'Awards & Honors', required: true, order: 3 }
      ],
      format: 'markdown',
      minLength: 1000,
      maxLength: 2500
    }
  },
  DRAFT_ANALYSIS: {
    name: 'Draft Analysis',
    prompt: 'Analyze the draft results, grading each team and identifying steals and reaches.',
    structure: {
      sections: [
        { name: 'Draft Overview', required: true, order: 1 },
        { name: 'Team Grades', required: true, order: 2 },
        { name: 'Best & Worst Picks', required: true, order: 3 }
      ],
      format: 'markdown',
      minLength: 800,
      maxLength: 2000
    }
  },
  WAIVER_WIRE: {
    name: 'Waiver Wire Report',
    prompt: 'Provide waiver wire recommendations with pickup priorities and FAAB suggestions.',
    structure: {
      sections: [
        { name: 'Priority Pickups', required: true, order: 1 },
        { name: 'Deep League Targets', required: false, order: 2 },
        { name: 'Drop Candidates', required: false, order: 3 }
      ],
      format: 'markdown',
      minLength: 400,
      maxLength: 1000
    }
  },
  CUSTOM: {
    name: 'Custom Content',
    prompt: 'Generate custom content based on specific requirements.',
    structure: {
      sections: [],
      format: 'markdown'
    }
  }
};

// Export type utilities
export type ContentTypeKey = keyof typeof DEFAULT_TEMPLATES;
export type AgentContentMap = Partial<Record<AgentType, ContentType[]>>;

// Agent to content type mapping (which agents are best for which content)
export const AGENT_CONTENT_MAPPING: AgentContentMap = {
  COMMISSIONER: ['WEEKLY_RECAP', 'PLAYOFF_PREVIEW', 'CHAMPIONSHIP_RECAP'],
  ANALYST: ['POWER_RANKINGS', 'MATCHUP_PREVIEW', 'DRAFT_ANALYSIS', 'WAIVER_WIRE'],
  NARRATOR: ['SEASON_NARRATIVE', 'CHAMPIONSHIP_RECAP'],
  TRASH_TALKER: ['WEEKLY_RECAP', 'POWER_RANKINGS'],
  BETTING_ADVISOR: ['MATCHUP_PREVIEW', 'TRADE_ANALYSIS'],
  HISTORIAN: ['SEASON_NARRATIVE', 'CHAMPIONSHIP_RECAP'],
  ORACLE: ['PLAYOFF_PREVIEW', 'MATCHUP_PREVIEW']
};