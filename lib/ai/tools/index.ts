/**
 * AI Agent Tools Collection
 * 
 * Provides a suite of tools that AI agents can use to interact with
 * league data, perform calculations, and access external information.
 */

import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Tool for retrieving league data (standings, matchups, records)
 */
export function createLeagueDataTool(leagueSandbox?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_league_data',
    description: 'Get current league standings, matchups, records, and team information. Use this to access real-time league data.',
    schema: z.object({
      type: z.enum(['standings', 'matchups', 'records', 'teams', 'transactions']).describe('Type of data to retrieve'),
      week: z.number().optional().describe('Week number for matchups (optional)'),
      limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    }),
    func: async ({ type, week, limit }) => {
      try {
        switch (type) {
          case 'standings': {
            const standings = await prisma.$queryRaw`
              SELECT 
                t.team_name,
                s.wins,
                s.losses,
                s.ties,
                s.total_points_for,
                s.total_points_against,
                s.win_percentage,
                s.current_streak
              FROM season_statistics s
              JOIN league_teams t ON s.team_id = t.id
              WHERE s.league_sandbox = ${leagueSandbox}
              ORDER BY s.wins DESC, s.total_points_for DESC
              LIMIT ${limit}
            `;
            return JSON.stringify({ type: 'standings', data: standings });
          }
          
          case 'matchups': {
            const matchups = await prisma.leagueMatchup.findMany({
              where: {
                leagueSandbox: leagueSandbox || undefined,
                week: week || undefined,
              },
              include: {
                homeTeam: true,
                awayTeam: true,
              },
              orderBy: { date: 'desc' },
              take: limit,
            });
            return JSON.stringify({ type: 'matchups', week, data: matchups });
          }
          
          case 'records': {
            const records = await prisma.allTimeRecord.findMany({
              where: { leagueSandbox: leagueSandbox || undefined },
              orderBy: { value: 'desc' },
              take: limit,
            });
            return JSON.stringify({ type: 'records', data: records });
          }
          
          case 'teams': {
            const teams = await prisma.leagueTeam.findMany({
              where: { leagueSandbox: leagueSandbox || undefined },
              include: {
                member: {
                  include: {
                    user: true,
                  },
                },
              },
              take: limit,
            });
            return JSON.stringify({ type: 'teams', data: teams });
          }
          
          case 'transactions': {
            const transactions = await prisma.leagueTransaction.findMany({
              where: { leagueSandbox: leagueSandbox || undefined },
              orderBy: { date: 'desc' },
              take: limit,
            });
            return JSON.stringify({ type: 'transactions', data: transactions });
          }
          
          default:
            return JSON.stringify({ error: 'Unknown data type requested' });
        }
      } catch (error) {
        return JSON.stringify({ 
          error: `Failed to retrieve ${type} data: ${(error as Error).message}` 
        });
      }
    },
  });
}

/**
 * Tool for getting detailed player statistics
 */
export function createPlayerStatsTool(leagueSandbox?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_player_stats',
    description: 'Get detailed player statistics, performance data, and projections for fantasy football players.',
    schema: z.object({
      playerName: z.string().describe('Name of the player to search for'),
      seasonId: z.string().optional().describe('Season ID (optional, defaults to current)'),
      statType: z.enum(['season', 'weekly', 'career']).optional().default('season').describe('Type of statistics to retrieve'),
    }),
    func: async ({ playerName, seasonId, statType }) => {
      try {
        const stats = await prisma.leaguePlayerStats.findFirst({
          where: {
            leagueSandbox: leagueSandbox || undefined,
            playerName: {
              contains: playerName,
              mode: 'insensitive',
            },
            seasonId: seasonId || undefined,
          },
          include: {
            player: true,
          },
        });
        
        if (!stats) {
          return JSON.stringify({ 
            error: `Player '${playerName}' not found${seasonId ? ` in season ${seasonId}` : ''}` 
          });
        }
        
        return JSON.stringify({
          player: stats.player,
          stats: stats.stats,
          statType,
        });
      } catch (error) {
        return JSON.stringify({ 
          error: `Failed to retrieve player stats: ${(error as Error).message}` 
        });
      }
    },
  });
}

/**
 * Tool for performing mathematical calculations
 */
export function createCalculatorTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'calculator',
    description: 'Perform mathematical calculations. Can handle basic arithmetic, percentages, and statistical calculations.',
    schema: z.object({
      expression: z.string().describe('Mathematical expression to evaluate (e.g., "150.5 + 45.2", "250 * 0.15")'),
      operation: z.enum(['basic', 'percentage', 'average', 'projection']).optional().describe('Type of calculation'),
    }),
    func: async ({ expression, operation }) => {
      try {
        // Security: Only allow safe mathematical operations
        const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
        
        if (operation === 'percentage') {
          // Handle percentage calculations
          const match = safeExpression.match(/(\d+\.?\d*)\s*of\s*(\d+\.?\d*)/);
          if (match) {
            const [, part, whole] = match;
            const result = (parseFloat(part) / parseFloat(whole)) * 100;
            return `${part} is ${result.toFixed(2)}% of ${whole}`;
          }
        }
        
        if (operation === 'average') {
          // Calculate average from comma-separated numbers
          const numbers = safeExpression.split(',').map(n => parseFloat(n.trim()));
          const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
          return `Average of [${numbers.join(', ')}] = ${avg.toFixed(2)}`;
        }
        
        // Basic calculation using Function constructor (safer than eval)
        const result = Function('"use strict"; return (' + safeExpression + ')')();
        return `${expression} = ${result}`;
      } catch (error) {
        return `Invalid calculation: ${(error as Error).message}`;
      }
    },
  });
}

/**
 * Tool for comparing head-to-head records between teams
 */
export function createHeadToHeadTool(leagueSandbox?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'head_to_head',
    description: 'Get head-to-head records and statistics between two teams in the league.',
    schema: z.object({
      team1: z.string().describe('Name or ID of the first team'),
      team2: z.string().describe('Name or ID of the second team'),
    }),
    func: async ({ team1, team2 }) => {
      try {
        // Find the teams
        const teams = await prisma.leagueTeam.findMany({
          where: {
            leagueSandbox: leagueSandbox || undefined,
            OR: [
              { teamName: { contains: team1, mode: 'insensitive' } },
              { teamName: { contains: team2, mode: 'insensitive' } },
            ],
          },
        });
        
        if (teams.length < 2) {
          return JSON.stringify({ 
            error: `Could not find both teams: ${team1} and ${team2}` 
          });
        }
        
        // Get head-to-head record
        const h2h = await prisma.headToHeadRecord.findFirst({
          where: {
            leagueSandbox: leagueSandbox || undefined,
            OR: [
              {
                team1Id: teams[0].id,
                team2Id: teams[1].id,
              },
              {
                team1Id: teams[1].id,
                team2Id: teams[0].id,
              },
            ],
          },
        });
        
        if (!h2h) {
          return JSON.stringify({ 
            message: `No head-to-head record found between ${team1} and ${team2}` 
          });
        }
        
        return JSON.stringify({
          team1: teams[0].teamName,
          team2: teams[1].teamName,
          record: h2h,
        });
      } catch (error) {
        return JSON.stringify({ 
          error: `Failed to retrieve head-to-head data: ${(error as Error).message}` 
        });
      }
    },
  });
}

/**
 * Tool for analyzing performance trends
 */
export function createTrendAnalysisTool(leagueSandbox?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'analyze_trends',
    description: 'Analyze performance trends for teams or players over time.',
    schema: z.object({
      subject: z.string().describe('Team or player name to analyze'),
      timeframe: z.enum(['season', 'last5', 'last10', 'monthly']).describe('Timeframe for analysis'),
      metric: z.enum(['points', 'wins', 'efficiency', 'consistency']).optional().describe('Specific metric to analyze'),
    }),
    func: async ({ subject, timeframe, metric }) => {
      try {
        // Check if subject is a team
        const team = await prisma.leagueTeam.findFirst({
          where: {
            leagueSandbox: leagueSandbox || undefined,
            teamName: {
              contains: subject,
              mode: 'insensitive',
            },
          },
        });
        
        if (team) {
          // Get team trends
          const trends = await prisma.performanceTrend.findMany({
            where: {
              leagueSandbox: leagueSandbox || undefined,
              teamId: team.id,
            },
            orderBy: { periodEnd: 'desc' },
            take: timeframe === 'last5' ? 5 : timeframe === 'last10' ? 10 : 20,
          });
          
          return JSON.stringify({
            type: 'team',
            subject: team.teamName,
            timeframe,
            metric,
            trends,
          });
        }
        
        // Check if subject is a player
        const player = await prisma.leaguePlayer.findFirst({
          where: {
            leagueSandbox: leagueSandbox || undefined,
            name: {
              contains: subject,
              mode: 'insensitive',
            },
          },
        });
        
        if (player) {
          // Get player trends from stats
          const stats = await prisma.leaguePlayerStats.findMany({
            where: {
              leagueSandbox: leagueSandbox || undefined,
              playerId: player.id,
            },
            orderBy: { week: 'desc' },
            take: timeframe === 'last5' ? 5 : timeframe === 'last10' ? 10 : 20,
          });
          
          return JSON.stringify({
            type: 'player',
            subject: player.name,
            timeframe,
            metric,
            stats,
          });
        }
        
        return JSON.stringify({ 
          error: `No team or player found matching '${subject}'` 
        });
      } catch (error) {
        return JSON.stringify({ 
          error: `Failed to analyze trends: ${(error as Error).message}` 
        });
      }
    },
  });
}

/**
 * Tool for searching web/news (mock implementation for now)
 */
export function createWebSearchTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'web_search',
    description: 'Search for current NFL player news, injuries, and updates from the web.',
    schema: z.object({
      query: z.string().describe('Search query for NFL/fantasy football information'),
      category: z.enum(['news', 'injury', 'trade', 'general']).optional().describe('Category to filter results'),
    }),
    func: async ({ query, category }) => {
      // Mock implementation - in production, this would call a real search API
      const mockResults = {
        news: [
          `Latest update on ${query}: Player showing strong performance in practice`,
          `Coach comments on ${query}'s role in upcoming game`,
          `Fantasy implications of ${query}'s recent performance`,
        ],
        injury: [
          `${query} injury report: Day-to-day with minor issue`,
          `${query} expected to play this week despite injury concerns`,
        ],
        trade: [
          `Trade rumors surrounding ${query} heating up`,
          `${query} likely to stay with current team through deadline`,
        ],
        general: [
          `${query} ranked in top tier for fantasy this week`,
          `Expert analysis on ${query}'s rest-of-season outlook`,
        ],
      };
      
      const results = category ? mockResults[category] : mockResults.general;
      
      return JSON.stringify({
        query,
        category: category || 'general',
        results: results.slice(0, 3),
        note: 'Mock data - real web search integration pending',
      });
    },
  });
}

/**
 * Tool for getting league settings and configuration
 */
export function createLeagueSettingsTool(leagueSandbox?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_league_settings',
    description: 'Get league settings, scoring configuration, and roster requirements.',
    schema: z.object({
      settingType: z.enum(['scoring', 'roster', 'schedule', 'playoffs', 'all']).describe('Type of settings to retrieve'),
    }),
    func: async ({ settingType }) => {
      try {
        const league = await prisma.league.findFirst({
          where: { sandboxNamespace: leagueSandbox || undefined },
          include: {
            leagueSettings: true,
          },
        });
        
        if (!league) {
          return JSON.stringify({ error: 'League not found' });
        }
        
        const settings = league.leagueSettings?.[0]?.settings || {};
        
        if (settingType === 'all') {
          return JSON.stringify(settings);
        }
        
        return JSON.stringify({
          type: settingType,
          data: settings[settingType] || {},
        });
      } catch (error) {
        return JSON.stringify({ 
          error: `Failed to retrieve settings: ${(error as Error).message}` 
        });
      }
    },
  });
}

/**
 * Tool for getting season/week context
 */
export function createSeasonContextTool(): DynamicTool {
  return new DynamicTool({
    name: 'get_season_context',
    description: 'Get current season, week, and important dates for fantasy football.',
    func: async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      // Determine current NFL week (simplified logic)
      let currentWeek = 1;
      let seasonPhase = 'regular';
      
      // NFL season typically runs September to January
      if (currentMonth < 8) { // Before September
        seasonPhase = 'offseason';
        currentWeek = 0;
      } else if (currentMonth === 8) { // September
        currentWeek = Math.ceil(now.getDate() / 7);
      } else if (currentMonth === 9) { // October
        currentWeek = 4 + Math.ceil(now.getDate() / 7);
      } else if (currentMonth === 10) { // November
        currentWeek = 8 + Math.ceil(now.getDate() / 7);
      } else if (currentMonth === 11) { // December
        currentWeek = 13 + Math.ceil(now.getDate() / 7);
        if (currentWeek > 14) seasonPhase = 'playoffs';
      } else if (currentMonth === 0) { // January
        seasonPhase = 'playoffs';
        currentWeek = 17;
      }
      
      return JSON.stringify({
        currentSeason: currentYear,
        currentWeek,
        seasonPhase,
        date: now.toISOString(),
        fantasyDeadlines: {
          tradeDeadline: `${currentYear}-11-15`,
          playoffStart: `${currentYear}-12-15`,
          championship: `${currentYear}-12-25`,
        },
      });
    },
  });
}

/**
 * Create all tools for a specific league
 */
export function createAllTools(leagueSandbox?: string): (DynamicTool | DynamicStructuredTool)[] {
  return [
    createLeagueDataTool(leagueSandbox),
    createPlayerStatsTool(leagueSandbox),
    createCalculatorTool(),
    createHeadToHeadTool(leagueSandbox),
    createTrendAnalysisTool(leagueSandbox),
    createWebSearchTool(),
    createLeagueSettingsTool(leagueSandbox),
    createSeasonContextTool(),
  ];
}

/**
 * Create a subset of tools based on agent type
 */
export function createToolsForAgentType(
  agentType: 'COMMISSIONER' | 'ANALYST' | 'NARRATOR' | 'TRASH_TALKER' | 'BETTING_ADVISOR',
  leagueSandbox?: string
): (DynamicTool | DynamicStructuredTool)[] {
  const allTools = {
    leagueData: createLeagueDataTool(leagueSandbox),
    playerStats: createPlayerStatsTool(leagueSandbox),
    calculator: createCalculatorTool(),
    headToHead: createHeadToHeadTool(leagueSandbox),
    trends: createTrendAnalysisTool(leagueSandbox),
    webSearch: createWebSearchTool(),
    settings: createLeagueSettingsTool(leagueSandbox),
    seasonContext: createSeasonContextTool(),
  };
  
  switch (agentType) {
    case 'COMMISSIONER':
      // Commissioner needs all tools for comprehensive oversight
      return Object.values(allTools);
      
    case 'ANALYST':
      // Analyst focuses on data and trends
      return [
        allTools.leagueData,
        allTools.playerStats,
        allTools.calculator,
        allTools.trends,
        allTools.headToHead,
        allTools.seasonContext,
      ];
      
    case 'NARRATOR':
      // Narrator needs context and storylines
      return [
        allTools.leagueData,
        allTools.playerStats,
        allTools.headToHead,
        allTools.trends,
        allTools.seasonContext,
      ];
      
    case 'TRASH_TALKER':
      // Trash talker needs competitive data
      return [
        allTools.leagueData,
        allTools.headToHead,
        allTools.trends,
        allTools.seasonContext,
      ];
      
    case 'BETTING_ADVISOR':
      // Betting advisor needs all analytical tools
      return [
        allTools.leagueData,
        allTools.playerStats,
        allTools.calculator,
        allTools.trends,
        allTools.webSearch,
        allTools.seasonContext,
      ];
      
    default:
      // Default to basic tools
      return [
        allTools.leagueData,
        allTools.seasonContext,
      ];
  }
}