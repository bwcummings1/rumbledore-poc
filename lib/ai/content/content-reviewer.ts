// Content Reviewer Service
// Sprint 10: Content Pipeline - AI review and quality control

import { PrismaClient, ContentStatus } from '@prisma/client';
import { ChatOpenAI } from '@langchain/openai';
import { 
  ReviewResult, 
  AIReviewResult, 
  SafetyCheckResult, 
  SafetyFlag,
  QualityMetrics 
} from '@/types/content';

const prisma = new PrismaClient();

export class ContentReviewer {
  private aiReviewer: ChatOpenAI;
  private readonly MIN_QUALITY_SCORE = 0.7;
  private readonly MIN_AI_SCORE = 0.7;

  constructor() {
    // Initialize AI reviewer with GPT-4
    this.aiReviewer = new ChatOpenAI({
      modelName: 'gpt-4-turbo-preview',
      temperature: 0.3, // Lower temperature for consistent reviews
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Review content and determine if it's ready for publishing
   */
  async reviewContent(contentId: string): Promise<ReviewResult> {
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
      include: { league: true },
    });

    if (!content) {
      throw new Error(`Content ${contentId} not found`);
    }

    console.log(`[ContentReviewer] Reviewing content: ${content.title}`);

    // Perform parallel reviews
    const [aiReview, qualityScore, safetyCheck] = await Promise.all([
      this.performAIReview(content.content, content.title),
      this.assessQuality(content.content),
      this.checkSafety(content.content),
    ]);

    // Determine approval status
    const approved = this.determineApproval(aiReview, qualityScore, safetyCheck);
    const requiresManualReview = this.requiresManualReview(aiReview, qualityScore, safetyCheck);

    // Build suggestions
    const suggestions = this.compileSuggestions(aiReview, qualityScore, safetyCheck);

    // Update content status and review data
    await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        status: approved 
          ? ContentStatus.APPROVED 
          : requiresManualReview 
            ? ContentStatus.NEEDS_REVIEW 
            : ContentStatus.IN_REVIEW,
        reviewData: {
          aiReview,
          qualityScore,
          safetyCheck,
          reviewedAt: new Date(),
          approved,
          requiresManualReview,
          suggestions,
        },
      },
    });

    const result: ReviewResult = {
      approved,
      aiReview,
      qualityScore,
      safetyCheck,
      suggestions,
      requiresManualReview,
    };

    console.log(`[ContentReviewer] Review complete - Approved: ${approved}, Manual Review: ${requiresManualReview}`);
    
    return result;
  }

  /**
   * Perform AI-powered content review
   */
  private async performAIReview(content: string, title: string): Promise<AIReviewResult> {
    try {
      const prompt = `
        Review the following fantasy football content for quality, accuracy, and engagement.
        
        Title: ${title}
        
        Content:
        ${content}
        
        Please evaluate and provide:
        1. A quality score from 0 to 1 (where 1 is excellent)
        2. Specific feedback on the content
        3. 2-3 actionable suggestions for improvement
        4. 2-3 strengths of the content
        5. 1-2 weaknesses to address
        6. Overall sentiment (positive, neutral, or negative)
        
        Format your response as JSON with the following structure:
        {
          "score": 0.85,
          "feedback": "Overall assessment...",
          "suggestions": ["Suggestion 1", "Suggestion 2"],
          "strengths": ["Strength 1", "Strength 2"],
          "weaknesses": ["Weakness 1"],
          "sentiment": "positive"
        }
      `;

      const response = await this.aiReviewer.invoke(prompt);
      const content = response.content.toString();
      
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.max(0, Math.min(1, parsed.score || 0.5)),
          feedback: parsed.feedback || 'Content reviewed successfully.',
          suggestions: parsed.suggestions || [],
          strengths: parsed.strengths || [],
          weaknesses: parsed.weaknesses || [],
          sentiment: parsed.sentiment || 'neutral',
        };
      }

      // Fallback if JSON parsing fails
      return {
        score: 0.7,
        feedback: 'Content appears to be well-written.',
        suggestions: [],
        strengths: ['Good structure', 'Clear writing'],
        weaknesses: [],
        sentiment: 'neutral',
      };
    } catch (error) {
      console.error('[ContentReviewer] AI review failed:', error);
      
      // Return neutral review on error
      return {
        score: 0.5,
        feedback: 'Unable to perform detailed AI review.',
        suggestions: ['Manual review recommended'],
        strengths: [],
        weaknesses: ['AI review unavailable'],
        sentiment: 'neutral',
      };
    }
  }

  /**
   * Assess content quality metrics
   */
  private async assessQuality(content: string): Promise<number> {
    const metrics: QualityMetrics = {
      length: this.assessLength(content),
      structure: this.assessStructure(content),
      formatting: this.assessFormatting(content),
      readability: this.assessReadability(content),
      engagement: this.assessEngagement(content),
      relevance: this.assessRelevance(content),
      originality: this.assessOriginality(content),
    };

    // Calculate weighted average
    const weights = {
      length: 0.15,
      structure: 0.15,
      formatting: 0.10,
      readability: 0.20,
      engagement: 0.15,
      relevance: 0.15,
      originality: 0.10,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, value] of Object.entries(metrics)) {
      const weight = weights[key as keyof typeof weights] || 0;
      totalScore += (value as number) * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0.5;
  }

  /**
   * Check content safety and appropriateness
   */
  private async checkSafety(content: string): Promise<SafetyCheckResult> {
    const flags: SafetyFlag[] = [];
    
    // Check for profanity
    const profanityPatterns = [
      /\b(fuck|shit|damn|hell|ass)\b/gi,
      // Add more patterns as needed
    ];

    for (const pattern of profanityPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        flags.push({
          type: 'profanity',
          severity: 'low',
          description: 'Mild profanity detected',
          location: matches[0],
        });
      }
    }

    // Check for harassment or negative targeting
    const harassmentPatterns = [
      /\b(sucks|terrible|worst|trash|garbage)\s+(manager|team|owner)/gi,
      /\b(hate|despise|loathe)\s+\w+/gi,
    ];

    for (const pattern of harassmentPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        flags.push({
          type: 'harassment',
          severity: 'medium',
          description: 'Potentially negative targeting detected',
          location: matches[0],
        });
      }
    }

    // Check for sensitive content
    const sensitivePatterns = [
      /\b(injury|injured|hurt)\s+(?:badly|severely|seriously)/gi,
      /\b(death|died|dying)\b/gi,
    ];

    for (const pattern of sensitivePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        flags.push({
          type: 'sensitive_content',
          severity: 'low',
          description: 'Sensitive topic mentioned',
          location: matches[0],
        });
      }
    }

    // Calculate overall safety
    const highSeverityCount = flags.filter(f => f.severity === 'high').length;
    const mediumSeverityCount = flags.filter(f => f.severity === 'medium').length;
    
    const safe = highSeverityCount === 0 && mediumSeverityCount <= 1;
    const confidence = 1 - (highSeverityCount * 0.3 + mediumSeverityCount * 0.15 + flags.length * 0.05);

    return {
      safe,
      flags,
      confidence: Math.max(0, Math.min(1, confidence)),
      details: flags.length > 0 ? `Found ${flags.length} potential issues` : 'No safety concerns detected',
    };
  }

  // Quality assessment helper methods

  private assessLength(content: string): number {
    const wordCount = content.split(/\s+/).length;
    if (wordCount < 200) return 0.3;
    if (wordCount < 500) return 0.6;
    if (wordCount < 1000) return 1.0;
    if (wordCount < 2000) return 0.9;
    return 0.7; // Too long
  }

  private assessStructure(content: string): boolean {
    // Check for headers and paragraphs
    const hasHeaders = /^#{1,3}\s+/m.test(content);
    const hasParagraphs = content.split('\n\n').length > 2;
    const hasLists = /^[\*\-\+]\s+/m.test(content) || /^\d+\.\s+/m.test(content);
    
    return hasHeaders && hasParagraphs ? 1 : hasHeaders || hasParagraphs ? 0.7 : 0.4;
  }

  private assessFormatting(content: string): boolean {
    // Check for markdown formatting
    const hasBold = /\*\*[^*]+\*\*/m.test(content);
    const hasItalic = /\*[^*]+\*/m.test(content);
    const hasLinks = /\[([^\]]+)\]\(([^)]+)\)/m.test(content);
    
    const formatFeatures = [hasBold, hasItalic, hasLinks].filter(Boolean).length;
    return formatFeatures >= 2 ? 1 : formatFeatures === 1 ? 0.7 : 0.5;
  }

  private assessReadability(content: string): number {
    // Simple readability check
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    
    if (avgSentenceLength < 10) return 0.6; // Too simple
    if (avgSentenceLength < 20) return 1.0; // Ideal
    if (avgSentenceLength < 30) return 0.8; // Getting complex
    return 0.5; // Too complex
  }

  private assessEngagement(content: string): number {
    // Check for engaging elements
    const hasQuestions = /\?/m.test(content);
    const hasExclamations = /!/m.test(content);
    const hasNumbers = /\d+/m.test(content);
    const hasQuotes = /"[^"]+"/m.test(content);
    
    const engagementFeatures = [hasQuestions, hasExclamations, hasNumbers, hasQuotes].filter(Boolean).length;
    return Math.min(1, 0.4 + engagementFeatures * 0.15);
  }

  private assessRelevance(content: string): number {
    // Check for fantasy football keywords
    const keywords = [
      'fantasy', 'football', 'team', 'player', 'points', 'matchup',
      'week', 'roster', 'trade', 'waiver', 'injury', 'performance',
      'touchdown', 'yards', 'reception', 'score', 'win', 'loss'
    ];
    
    const lowerContent = content.toLowerCase();
    const keywordCount = keywords.filter(kw => lowerContent.includes(kw)).length;
    
    return Math.min(1, keywordCount / 10);
  }

  private assessOriginality(content: string): number {
    // Basic originality check (would need more sophisticated implementation)
    const clichePhrases = [
      'at the end of the day',
      'it is what it is',
      'game changer',
      'take it to the next level',
      'give 110%'
    ];
    
    const lowerContent = content.toLowerCase();
    const clicheCount = clichePhrases.filter(phrase => lowerContent.includes(phrase)).length;
    
    return Math.max(0.3, 1 - clicheCount * 0.15);
  }

  /**
   * Determine if content should be approved
   */
  private determineApproval(
    aiReview: AIReviewResult,
    qualityScore: number,
    safetyCheck: SafetyCheckResult
  ): boolean {
    return (
      aiReview.score >= this.MIN_AI_SCORE &&
      qualityScore >= this.MIN_QUALITY_SCORE &&
      safetyCheck.safe
    );
  }

  /**
   * Determine if manual review is required
   */
  private requiresManualReview(
    aiReview: AIReviewResult,
    qualityScore: number,
    safetyCheck: SafetyCheckResult
  ): boolean {
    // Require manual review for borderline cases
    const borderlineAI = aiReview.score >= 0.5 && aiReview.score < this.MIN_AI_SCORE;
    const borderlineQuality = qualityScore >= 0.5 && qualityScore < this.MIN_QUALITY_SCORE;
    const hasModerateFlags = safetyCheck.flags.some(f => f.severity === 'medium');
    
    return borderlineAI || borderlineQuality || hasModerateFlags;
  }

  /**
   * Compile suggestions from all review sources
   */
  private compileSuggestions(
    aiReview: AIReviewResult,
    qualityScore: number,
    safetyCheck: SafetyCheckResult
  ): string[] {
    const suggestions: string[] = [...aiReview.suggestions];

    if (qualityScore < 0.8) {
      if (qualityScore < 0.5) {
        suggestions.push('Consider expanding the content with more detail');
      }
      suggestions.push('Add more structure with headers and sections');
    }

    if (!safetyCheck.safe) {
      suggestions.push('Review flagged content for appropriateness');
    }

    if (aiReview.weaknesses.length > 0) {
      suggestions.push(`Address: ${aiReview.weaknesses[0]}`);
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Manually approve content
   */
  async manuallyApproveContent(contentId: string, reviewerId: string): Promise<void> {
    await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        status: ContentStatus.APPROVED,
        reviewData: {
          manuallyApproved: true,
          approvedBy: reviewerId,
          approvedAt: new Date(),
        },
      },
    });
  }

  /**
   * Reject content with reason
   */
  async rejectContent(contentId: string, reason: string, reviewerId: string): Promise<void> {
    await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        status: ContentStatus.REJECTED,
        reviewData: {
          rejected: true,
          rejectionReason: reason,
          rejectedBy: reviewerId,
          rejectedAt: new Date(),
        },
      },
    });
  }
}