/**
 * ContextBuilder - Builds rich context for AI agent responses
 * 
 * Gathers relevant league data, chat history, user information, and
 * current game state to provide agents with comprehensive context for
 * generating informed and personalized responses.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();

export interface ChatContext {
  // User context
  user: {
    id: string;
    name: string;
    team?: {
      id: string;
      name: string;
      record: string;
      standing: number;
      roster?: any[];
    };
  };
  
  // League context
  league: {
    id: string;
    name: string;
    sandboxNamespace: string;
    week: number;
    season: number;
    isPlayoffs: boolean;
    settings?: any;
  };
  
  // Current game state
  gameState: {
    currentMatchup?: {
      opponent: string;
      homeScore: number;
      awayScore: number;
      projectedWinner: string;
      isComplete: boolean;
    };
    liveScores?: Array<{
      teamName: string;
      score: number;
      projected: number;
    }>;
    standings: Array<{
      team: string;
      wins: number;
      losses: number;
      pointsFor: number;
    }>;
  };
  
  // Recent activity
  recentActivity: {
    transactions?: Array<{
      type: string;
      team: string;
      player?: string;
      date: Date;
    }>;
    chatMessages: Array<{
      sender: string;
      content: string;
      timestamp: Date;
    }>;
    injuries?: Array<{
      player: string;
      status: string;
      team: string;
    }>;
  };
  
  // Historical context
  history: {
    seasonRecord?: string;
    allTimeRecord?: {
      wins: number;
      losses: number;
      championships: number;
    };
    headToHead?: Map<string, {
      wins: number;
      losses: number;
    }>;
    recentPerformance?: Array<{
      week: number;
      result: 'W' | 'L' | 'T';
      score: number;
      opponentScore: number;
    }>;
  };
  
  // Agent-specific context
  agentContext: {
    previousInteractions?: number;
    lastInteraction?: Date;
    userPreferences?: any;
    relevantMemories?: string[];
  };
  
  // Additional metadata
  metadata: {
    timestamp: Date;
    requestId: string;
    sessionId: string;
    cacheHit?: boolean;
  };
}

export class ContextBuilder {
  private redis: Redis;
  private cacheEnabled: boolean;
  private cacheTTL: number = 300; // 5 minutes default
  
  constructor(cacheEnabled = true) {
    this.redis = new Redis(process.env.REDIS_URL!);
    this.cacheEnabled = cacheEnabled;
  }

  async buildContext(
    userId: string,
    leagueSandbox: string,
    sessionId: string,
    options: {
      includeHistory?: boolean;
      includeTransactions?: boolean;
      includeInjuries?: boolean;
      maxChatMessages?: number;
      cacheKey?: string;
    } = {}
  ): Promise<ChatContext> {
    const requestId = `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Check cache if enabled
    if (this.cacheEnabled && options.cacheKey) {
      const cached = await this.getFromCache(options.cacheKey);
      if (cached) {
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            cacheHit: true,
            requestId,
          }
        };
      }
    }

    // Build context in parallel
    const [
      userContext,
      leagueContext,
      gameState,
      recentActivity,
      history,
      agentContext
    ] = await Promise.all([
      this.buildUserContext(userId, leagueSandbox),
      this.buildLeagueContext(leagueSandbox),
      this.buildGameState(leagueSandbox, userId),
      this.buildRecentActivity(
        leagueSandbox,
        userId,
        options.includeTransactions || false,
        options.includeInjuries || false,
        options.maxChatMessages || 10
      ),
      options.includeHistory ? this.buildHistory(leagueSandbox, userId) : Promise.resolve({}),
      this.buildAgentContext(userId, leagueSandbox, sessionId)
    ]);

    const context: ChatContext = {
      user: userContext,
      league: leagueContext,
      gameState,
      recentActivity,
      history,
      agentContext,
      metadata: {
        timestamp: new Date(),
        requestId,
        sessionId,
        cacheHit: false,
      }
    };

    // Cache if enabled
    if (this.cacheEnabled && options.cacheKey) {
      await this.saveToCache(options.cacheKey, context);
    }

    return context;
  }

  private async buildUserContext(userId: string, leagueSandbox: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        username: true,
      }
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get user's team in this league
    const member = await prisma.leagueMember.findFirst({
      where: {
        userId,
        league: { sandboxNamespace: leagueSandbox }
      },
      include: {
        team: {
          include: {
            roster: {
              include: {
                player: true
              },
              where: {
                week: {
                  equals: await this.getCurrentWeek(leagueSandbox)
                }
              }
            }
          }
        }
      }
    });

    return {
      id: user.id,
      name: user.displayName || user.username,
      team: member?.team ? {
        id: member.team.id,
        name: member.team.name,
        record: `${member.team.wins}-${member.team.losses}${member.team.ties > 0 ? `-${member.team.ties}` : ''}`,
        standing: member.team.standing || 0,
        roster: member.team.roster.map(spot => ({
          player: spot.player.name,
          position: spot.slotPosition,
          points: spot.points,
        }))
      } : undefined,
    };
  }

  private async buildLeagueContext(leagueSandbox: string) {
    const league = await prisma.league.findUnique({
      where: { sandboxNamespace: leagueSandbox },
      include: {
        _count: {
          select: { teams: true }
        }
      }
    });

    if (!league) {
      throw new Error(`League not found: ${leagueSandbox}`);
    }

    const currentWeek = await this.getCurrentWeek(leagueSandbox);
    const isPlayoffs = await this.isPlayoffWeek(leagueSandbox, currentWeek);

    return {
      id: league.id,
      name: league.name,
      sandboxNamespace: league.sandboxNamespace,
      week: currentWeek,
      season: league.season,
      isPlayoffs,
      settings: league.settings,
    };
  }

  private async buildGameState(leagueSandbox: string, userId: string) {
    const currentWeek = await this.getCurrentWeek(leagueSandbox);
    
    // Get user's current matchup
    const userTeam = await this.getUserTeam(leagueSandbox, userId);
    let currentMatchup;
    
    if (userTeam) {
      const matchup = await prisma.leagueMatchup.findFirst({
        where: {
          league: { sandboxNamespace: leagueSandbox },
          week: currentWeek,
          OR: [
            { homeTeamId: userTeam.id },
            { awayTeamId: userTeam.id }
          ]
        },
        include: {
          homeTeam: true,
          awayTeam: true,
        }
      });

      if (matchup) {
        const isHome = matchup.homeTeamId === userTeam.id;
        const opponent = isHome ? matchup.awayTeam : matchup.homeTeam;
        const userScore = isHome ? matchup.homeScore : matchup.awayScore;
        const oppScore = isHome ? matchup.awayScore : matchup.homeScore;
        
        currentMatchup = {
          opponent: opponent.name,
          homeScore: matchup.homeScore || 0,
          awayScore: matchup.awayScore || 0,
          projectedWinner: (userScore || 0) > (oppScore || 0) ? userTeam.name : opponent.name,
          isComplete: matchup.isComplete,
        };
      }
    }

    // Get league standings
    const standings = await prisma.leagueTeam.findMany({
      where: {
        league: { sandboxNamespace: leagueSandbox }
      },
      orderBy: [
        { wins: 'desc' },
        { pointsFor: 'desc' }
      ],
      take: 10,
      select: {
        name: true,
        wins: true,
        losses: true,
        pointsFor: true,
      }
    });

    // Get live scores for current week
    const liveMatchups = await prisma.leagueMatchup.findMany({
      where: {
        league: { sandboxNamespace: leagueSandbox },
        week: currentWeek,
        isComplete: false,
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      take: 5,
    });

    const liveScores = liveMatchups.flatMap(m => [
      {
        teamName: m.homeTeam.name,
        score: m.homeScore || 0,
        projected: 0, // Would need projection data
      },
      {
        teamName: m.awayTeam.name,
        score: m.awayScore || 0,
        projected: 0,
      }
    ]);

    return {
      currentMatchup,
      liveScores,
      standings: standings.map(team => ({
        team: team.name,
        wins: team.wins,
        losses: team.losses,
        pointsFor: team.pointsFor,
      })),
    };
  }

  private async buildRecentActivity(
    leagueSandbox: string,
    userId: string,
    includeTransactions: boolean,
    includeInjuries: boolean,
    maxChatMessages: number
  ) {
    // Get recent chat messages
    const chatMessages = await prisma.chatMessage.findMany({
      where: { leagueSandbox },
      orderBy: { createdAt: 'desc' },
      take: maxChatMessages,
      select: {
        senderId: true,
        content: true,
        createdAt: true,
        senderType: true,
      }
    });

    // Get transactions if requested
    let transactions;
    if (includeTransactions) {
      transactions = await prisma.leagueTransaction.findMany({
        where: {
          league: { sandboxNamespace: leagueSandbox }
        },
        orderBy: { transactionDate: 'desc' },
        take: 10,
        select: {
          type: true,
          teamId: true,
          playerId: true,
          transactionDate: true,
        }
      });
    }

    // Get injuries if requested
    let injuries;
    if (includeInjuries) {
      injuries = await prisma.leaguePlayer.findMany({
        where: {
          league: { sandboxNamespace: leagueSandbox },
          injuryStatus: { not: null }
        },
        select: {
          name: true,
          injuryStatus: true,
          nflTeam: true,
        },
        take: 10,
      });
    }

    return {
      transactions: transactions?.map(t => ({
        type: t.type,
        team: t.teamId?.toString() || '',
        player: t.playerId?.toString(),
        date: t.transactionDate,
      })),
      chatMessages: chatMessages.reverse().map(msg => ({
        sender: msg.senderId,
        content: msg.content,
        timestamp: msg.createdAt,
      })),
      injuries: injuries?.map(i => ({
        player: i.name,
        status: i.injuryStatus || '',
        team: i.nflTeam || '',
      })),
    };
  }

  private async buildHistory(leagueSandbox: string, userId: string) {
    const userTeam = await this.getUserTeam(leagueSandbox, userId);
    if (!userTeam) {
      return {};
    }

    // Get all-time record
    const allTimeRecord = await prisma.allTimeRecord.findFirst({
      where: {
        league: { sandboxNamespace: leagueSandbox },
        teamId: userTeam.id,
        recordType: 'OVERALL',
      }
    });

    // Get head-to-head records
    const h2hRecords = await prisma.headToHeadRecord.findMany({
      where: {
        league: { sandboxNamespace: leagueSandbox },
        OR: [
          { team1Id: userTeam.id },
          { team2Id: userTeam.id }
        ]
      }
    });

    const headToHead = new Map();
    h2hRecords.forEach(record => {
      const opponentId = record.team1Id === userTeam.id ? record.team2Id : record.team1Id;
      const wins = record.team1Id === userTeam.id ? record.team1Wins : record.team2Wins;
      const losses = record.team1Id === userTeam.id ? record.team2Wins : record.team1Wins;
      headToHead.set(opponentId, { wins, losses });
    });

    // Get recent performance
    const recentMatchups = await prisma.leagueMatchup.findMany({
      where: {
        league: { sandboxNamespace: leagueSandbox },
        OR: [
          { homeTeamId: userTeam.id },
          { awayTeamId: userTeam.id }
        ],
        isComplete: true,
      },
      orderBy: { week: 'desc' },
      take: 5,
    });

    const recentPerformance = recentMatchups.map(m => {
      const isHome = m.homeTeamId === userTeam.id;
      const userScore = isHome ? m.homeScore : m.awayScore;
      const oppScore = isHome ? m.awayScore : m.homeScore;
      
      let result: 'W' | 'L' | 'T' = 'T';
      if (userScore && oppScore) {
        if (userScore > oppScore) result = 'W';
        else if (userScore < oppScore) result = 'L';
      }
      
      return {
        week: m.week,
        result,
        score: userScore || 0,
        opponentScore: oppScore || 0,
      };
    });

    return {
      seasonRecord: `${userTeam.wins}-${userTeam.losses}`,
      allTimeRecord: allTimeRecord ? {
        wins: allTimeRecord.wins,
        losses: allTimeRecord.losses,
        championships: allTimeRecord.championships || 0,
      } : undefined,
      headToHead,
      recentPerformance,
    };
  }

  private async buildAgentContext(userId: string, leagueSandbox: string, sessionId: string) {
    // Get previous interactions count
    const previousInteractions = await prisma.agentConversation.count({
      where: {
        userId,
        leagueSandbox,
      }
    });

    // Get last interaction
    const lastInteraction = await prisma.agentConversation.findFirst({
      where: {
        userId,
        leagueSandbox,
      },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // Get relevant memories from agent memory
    const relevantMemories = await prisma.agentMemory.findMany({
      where: {
        leagueSandbox,
      },
      orderBy: { importance: 'desc' },
      take: 5,
      select: { content: true }
    });

    return {
      previousInteractions,
      lastInteraction: lastInteraction?.updatedAt,
      relevantMemories: relevantMemories.map(m => m.content),
    };
  }

  // Helper methods
  
  private async getCurrentWeek(leagueSandbox: string): Promise<number> {
    // Get the most recent matchup week
    const recentMatchup = await prisma.leagueMatchup.findFirst({
      where: {
        league: { sandboxNamespace: leagueSandbox }
      },
      orderBy: { week: 'desc' },
      select: { week: true }
    });
    
    return recentMatchup?.week || 1;
  }

  private async isPlayoffWeek(leagueSandbox: string, week: number): Promise<boolean> {
    const playoffMatchup = await prisma.leagueMatchup.findFirst({
      where: {
        league: { sandboxNamespace: leagueSandbox },
        week,
        isPlayoffs: true,
      }
    });
    
    return !!playoffMatchup;
  }

  private async getUserTeam(leagueSandbox: string, userId: string) {
    const member = await prisma.leagueMember.findFirst({
      where: {
        userId,
        league: { sandboxNamespace: leagueSandbox }
      },
      include: {
        team: true
      }
    });
    
    return member?.team;
  }

  // Cache methods
  
  private async getFromCache(key: string): Promise<ChatContext | null> {
    try {
      const cached = await this.redis.get(`context:${key}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Cache get error:', error);
    }
    return null;
  }

  private async saveToCache(key: string, context: ChatContext): Promise<void> {
    try {
      await this.redis.setex(
        `context:${key}`,
        this.cacheTTL,
        JSON.stringify(context)
      );
    } catch (error) {
      console.error('Cache save error:', error);
    }
  }

  setCacheTTL(seconds: number) {
    this.cacheTTL = seconds;
  }
}