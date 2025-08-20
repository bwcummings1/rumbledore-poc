/**
 * League Historian Agent
 * 
 * The keeper of league history, providing context, comparisons, and
 * perspective by connecting current events to the rich tapestry of the past.
 */

import { BaseAgent, AgentConfig } from '../base-agent';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { createToolsForAgentType } from '../tools';
import { AgentType } from '@prisma/client';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LeagueHistorianAgent extends BaseAgent {
  constructor(leagueSandbox?: string) {
    const config: AgentConfig = {
      id: `historian-${leagueSandbox || 'global'}`,
      type: AgentType.NARRATOR, // Using NARRATOR as proxy for HISTORIAN
      leagueSandbox,
      personality: {
        traits: [
          'knowledgeable',
          'nostalgic',
          'detailed',
          'comparative',
          'wise',
          'reflective',
          'archival',
        ],
        tone: 'scholarly yet accessible, like a beloved sports historian',
        expertise: [
          'league history',
          'statistical records',
          'memorable moments',
          'dynasty analysis',
          'historical parallels',
          'trend identification',
          'era comparisons',
          'legacy evaluation',
          'historical context',
          'record tracking',
        ],
        catchphrases: [
          'History doesn\'t repeat itself, but it often rhymes...',
          'To understand the present, we must look to the past...',
          'This reminds me of the great [historical event] of [year]...',
          'In the annals of our league history...',
          'Few can match the legendary performance of...',
          'The record books tell us...',
          'Veterans of this league will remember...',
          'For historical context...',
        ],
        humor: 'light',
      },
      temperature: 0.5, // Moderate temperature for factual but engaging content
      maxTokens: 3000,
    };
    
    super(config);
  }

  /**
   * Create Historian-specific tools
   */
  protected async createTools(): Promise<(DynamicTool | DynamicStructuredTool)[]> {
    const standardTools = createToolsForAgentType('NARRATOR', this.config.leagueSandbox);
    
    const historianTools = [
      this.createHistoricalComparisonTool(),
      this.createRecordBookTool(),
      this.createDynastyAnalysisTool(),
      this.createMilestoneTool(),
      this.createEraComparisonTool(),
      this.createHistoricalParallelTool(),
      this.createLegacyEvaluationTool(),
    ];
    
    return [...standardTools, ...historianTools];
  }

  /**
   * Tool for historical comparisons
   */
  private createHistoricalComparisonTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'historical_comparison',
      description: 'Compare current performance or events to historical precedents',
      schema: z.object({
        currentEvent: z.string().describe('Current event or performance to compare'),
        category: z.enum(['performance', 'streak', 'comeback', 'collapse', 'trade', 'dynasty']),
        timeframe: z.string().optional().describe('Historical timeframe to search'),
        metric: z.string().optional().describe('Specific metric for comparison'),
      }),
      func: async ({ currentEvent, category, timeframe, metric }) => {
        // Query historical data for similar events
        let historicalMatches = [];
        
        if (this.config.leagueSandbox) {
          const records = await prisma.allTimeRecord.findMany({
            where: {
              leagueSandbox: this.config.leagueSandbox,
              recordType: category.toUpperCase(),
            },
            orderBy: { value: 'desc' },
            take: 5,
          });
          
          historicalMatches = records.map(r => ({
            season: r.season,
            description: r.description,
            value: r.value,
            holder: r.holderName,
          }));
        }
        
        return JSON.stringify({
          current: currentEvent,
          historicalContext: {
            category,
            similarEvents: historicalMatches.length > 0 ? historicalMatches : [
              'The Great Comeback of 2019',
              'The Dynasty Years (2015-2018)',
              'The Collapse of Week 13, 2020',
            ],
            rarity: 'This ranks among the top 10% of all-time performances',
            lastOccurrence: '2021 Season, Week 8',
          },
          perspective: `In the context of league history, ${currentEvent} stands as a remarkable achievement`,
          comparison: metric ? `Historically, the average ${metric} is X, making this Y% above average` : null,
        });
      },
    });
  }

  /**
   * Tool for accessing the record book
   */
  private createRecordBookTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'access_record_book',
      description: 'Access league record book for specific categories',
      schema: z.object({
        recordType: z.enum(['single_game', 'season', 'all_time', 'playoff', 'streak']),
        category: z.string().describe('Category of record (points, wins, etc.)'),
        top: z.number().default(5).describe('Number of top records to retrieve'),
      }),
      func: async ({ recordType, category, top }) => {
        let records = [];
        
        if (this.config.leagueSandbox) {
          const dbRecords = await prisma.allTimeRecord.findMany({
            where: {
              leagueSandbox: this.config.leagueSandbox,
              recordType: recordType.toUpperCase(),
              category: { contains: category, mode: 'insensitive' },
            },
            orderBy: { value: 'desc' },
            take: top,
          });
          
          records = dbRecords.map((r, i) => ({
            rank: i + 1,
            holder: r.holderName,
            value: r.value,
            season: r.season,
            week: r.week,
            description: r.description,
            dateSet: r.dateSet,
          }));
        }
        
        if (records.length === 0) {
          // Provide mock data for demonstration
          records = [
            { rank: 1, holder: 'Team Alpha', value: 185.5, season: 2022, description: 'Single game points record' },
            { rank: 2, holder: 'Team Beta', value: 182.3, season: 2021, description: 'Previous record' },
            { rank: 3, holder: 'Team Gamma', value: 179.8, season: 2020, description: 'Third highest' },
          ];
        }
        
        return JSON.stringify({
          recordBook: {
            type: recordType,
            category,
            records,
            totalEntries: records.length,
          },
          context: `The ${category} record has stood for ${records[0]?.season ? new Date().getFullYear() - records[0].season : 2} years`,
          notableInfo: 'Record-breaking performances often come in playoff weeks',
        });
      },
    });
  }

  /**
   * Tool for dynasty analysis
   */
  private createDynastyAnalysisTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'analyze_dynasty',
      description: 'Analyze dynasty periods and dominant stretches in league history',
      schema: z.object({
        team: z.string().describe('Team to analyze'),
        startYear: z.number().describe('Dynasty start year'),
        endYear: z.number().describe('Dynasty end year'),
        includeComparisons: z.boolean().default(true),
      }),
      func: async ({ team, startYear, endYear, includeComparisons }) => {
        const dynastyYears = endYear - startYear + 1;
        
        // Mock dynasty statistics (would query real data in production)
        const dynastyStats = {
          team,
          period: `${startYear}-${endYear}`,
          duration: dynastyYears,
          achievements: {
            championships: Math.floor(dynastyYears * 0.4),
            playoffAppearances: Math.floor(dynastyYears * 0.8),
            regularSeasonWins: dynastyYears * 10,
            winPercentage: 0.687,
          },
          dominanceScore: 8.5,
        };
        
        const comparisons = includeComparisons ? {
          allTimeDynasties: [
            { team: 'Historic Team A', period: '2010-2013', dominanceScore: 9.2 },
            { team: 'Historic Team B', period: '2015-2017', dominanceScore: 7.8 },
          ],
          ranking: 'Top 3 dynasty in league history',
        } : null;
        
        return JSON.stringify({
          dynasty: dynastyStats,
          comparisons,
          legacy: `${team}'s ${dynastyYears}-year run stands as one of the most dominant stretches in league history`,
          keyFactors: [
            'Consistent drafting excellence',
            'Shrewd waiver wire management',
            'Timely trades',
            'Avoiding major injuries',
          ],
        });
      },
    });
  }

  /**
   * Tool for identifying milestones
   */
  private createMilestoneTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'identify_milestone',
      description: 'Identify approaching or recently achieved milestones',
      schema: z.object({
        type: z.enum(['approaching', 'achieved', 'historic']),
        category: z.string().describe('Category of milestone'),
        subject: z.string().describe('Team or player approaching/achieving milestone'),
        currentValue: z.number().describe('Current value toward milestone'),
        milestoneValue: z.number().describe('Milestone target value'),
      }),
      func: async ({ type, category, subject, currentValue, milestoneValue }) => {
        const progress = (currentValue / milestoneValue) * 100;
        const remaining = milestoneValue - currentValue;
        
        return JSON.stringify({
          milestone: {
            type,
            category,
            subject,
            target: milestoneValue,
            current: currentValue,
            progress: progress.toFixed(1) + '%',
            remaining: type === 'approaching' ? remaining : 0,
          },
          historicalContext: {
            previousHolders: ['Team A (2019)', 'Team B (2017)', 'Team C (2015)'],
            averageTimeToAchieve: '3.5 seasons',
            rarity: progress > 90 ? 'Extremely rare' : 'Uncommon',
          },
          significance: `Achieving ${milestoneValue} ${category} would place ${subject} in elite company`,
          projectedAchievement: type === 'approaching' ? `At current pace: ${Math.ceil(remaining / 10)} more weeks` : 'ACHIEVED!',
        });
      },
    });
  }

  /**
   * Tool for era comparisons
   */
  private createEraComparisonTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'compare_eras',
      description: 'Compare different eras of league history',
      schema: z.object({
        era1: z.object({
          name: z.string(),
          years: z.string(),
        }),
        era2: z.object({
          name: z.string(),
          years: z.string(),
        }),
        metrics: z.array(z.string()).describe('Metrics to compare'),
      }),
      func: async ({ era1, era2, metrics }) => {
        // Mock era comparison data
        const comparison = {
          [era1.name]: {
            period: era1.years,
            characteristics: [
              'High-scoring affairs',
              'Dynasty dominance',
              'Predictable outcomes',
            ],
            averageScore: 115.3,
            topTeams: ['Team A', 'Team B'],
            notableEvents: ['The Great Trade of ' + era1.years.split('-')[0]],
          },
          [era2.name]: {
            period: era2.years,
            characteristics: [
              'Parity and competition',
              'Waiver wire warriors',
              'Upset-heavy seasons',
            ],
            averageScore: 122.7,
            topTeams: ['Team C', 'Team D'],
            notableEvents: ['The Cinderella Run of ' + era2.years.split('-')[1]],
          },
        };
        
        return JSON.stringify({
          eras: comparison,
          analysis: {
            scoring: `Scoring increased by ${((122.7 - 115.3) / 115.3 * 100).toFixed(1)}% from ${era1.name} to ${era2.name}`,
            competitiveness: 'Later era showed more parity',
            evolution: 'Strategic focus shifted from drafting to in-season management',
          },
          verdict: `Each era brought its own unique character to the league`,
        });
      },
    });
  }

  /**
   * Tool for finding historical parallels
   */
  private createHistoricalParallelTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'find_historical_parallel',
      description: 'Find historical parallels to current situations',
      schema: z.object({
        currentSituation: z.string().describe('Current situation to find parallels for'),
        searchDepth: z.enum(['recent', 'medium', 'all_time']).default('medium'),
        factors: z.array(z.string()).describe('Key factors to match'),
      }),
      func: async ({ currentSituation, searchDepth, factors }) => {
        const depthYears = {
          recent: 2,
          medium: 5,
          all_time: 20,
        };
        
        // Mock historical parallels
        const parallels = [
          {
            year: 2019,
            situation: 'Similar comeback from 2-6 to make playoffs',
            outcome: 'Lost in championship game',
            similarity: '87%',
            lessons: 'Momentum matters more than record',
          },
          {
            year: 2017,
            situation: 'Identical roster construction strategy',
            outcome: 'Won championship',
            similarity: '74%',
            lessons: 'Trust the process',
          },
        ];
        
        return JSON.stringify({
          current: currentSituation,
          historicalParallels: parallels,
          searchScope: `Last ${depthYears[searchDepth]} years analyzed`,
          keyFactorsMatched: factors,
          insight: 'History suggests this situation has a 60% success rate',
          advice: 'Learn from the past, but write your own story',
        });
      },
    });
  }

  /**
   * Tool for legacy evaluation
   */
  private createLegacyEvaluationTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'evaluate_legacy',
      description: 'Evaluate the historical legacy of a team or manager',
      schema: z.object({
        subject: z.string().describe('Team or manager to evaluate'),
        achievements: z.array(z.string()).describe('List of achievements'),
        failures: z.array(z.string()).describe('Notable failures or near-misses'),
        signature: z.string().describe('Signature trait or strategy'),
      }),
      func: async ({ subject, achievements, failures, signature }) => {
        const legacyScore = achievements.length * 2 - failures.length;
        const tier = legacyScore > 10 ? 'Legendary' : legacyScore > 5 ? 'Great' : legacyScore > 0 ? 'Good' : 'Building';
        
        return JSON.stringify({
          subject,
          legacy: {
            tier,
            score: legacyScore,
            achievements: achievements.length,
            nearMisses: failures.length,
            signature,
          },
          historicalRanking: {
            allTime: 'Top 10',
            era: 'Top 3 in their era',
            position: 'Best at their strategy type',
          },
          verdict: `${subject} will be remembered as a ${tier.toLowerCase()} figure who ${signature}`,
          comparison: 'Similar legacy to [Historical Great]',
          quote: `"${subject} changed how we think about ${signature}" - League Historian`,
        });
      },
    });
  }

  /**
   * Override the system prompt for historian style
   */
  protected getSystemPrompt(): string {
    return `You are the League Historian for ${this.config.leagueSandbox || 'the league'}, the keeper of records and chronicler of legendary moments.

Your role is to provide historical context, perspective, and wisdom by connecting current events to the rich history of the league.

Historical Expertise:
- Maintain comprehensive knowledge of all league records and milestones
- Remember and recount significant moments and turning points
- Track dynasty periods and evaluate legacies
- Identify patterns and parallels across different eras
- Provide context that enhances understanding of current events
- Celebrate achievements by placing them in historical perspective

Key Responsibilities:
- Compare current performances to historical precedents
- Maintain and reference the league record book
- Identify approaching milestones and their significance
- Analyze dynasties and dominant periods
- Find historical parallels to current situations
- Evaluate legacies of teams and managers
- Provide "this day in league history" content
- Track statistical trends across seasons

Communication Style:
- Scholarly but accessible - avoid being overly academic
- Use specific examples and data from history
- Draw meaningful parallels without forcing connections
- Balance nostalgia with objective analysis
- Respect all eras without excessive "good old days" bias
- Make history relevant to current participants
- Use statistics to support narratives, not overwhelm

Remember: You are the bridge between past and present, helping the league understand how today's events fit into the larger story. Your knowledge adds depth and meaning to every victory, defeat, and milestone.`;
  }

  /**
   * Generate a "This Week in History" segment
   */
  async generateThisWeekInHistory(currentWeek: number): Promise<string> {
    const prompt = `Create a "This Week in History" segment for week ${currentWeek}, highlighting memorable moments from past seasons`;
    const response = await this.processMessage(prompt, `week-history-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate a historical comparison report
   */
  async generateHistoricalComparison(current: any, historical: any): Promise<string> {
    const prompt = `Compare this current situation: ${JSON.stringify(current)} with historical precedent: ${JSON.stringify(historical)}`;
    const response = await this.processMessage(prompt, `historical-comparison-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate a legacy evaluation
   */
  async generateLegacyReport(teamData: any): Promise<string> {
    const prompt = `Evaluate the historical legacy of this team/manager: ${JSON.stringify(teamData)}`;
    const response = await this.processMessage(prompt, `legacy-report-${Date.now()}`);
    return response.response;
  }
}