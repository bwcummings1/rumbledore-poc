# Sprint 10: Content Pipeline

## Sprint Overview
Implement automated content generation, review, and publishing workflow with quality controls and scheduling.

**Duration**: 2 weeks (Week 5-6 of Phase 3)  
**Dependencies**: Sprint 9 (League Agents) must be complete  
**Risk Level**: Medium - Content quality and moderation challenges

## Implementation Guide

### Content Generation Service

```typescript
// /lib/ai/content/content-generator.ts
import { AgentFactory } from '../agent-factory';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

export class ContentGenerator {
  private queue: Queue;
  private worker: Worker;

  constructor() {
    this.queue = new Queue('content-generation', {
      connection: redis,
    });

    this.worker = new Worker(
      'content-generation',
      async (job) => this.processContentJob(job.data),
      { connection: redis }
    );
  }

  async scheduleContent(request: ContentRequest): Promise<string> {
    const job = await this.queue.add('generate', request, {
      delay: request.scheduledFor ? 
        new Date(request.scheduledFor).getTime() - Date.now() : 0,
    });
    return job.id!;
  }

  private async processContentJob(request: ContentRequest) {
    const agent = AgentFactory.getAgent(request.agentType, request.leagueSandbox);
    if (!agent) throw new Error('Agent not found');

    // Generate content
    const result = await agent.processMessage(
      this.buildPrompt(request),
      `content-${request.id}`,
      request.context
    );

    // Save draft
    const content = await prisma.generatedContent.create({
      data: {
        type: request.type,
        title: request.title,
        content: result.response,
        leagueSandbox: request.leagueSandbox,
        agentId: request.agentType,
        status: 'DRAFT',
        metadata: {
          request,
          toolsUsed: result.toolsUsed,
        },
      },
    });

    // Queue for review
    await this.queueForReview(content.id);

    return content;
  }

  private buildPrompt(request: ContentRequest): string {
    const templates = {
      'weekly-recap': 'Write a comprehensive weekly recap covering all matchups, standout performances, and key storylines.',
      'power-rankings': 'Create power rankings for all teams with explanations for their positions.',
      'matchup-preview': 'Preview the upcoming matchups with analysis and predictions.',
      'trade-analysis': 'Analyze recent trades and provide recommendations.',
    };

    return templates[request.type] || request.customPrompt || 'Generate relevant content.';
  }

  private async queueForReview(contentId: string) {
    await this.queue.add('review', { contentId }, {
      priority: 10,
    });
  }
}
```

### Content Review System

```typescript
// /lib/ai/content/content-reviewer.ts
export class ContentReviewer {
  async reviewContent(contentId: string): Promise<ReviewResult> {
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
    });

    if (!content) throw new Error('Content not found');

    // AI review
    const aiReview = await this.performAIReview(content.content);

    // Quality checks
    const qualityScore = await this.assessQuality(content.content);

    // Safety checks
    const safetyCheck = await this.checkSafety(content.content);

    const approved = aiReview.score > 0.7 && 
                    qualityScore > 0.7 && 
                    safetyCheck.safe;

    // Update status
    await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        status: approved ? 'APPROVED' : 'NEEDS_REVIEW',
        reviewData: {
          aiReview,
          qualityScore,
          safetyCheck,
          reviewedAt: new Date(),
        },
      },
    });

    return {
      approved,
      aiReview,
      qualityScore,
      safetyCheck,
    };
  }

  private async performAIReview(content: string): Promise<any> {
    // Use GPT to review content
    return {
      score: 0.85,
      feedback: 'Content is well-written and engaging.',
      suggestions: [],
    };
  }

  private async assessQuality(content: string): Promise<number> {
    // Check for quality metrics
    const metrics = {
      length: content.length > 500 ? 1 : 0.5,
      structure: content.includes('\n\n') ? 1 : 0.5,
      formatting: true,
    };

    return Object.values(metrics).reduce((a, b) => a + b, 0) / Object.keys(metrics).length;
  }

  private async checkSafety(content: string): Promise<any> {
    // Content moderation
    return {
      safe: true,
      flags: [],
    };
  }
}
```

### Publishing Service

```typescript
// /lib/ai/content/content-publisher.ts
export class ContentPublisher {
  async publishContent(contentId: string): Promise<void> {
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
    });

    if (!content || content.status !== 'APPROVED') {
      throw new Error('Content not approved for publishing');
    }

    // Create blog post
    const post = await prisma.blogPost.create({
      data: {
        title: content.title,
        content: content.content,
        slug: this.generateSlug(content.title),
        leagueSandbox: content.leagueSandbox,
        authorType: 'AI',
        authorId: content.agentId,
        publishedAt: new Date(),
        tags: this.extractTags(content.content),
      },
    });

    // Update content status
    await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedId: post.id,
      },
    });

    // Notify subscribers
    await this.notifySubscribers(post);
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private extractTags(content: string): string[] {
    // Extract relevant tags from content
    return ['weekly-recap', 'analysis'];
  }

  private async notifySubscribers(post: any) {
    // Send notifications to league members
  }
}
```

## Success Criteria
- [ ] Content generation automated
- [ ] Review process implemented
- [ ] Publishing pipeline working
- [ ] Quality controls effective
- [ ] Scheduling functional
- [ ] Performance optimized
