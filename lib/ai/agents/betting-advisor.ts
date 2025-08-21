/**
 * Betting Advisor Agent
 * 
 * The analytical betting expert providing data-driven insights, odds analysis,
 * and strategic recommendations for paper betting competitions.
 */

import { BaseAgent, AgentConfig } from '../base-agent';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { createToolsForAgentType } from '../tools';
import { AgentType } from '@prisma/client';
import { z } from 'zod';

export class BettingAdvisorAgent extends BaseAgent {
  constructor(leagueSandbox?: string) {
    const config: AgentConfig = {
      id: `betting-advisor-${leagueSandbox || 'global'}`,
      type: AgentType.BETTING_ADVISOR,
      leagueSandbox,
      personality: {
        traits: [
          'analytical',
          'calculated',
          'risk-aware',
          'strategic',
          'disciplined',
          'data-driven',
          'pragmatic',
        ],
        tone: 'professional and measured, like a seasoned sports analyst',
        expertise: [
          'odds analysis',
          'risk assessment',
          'value identification',
          'bankroll management',
          'statistical modeling',
          'trend analysis',
          'matchup evaluation',
          'injury impact assessment',
          'weather factor analysis',
          'psychological factors',
        ],
        catchphrases: [
          'The smart money says...',
          'Value exists where others fear to tread...',
          'Let\'s look at the expected value here...',
          'The numbers don\'t lie, but they don\'t tell the whole story...',
          'Risk and reward are two sides of the same coin...',
          'Discipline beats luck in the long run...',
          'The edge is small, but it\'s there...',
          'Variance is temporary, process is permanent...',
        ],
        humor: 'none',
      },
      temperature: 0.3, // Very low temperature for consistent, analytical responses
      maxTokens: 2500,
    };
    
    super(config);
  }

  /**
   * Create Betting Advisor-specific tools
   */
  protected async createTools(): Promise<(DynamicTool | DynamicStructuredTool)[]> {
    const standardTools = createToolsForAgentType('BETTING_ADVISOR', this.config.leagueSandbox);
    
    const bettingTools = [
      this.createOddsAnalysisTool(),
      this.createValueBetIdentifierTool(),
      this.createRiskAssessmentTool(),
      this.createBankrollManagementTool(),
      this.createParlayBuilderTool(),
      this.createLiveAdjustmentTool(),
      this.createInjuryImpactTool(),
      this.createRealTimeOddsTool(),
      this.createLineMovementTool(),
      this.createHistoricalOddsTool(),
      // New betting engine tools
      this.createGetBankrollTool(),
      this.createGetActiveBetsTool(),
      this.createGetBettingHistoryTool(),
      this.createCalculatePayoutTool(),
      this.createBettingStatsTool(),
    ];
    
    return [...standardTools, ...bettingTools];
  }

  /**
   * Tool for analyzing betting odds and lines
   */
  private createOddsAnalysisTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'analyze_odds',
      description: 'Analyze betting odds and identify value opportunities',
      schema: z.object({
        matchup: z.string().describe('Teams involved in the matchup'),
        spread: z.number().describe('Point spread'),
        overUnder: z.number().describe('Over/under total'),
        moneyline: z.object({
          favorite: z.number(),
          underdog: z.number(),
        }).describe('Moneyline odds'),
        publicBettingPercentage: z.number().optional().describe('Percentage of public on favorite'),
      }),
      func: async ({ matchup, spread, overUnder, moneyline, publicBettingPercentage }) => {
        // Calculate implied probabilities
        const favoriteImpliedProb = moneyline.favorite < 0 
          ? Math.abs(moneyline.favorite) / (Math.abs(moneyline.favorite) + 100)
          : 100 / (moneyline.favorite + 100);
        
        const underdogImpliedProb = moneyline.underdog > 0
          ? 100 / (moneyline.underdog + 100)
          : Math.abs(moneyline.underdog) / (Math.abs(moneyline.underdog) + 100);

        // Identify potential value
        const publicFade = publicBettingPercentage && publicBettingPercentage > 70;
        const tightSpread = Math.abs(spread) < 3;
        
        return JSON.stringify({
          matchup,
          analysis: {
            spread: {
              line: spread,
              assessment: tightSpread ? 'Close game expected' : 'Clear favorite',
              recommendation: tightSpread ? 'Consider underdog ATS' : 'Analyze team trends',
            },
            total: {
              line: overUnder,
              factors: ['Recent scoring trends', 'Weather conditions', 'Pace of play'],
            },
            moneyline: {
              favoriteOdds: moneyline.favorite,
              underdogOdds: moneyline.underdog,
              favoriteImpliedProbability: (favoriteImpliedProb * 100).toFixed(1) + '%',
              underdogImpliedProbability: (underdogImpliedProb * 100).toFixed(1) + '%',
            },
            publicBetting: publicFade ? 'Potential fade opportunity' : 'No significant public bias',
          },
          confidence: 'Medium',
        });
      },
    });
  }

  /**
   * Tool for identifying value bets
   */
  private createValueBetIdentifierTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'identify_value_bet',
      description: 'Identify value betting opportunities based on expected value',
      schema: z.object({
        bet: z.string().describe('Description of the bet'),
        odds: z.number().describe('Decimal odds offered'),
        estimatedProbability: z.number().describe('Your estimated probability of success (0-1)'),
        betSize: z.number().describe('Proposed bet size'),
      }),
      func: async ({ bet, odds, estimatedProbability, betSize }) => {
        // Calculate expected value
        const impliedProbability = 1 / odds;
        const expectedValue = (estimatedProbability * (odds - 1) * betSize) - ((1 - estimatedProbability) * betSize);
        const hasValue = estimatedProbability > impliedProbability;
        const edge = ((estimatedProbability - impliedProbability) * 100).toFixed(1);
        
        // Kelly Criterion for optimal bet sizing
        const kellyPercentage = ((estimatedProbability * odds - 1) / (odds - 1)) * 100;
        const conservativeKelly = kellyPercentage * 0.25; // Quarter Kelly for safety
        
        return JSON.stringify({
          bet,
          analysis: {
            odds: {
              decimal: odds,
              impliedProbability: (impliedProbability * 100).toFixed(1) + '%',
              yourEstimate: (estimatedProbability * 100).toFixed(1) + '%',
            },
            value: {
              hasValue,
              edge: edge + '%',
              expectedValue: expectedValue.toFixed(2),
            },
            sizing: {
              proposed: betSize,
              kellyOptimal: kellyPercentage.toFixed(1) + '%',
              conservative: conservativeKelly.toFixed(1) + '%',
              recommendation: conservativeKelly > 5 ? 'Scale up' : conservativeKelly < 1 ? 'Pass' : 'Appropriate',
            },
          },
          verdict: hasValue ? 'VALUE BET IDENTIFIED' : 'NO VALUE - PASS',
        });
      },
    });
  }

  /**
   * Tool for risk assessment
   */
  private createRiskAssessmentTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'assess_risk',
      description: 'Assess the risk level of a betting strategy or specific bet',
      schema: z.object({
        betType: z.enum(['straight', 'parlay', 'teaser', 'prop', 'future']),
        numberOfLegs: z.number().optional().describe('For parlays/teasers'),
        bankrollPercentage: z.number().describe('Percentage of bankroll at risk'),
        variance: z.enum(['low', 'medium', 'high']).describe('Expected variance'),
        timeframe: z.string().describe('When the bet resolves'),
      }),
      func: async ({ betType, numberOfLegs, bankrollPercentage, variance, timeframe }) => {
        // Risk scoring system
        let riskScore = 0;
        let factors = [];
        
        // Bet type risk
        const betTypeRisk = {
          straight: 1,
          teaser: 2,
          prop: 3,
          parlay: 4,
          future: 3,
        };
        riskScore += betTypeRisk[betType];
        factors.push(`Bet type (${betType}): ${betTypeRisk[betType]}/5`);
        
        // Parlay legs risk
        if (numberOfLegs) {
          const legRisk = Math.min(numberOfLegs, 5);
          riskScore += legRisk;
          factors.push(`Number of legs: ${legRisk}/5`);
        }
        
        // Bankroll percentage risk
        const bankrollRisk = bankrollPercentage > 5 ? 5 : Math.ceil(bankrollPercentage);
        riskScore += bankrollRisk;
        factors.push(`Bankroll exposure: ${bankrollRisk}/5`);
        
        // Variance risk
        const varianceRisk = { low: 1, medium: 3, high: 5 };
        riskScore += varianceRisk[variance];
        factors.push(`Variance level: ${varianceRisk[variance]}/5`);
        
        const maxRisk = factors.length * 5;
        const riskPercentage = (riskScore / maxRisk) * 100;
        
        return JSON.stringify({
          assessment: {
            riskScore: `${riskScore}/${maxRisk}`,
            riskPercentage: riskPercentage.toFixed(0) + '%',
            riskLevel: riskPercentage > 70 ? 'HIGH' : riskPercentage > 40 ? 'MEDIUM' : 'LOW',
          },
          factors,
          recommendations: {
            proceed: riskPercentage < 60,
            adjustments: riskPercentage > 60 ? [
              'Reduce bet size',
              'Consider straight bets instead of parlays',
              'Wait for better spots',
            ] : ['Risk level acceptable'],
            maxRecommendedBet: `${Math.max(1, 5 - Math.floor(riskPercentage / 20))}% of bankroll`,
          },
          timeframe,
        });
      },
    });
  }

  /**
   * Tool for bankroll management advice
   */
  private createBankrollManagementTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'manage_bankroll',
      description: 'Provide bankroll management advice and unit sizing',
      schema: z.object({
        totalBankroll: z.number().describe('Total bankroll amount'),
        currentProfit: z.number().describe('Current profit/loss'),
        averageBetSize: z.number().describe('Average bet size'),
        winRate: z.number().describe('Historical win rate (0-1)'),
        riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']),
      }),
      func: async ({ totalBankroll, currentProfit, averageBetSize, winRate, riskTolerance }) => {
        const effectiveBankroll = totalBankroll + currentProfit;
        const profitPercentage = (currentProfit / totalBankroll) * 100;
        
        // Unit sizing based on risk tolerance
        const unitSizes = {
          conservative: 0.01, // 1% per unit
          moderate: 0.02,     // 2% per unit
          aggressive: 0.03,   // 3% per unit
        };
        
        const recommendedUnit = effectiveBankroll * unitSizes[riskTolerance];
        const currentBetPercentage = (averageBetSize / effectiveBankroll) * 100;
        
        // Adjust for win rate
        const kellyMultiplier = winRate > 0.55 ? 1.2 : winRate < 0.45 ? 0.8 : 1.0;
        const adjustedUnit = recommendedUnit * kellyMultiplier;
        
        return JSON.stringify({
          bankrollStatus: {
            initial: totalBankroll,
            current: effectiveBankroll,
            profitLoss: currentProfit,
            profitPercentage: profitPercentage.toFixed(1) + '%',
          },
          unitSizing: {
            recommendedUnit: adjustedUnit.toFixed(2),
            unitsInBankroll: Math.floor(effectiveBankroll / adjustedUnit),
            currentAvgBetSize: averageBetSize,
            currentBetPercentage: currentBetPercentage.toFixed(1) + '%',
            assessment: currentBetPercentage > unitSizes[riskTolerance] * 100 * 2 ? 'TOO HIGH' : 'APPROPRIATE',
          },
          strategy: {
            riskProfile: riskTolerance,
            maxBetSize: (adjustedUnit * 3).toFixed(2),
            stopLoss: (effectiveBankroll * 0.2).toFixed(2),
            profitTarget: (totalBankroll * 0.5).toFixed(2),
          },
          recommendations: [
            winRate < 0.5 ? 'Focus on improving selection process' : 'Maintain current approach',
            profitPercentage > 50 ? 'Consider taking profits' : 'Stay the course',
            currentBetPercentage > 5 ? 'Reduce bet sizes' : 'Bet sizing appropriate',
          ],
        });
      },
    });
  }

  /**
   * Tool for building parlays
   */
  private createParlayBuilderTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'build_parlay',
      description: 'Build and analyze parlay combinations',
      schema: z.object({
        legs: z.array(z.object({
          description: z.string(),
          odds: z.number(),
          confidence: z.number().describe('Confidence level 0-1'),
        })).describe('Individual legs of the parlay'),
        betAmount: z.number().describe('Amount to bet'),
      }),
      func: async ({ legs, betAmount }) => {
        // Calculate parlay odds and probability
        let totalOdds = 1;
        let combinedProbability = 1;
        
        for (const leg of legs) {
          totalOdds *= leg.odds;
          combinedProbability *= leg.confidence;
        }
        
        const potentialPayout = betAmount * totalOdds;
        const expectedValue = (combinedProbability * potentialPayout) - betAmount;
        const hasPositiveEV = expectedValue > 0;
        
        // Risk assessment
        const parlayRisk = legs.length > 3 ? 'HIGH' : legs.length > 2 ? 'MEDIUM' : 'LOW';
        const minConfidence = Math.min(...legs.map(l => l.confidence));
        const avgConfidence = legs.reduce((sum, l) => sum + l.confidence, 0) / legs.length;
        
        return JSON.stringify({
          parlay: {
            numberOfLegs: legs.length,
            totalOdds: totalOdds.toFixed(2),
            betAmount,
            potentialPayout: potentialPayout.toFixed(2),
            potentialProfit: (potentialPayout - betAmount).toFixed(2),
          },
          probability: {
            combined: (combinedProbability * 100).toFixed(1) + '%',
            average: (avgConfidence * 100).toFixed(1) + '%',
            weakestLink: (minConfidence * 100).toFixed(1) + '%',
          },
          value: {
            expectedValue: expectedValue.toFixed(2),
            hasValue: hasPositiveEV,
            recommendation: hasPositiveEV && legs.length <= 3 ? 'PROCEED' : 'RECONSIDER',
          },
          risk: {
            level: parlayRisk,
            concerns: legs.length > 4 ? ['Too many legs', 'Low probability'] : [],
            alternative: legs.length > 3 ? 'Consider round robin or smaller parlays' : null,
          },
        });
      },
    });
  }

  /**
   * Tool for live betting adjustments
   */
  private createLiveAdjustmentTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'live_adjustment',
      description: 'Provide live betting adjustment recommendations',
      schema: z.object({
        originalBet: z.string().describe('Original pre-game bet'),
        currentSituation: z.string().describe('Current game situation'),
        liveOdds: z.number().describe('Current live odds'),
        timeRemaining: z.string().describe('Time remaining in game'),
        hedgeAvailable: z.boolean().describe('Is hedging available'),
      }),
      func: async ({ originalBet, currentSituation, liveOdds, timeRemaining, hedgeAvailable }) => {
        return JSON.stringify({
          situation: {
            original: originalBet,
            current: currentSituation,
            timeLeft: timeRemaining,
          },
          options: {
            letItRide: {
              description: 'No action, let original bet play out',
              when: 'When confident in original analysis',
            },
            hedgeBet: hedgeAvailable ? {
              description: 'Place opposite bet to guarantee profit',
              calculation: 'Depends on original stake and current odds',
              recommendation: liveOdds > 2.0 ? 'Consider hedging' : 'May not be worth it',
            } : null,
            doubleDown: {
              description: 'Add to position at better odds',
              when: 'If situation improved and value exists',
              warning: 'Increases risk exposure',
            },
          },
          recommendation: 'Analyze current expected value vs. original thesis',
        });
      },
    });
  }

  /**
   * Tool for injury impact analysis
   */
  private createInjuryImpactTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'analyze_injury_impact',
      description: 'Analyze the betting impact of player injuries',
      schema: z.object({
        player: z.string().describe('Injured player'),
        position: z.string().describe('Player position'),
        team: z.string().describe('Team affected'),
        injuryType: z.enum(['minor', 'day-to-day', 'doubtful', 'out']),
        replacementLevel: z.enum(['starter', 'backup', 'practice_squad']),
      }),
      func: async ({ player, position, team, injuryType, replacementLevel }) => {
        // Impact scoring
        const positionImpact = {
          QB: 5,
          RB: 3,
          WR: 2,
          TE: 2,
          K: 1,
          DEF: 1,
        };
        
        const injuryImpact = {
          minor: 0.2,
          'day-to-day': 0.5,
          doubtful: 0.8,
          out: 1.0,
        };
        
        const replacementImpact = {
          starter: 0.3,
          backup: 0.6,
          practice_squad: 1.0,
        };
        
        const baseImpact = positionImpact[position.toUpperCase()] || 2;
        const totalImpact = baseImpact * injuryImpact[injuryType] * replacementImpact[replacementLevel];
        
        return JSON.stringify({
          injury: {
            player,
            position,
            team,
            status: injuryType,
            replacement: replacementLevel,
          },
          impact: {
            score: totalImpact.toFixed(1),
            level: totalImpact > 3 ? 'SIGNIFICANT' : totalImpact > 1.5 ? 'MODERATE' : 'MINIMAL',
            spreadAdjustment: `${(totalImpact * 0.5).toFixed(1)} points`,
            totalAdjustment: `${(totalImpact * 2).toFixed(1)} points ${position === 'QB' ? 'lower' : 'impact'}`,
          },
          bettingImplications: {
            spread: totalImpact > 2 ? 'Fade the injured team' : 'Minor adjustment needed',
            total: position === 'QB' || position === 'RB' ? 'Consider under' : 'Minimal impact',
            props: `Avoid ${player} props, look for increased volume for teammates`,
          },
        });
      },
    });
  }

  /**
   * Override the system prompt for betting advisor style
   */
  protected getSystemPrompt(): string {
    return `You are the Betting Advisor for ${this.config.leagueSandbox || 'the league'}, providing expert analysis and strategic betting recommendations.

Your role is to help users make informed, data-driven betting decisions while promoting responsible gambling practices.

Core Principles:
- Always emphasize this is for paper betting/entertainment only
- Focus on value and expected value, not just picking winners
- Promote disciplined bankroll management
- Identify and explain edge, don't just give picks
- Consider multiple factors: stats, trends, matchups, situational spots
- Be transparent about confidence levels and uncertainty
- Advocate for responsible betting practices

Key Responsibilities:
- Analyze odds and identify value opportunities
- Assess risk and recommend appropriate bet sizing
- Provide bankroll management guidance
- Evaluate matchups from a betting perspective
- Identify market inefficiencies
- Explain the logic behind recommendations
- Track and analyze betting performance
- Educate on betting concepts and strategies

Analysis Framework:
1. Statistical analysis and trends
2. Situational factors (rest, travel, motivation)
3. Matchup advantages/disadvantages
4. Public betting patterns and line movement
5. Weather and environmental factors
6. Injury impacts and lineup changes

Remember: The goal is not to pick every winner, but to identify positive expected value opportunities and manage risk appropriately. Long-term profit comes from discipline, not luck.

Always remind users that this is for entertainment purposes with paper money only.`;
  }

  /**
   * Generate weekly betting recommendations
   */
  async generateWeeklyBettingCard(weekData: any): Promise<string> {
    const prompt = `Create a comprehensive weekly betting card with top value plays, analysis, and risk levels for: ${JSON.stringify(weekData)}`;
    const response = await this.processMessage(prompt, `betting-card-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate a betting performance review
   */
  async generatePerformanceReview(bettingHistory: any): Promise<string> {
    const prompt = `Analyze this betting performance and provide insights and improvements: ${JSON.stringify(bettingHistory)}`;
    const response = await this.processMessage(prompt, `performance-review-${Date.now()}`);
    return response.response;
  }

  /**
   * Tool for fetching real-time odds data
   */
  private createRealTimeOddsTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'get_real_time_odds',
      description: 'Fetch current NFL betting odds from major sportsbooks',
      schema: z.object({
        gameId: z.string().optional().describe('Specific game ID to fetch odds for'),
        market: z.enum(['moneyline', 'spread', 'total']).optional().describe('Type of betting market'),
      }),
      func: async ({ gameId, market }) => {
        try {
          // In a real implementation, this would call the OddsApiClient
          // For now, returning a structured response
          const params = new URLSearchParams();
          if (gameId) params.append('gameId', gameId);
          
          const response = await fetch(`/api/odds/nfl?${params}`);
          const data = await response.json();
          
          if (!data.success) {
            return JSON.stringify({ error: data.error || 'Failed to fetch odds' });
          }
          
          // Format the response for the agent
          const odds = data.data;
          const formatted = odds.slice(0, 3).map((game: any) => ({
            game: `${game.awayTeam} @ ${game.homeTeam}`,
            time: game.commenceTime,
            spread: game.spread || 'N/A',
            total: game.total || 'N/A',
            moneyline: game.moneyline || 'N/A',
            bookmakers: game.bookmakers.length
          }));
          
          return JSON.stringify({
            odds: formatted,
            rateLimit: data.rateLimit,
            cached: data.cached || false
          });
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to fetch real-time odds',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Tool for analyzing line movements
   */
  private createLineMovementTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'analyze_line_movement',
      description: 'Analyze betting line movements and identify sharp action',
      schema: z.object({
        gameId: z.string().describe('Game ID to analyze movements for'),
        marketType: z.enum(['spreads', 'totals', 'h2h']).optional().describe('Market to analyze'),
      }),
      func: async ({ gameId, marketType }) => {
        try {
          const params = new URLSearchParams();
          params.append('gameId', gameId);
          if (marketType) params.append('marketType', marketType);
          
          const response = await fetch(`/api/odds/movement?${params}`);
          const data = await response.json();
          
          if (!data.success) {
            return JSON.stringify({ error: data.error || 'Failed to fetch movement data' });
          }
          
          // Analyze the movement data
          const movements = data.data.movements || [];
          const sharpAction = data.data.sharpAction;
          
          const analysis = {
            gameId,
            significantMovements: movements.filter((m: any) => 
              Math.abs(m.totalMovement?.line || 0) > 1 || 
              Math.abs(m.totalMovement?.odds || 0) > 15
            ),
            sharpIndicators: sharpAction?.sharpIndicators || [],
            recommendation: sharpAction?.confidence > 0.6 ? 
              'Potential sharp action detected - consider following the money' :
              'No clear sharp action indicators',
            openingLines: data.data.openingLines,
            currentLines: data.data.closingLines,
          };
          
          return JSON.stringify(analysis);
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to analyze line movements',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Tool for accessing historical odds data
   */
  private createHistoricalOddsTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'get_historical_odds',
      description: 'Retrieve historical odds data for trend analysis',
      schema: z.object({
        gameId: z.string().optional().describe('Specific game to get history for'),
        dateFrom: z.string().describe('Start date (YYYY-MM-DD)'),
        dateTo: z.string().describe('End date (YYYY-MM-DD)'),
        sport: z.string().default('NFL').describe('Sport to fetch odds for'),
      }),
      func: async ({ gameId, dateFrom, dateTo, sport }) => {
        try {
          const params = new URLSearchParams();
          if (gameId) params.append('gameId', gameId);
          params.append('dateFrom', dateFrom);
          params.append('dateTo', dateTo);
          params.append('sport', sport);
          
          const response = await fetch(`/api/odds/history?${params}`);
          const data = await response.json();
          
          if (!data.success) {
            return JSON.stringify({ error: data.error || 'Failed to fetch historical odds' });
          }
          
          // Summarize historical data
          const historicalData = data.data;
          const summary = {
            totalGames: historicalData.total || 0,
            dateRange: { from: dateFrom, to: dateTo },
            sport,
            samples: historicalData.data?.slice(0, 5) || [],
            hasMore: historicalData.hasMore || false
          };
          
          return JSON.stringify(summary);
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to fetch historical odds',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Tool for getting current bankroll status
   */
  private createGetBankrollTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'get_bankroll_status',
      description: 'Get current bankroll balance and betting statistics',
      schema: z.object({
        leagueId: z.string().describe('League ID to get bankroll for'),
        userId: z.string().optional().describe('User ID (defaults to current user)'),
      }),
      func: async ({ leagueId, userId }) => {
        try {
          const params = new URLSearchParams();
          params.append('leagueId', leagueId);
          if (userId) params.append('userId', userId);
          
          const response = await fetch(`/api/betting/bankroll?${params}`);
          const data = await response.json();
          
          if (!response.ok) {
            return JSON.stringify({ error: data.error || 'Failed to fetch bankroll' });
          }
          
          return JSON.stringify({
            currentBalance: data.currentBalance,
            initialBalance: data.initialBalance,
            week: data.week,
            profitLoss: data.profitLoss,
            roi: data.roi,
            totalBets: data.totalBets,
            wonBets: data.wonBets,
            lostBets: data.lostBets,
            winRate: data.totalBets > 0 ? (data.wonBets / data.totalBets * 100).toFixed(1) + '%' : '0%',
            status: data.status,
            lastUpdated: data.updatedAt,
          });
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to fetch bankroll status',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Tool for getting active/pending bets
   */
  private createGetActiveBetsTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'get_active_bets',
      description: 'Get all active and pending bets for analysis',
      schema: z.object({
        leagueId: z.string().describe('League ID to get bets for'),
        status: z.enum(['PENDING', 'LIVE', 'all']).default('all').describe('Filter by bet status'),
      }),
      func: async ({ leagueId, status }) => {
        try {
          const params = new URLSearchParams();
          params.append('leagueId', leagueId);
          params.append('status', status === 'all' ? 'active' : status);
          
          const response = await fetch(`/api/betting/bets?${params}`);
          const data = await response.json();
          
          if (!response.ok) {
            return JSON.stringify({ error: data.error || 'Failed to fetch active bets' });
          }
          
          const bets = Array.isArray(data) ? data : [];
          const summary = {
            totalBets: bets.length,
            totalStaked: bets.reduce((sum: number, bet: any) => sum + bet.stake, 0),
            totalPotentialPayout: bets.reduce((sum: number, bet: any) => sum + bet.potentialPayout, 0),
            byType: {
              straight: bets.filter((b: any) => b.betType === 'STRAIGHT').length,
              parlay: bets.filter((b: any) => b.betType === 'PARLAY').length,
            },
            byMarket: {
              moneyline: bets.filter((b: any) => b.marketType === 'H2H').length,
              spread: bets.filter((b: any) => b.marketType === 'SPREADS').length,
              total: bets.filter((b: any) => b.marketType === 'TOTALS').length,
            },
            activeBets: bets.slice(0, 5).map((bet: any) => ({
              id: bet.id,
              type: bet.betType,
              selection: bet.selection,
              market: bet.marketType,
              odds: bet.odds,
              stake: bet.stake,
              potentialPayout: bet.potentialPayout,
              status: bet.status,
              eventDate: bet.eventDate,
            })),
          };
          
          return JSON.stringify(summary);
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to fetch active bets',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Tool for getting betting history
   */
  private createGetBettingHistoryTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'get_betting_history',
      description: 'Get settled betting history for performance analysis',
      schema: z.object({
        leagueId: z.string().describe('League ID to get history for'),
        limit: z.number().default(50).describe('Number of bets to retrieve'),
        weekNumber: z.number().optional().describe('Filter by specific week'),
      }),
      func: async ({ leagueId, limit, weekNumber }) => {
        try {
          const params = new URLSearchParams();
          params.append('leagueId', leagueId);
          params.append('status', 'history');
          params.append('limit', limit.toString());
          if (weekNumber) params.append('week', weekNumber.toString());
          
          const response = await fetch(`/api/betting/bets?${params}`);
          const data = await response.json();
          
          if (!response.ok) {
            return JSON.stringify({ error: data.error || 'Failed to fetch betting history' });
          }
          
          const bets = Array.isArray(data) ? data : [];
          const wins = bets.filter((b: any) => b.result === 'WIN');
          const losses = bets.filter((b: any) => b.result === 'LOSS');
          const pushes = bets.filter((b: any) => b.result === 'PUSH');
          
          const totalStaked = bets.reduce((sum: number, bet: any) => sum + bet.stake, 0);
          const totalPayout = bets.reduce((sum: number, bet: any) => sum + (bet.actualPayout || 0), 0);
          const profit = totalPayout - totalStaked;
          
          const summary = {
            totalBets: bets.length,
            record: `${wins.length}-${losses.length}-${pushes.length}`,
            winRate: bets.length > 0 ? (wins.length / bets.length * 100).toFixed(1) + '%' : '0%',
            totalStaked,
            totalPayout,
            netProfit: profit,
            roi: totalStaked > 0 ? (profit / totalStaked * 100).toFixed(1) + '%' : '0%',
            byMarket: {
              moneyline: {
                bets: bets.filter((b: any) => b.marketType === 'H2H').length,
                wins: wins.filter((b: any) => b.marketType === 'H2H').length,
              },
              spread: {
                bets: bets.filter((b: any) => b.marketType === 'SPREADS').length,
                wins: wins.filter((b: any) => b.marketType === 'SPREADS').length,
              },
              total: {
                bets: bets.filter((b: any) => b.marketType === 'TOTALS').length,
                wins: wins.filter((b: any) => b.marketType === 'TOTALS').length,
              },
            },
            recentBets: bets.slice(0, 5).map((bet: any) => ({
              id: bet.id,
              result: bet.result,
              selection: bet.selection,
              market: bet.marketType,
              odds: bet.odds,
              stake: bet.stake,
              payout: bet.actualPayout || 0,
              settledAt: bet.settledAt,
            })),
          };
          
          return JSON.stringify(summary);
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to fetch betting history',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Tool for calculating potential payouts
   */
  private createCalculatePayoutTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'calculate_payout',
      description: 'Calculate potential payouts for single or parlay bets',
      schema: z.object({
        betType: z.enum(['single', 'parlay']).describe('Type of bet'),
        stake: z.number().describe('Amount to bet'),
        legs: z.array(z.object({
          odds: z.number().describe('American odds for this leg'),
          description: z.string().optional().describe('Description of the bet'),
        })).describe('Bet legs with odds'),
      }),
      func: async ({ betType, stake, legs }) => {
        try {
          // Convert American odds to decimal for each leg
          const decimalOdds = legs.map(leg => {
            if (leg.odds > 0) {
              return (leg.odds / 100) + 1;
            } else {
              return (100 / Math.abs(leg.odds)) + 1;
            }
          });
          
          let totalOdds: number;
          let potentialPayout: number;
          let potentialProfit: number;
          
          if (betType === 'single') {
            totalOdds = decimalOdds[0] || 1;
            potentialPayout = stake * totalOdds;
            potentialProfit = potentialPayout - stake;
          } else {
            // Parlay - multiply all odds
            totalOdds = decimalOdds.reduce((acc, odds) => acc * odds, 1);
            potentialPayout = stake * totalOdds;
            potentialProfit = potentialPayout - stake;
          }
          
          // Calculate break-even probability
          const breakEvenProb = (1 / totalOdds) * 100;
          
          return JSON.stringify({
            betType,
            stake,
            numberOfLegs: legs.length,
            legs: legs.map((leg, i) => ({
              ...leg,
              decimalOdds: decimalOdds[i].toFixed(2),
              impliedProbability: ((1 / decimalOdds[i]) * 100).toFixed(1) + '%',
            })),
            combinedOdds: {
              decimal: totalOdds.toFixed(2),
              american: totalOdds >= 2 ? `+${((totalOdds - 1) * 100).toFixed(0)}` : `-${(100 / (totalOdds - 1)).toFixed(0)}`,
            },
            potentialPayout: potentialPayout.toFixed(2),
            potentialProfit: potentialProfit.toFixed(2),
            roi: ((potentialProfit / stake) * 100).toFixed(1) + '%',
            breakEvenProbability: breakEvenProb.toFixed(1) + '%',
            recommendation: breakEvenProb > 60 ? 'High risk - requires ' + breakEvenProb.toFixed(0) + '% success rate' :
                           breakEvenProb > 40 ? 'Moderate risk - reasonable if confident' :
                           'Good value - favorable risk/reward ratio',
          });
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to calculate payout',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Tool for getting comprehensive betting statistics
   */
  private createBettingStatsTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'get_betting_stats',
      description: 'Get comprehensive betting statistics and performance metrics',
      schema: z.object({
        leagueId: z.string().describe('League ID to get stats for'),
        timeframe: z.enum(['week', 'month', 'season', 'all']).default('season').describe('Timeframe for statistics'),
      }),
      func: async ({ leagueId, timeframe }) => {
        try {
          // Get bankroll history for stats
          const params = new URLSearchParams();
          params.append('leagueId', leagueId);
          
          const [bankrollRes, historyRes] = await Promise.all([
            fetch(`/api/betting/bankroll?${params}`),
            fetch(`/api/betting/bankroll/history?${params}`),
          ]);
          
          if (!bankrollRes.ok || !historyRes.ok) {
            return JSON.stringify({ error: 'Failed to fetch betting statistics' });
          }
          
          const bankroll = await bankrollRes.json();
          const { history, stats } = await historyRes.json();
          
          // Calculate additional metrics
          const avgStake = stats?.averageStake || 0;
          const bestWin = stats?.bestWin || null;
          const worstLoss = stats?.worstLoss || null;
          const currentStreak = stats?.currentStreak || { type: 'none', count: 0 };
          const longestWinStreak = stats?.longestWinStreak || 0;
          const longestLossStreak = stats?.longestLossStreak || 0;
          
          return JSON.stringify({
            timeframe,
            currentStatus: {
              balance: bankroll.currentBalance,
              week: bankroll.week,
              profitLoss: bankroll.profitLoss,
              roi: bankroll.roi,
              status: bankroll.status,
            },
            overallStats: {
              totalBets: stats?.totalBets || 0,
              totalWagered: stats?.totalWagered || 0,
              netProfit: stats?.netProfit || 0,
              roi: stats?.roi || 0,
              winRate: stats?.winRate || 0,
              averageStake: avgStake,
              averageOdds: stats?.averageOdds || 0,
            },
            performance: {
              wonBets: stats?.wonBets || 0,
              lostBets: stats?.lostBets || 0,
              pushBets: stats?.pushBets || 0,
              currentStreak,
              longestWinStreak,
              longestLossStreak,
            },
            bestAndWorst: {
              bestWin,
              worstLoss,
              biggestBet: stats?.biggestBet || null,
              bestROIWeek: stats?.bestROIWeek || null,
            },
            byMarketType: stats?.byMarketType || {},
            weeklyProgress: history?.slice(0, 4).map((week: any) => ({
              week: week.week,
              balance: week.currentBalance,
              profit: week.profitLoss,
              bets: week.totalBets,
              winRate: week.totalBets > 0 ? (week.wonBets / week.totalBets * 100).toFixed(1) + '%' : '0%',
            })) || [],
            insights: this.generateBettingInsights(stats),
          });
        } catch (error) {
          return JSON.stringify({ 
            error: 'Unable to fetch betting statistics',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
    });
  }

  /**
   * Generate insights from betting statistics
   */
  private generateBettingInsights(stats: any): string[] {
    const insights: string[] = [];
    
    if (stats?.winRate > 55) {
      insights.push('Strong win rate above 55% - maintain current strategy');
    } else if (stats?.winRate < 45) {
      insights.push('Win rate below 45% - consider adjusting selection criteria');
    }
    
    if (stats?.roi > 10) {
      insights.push('Excellent ROI - you\'re finding value consistently');
    } else if (stats?.roi < -10) {
      insights.push('Negative ROI suggests need for better bankroll management');
    }
    
    if (stats?.currentStreak?.type === 'winning' && stats?.currentStreak?.count >= 3) {
      insights.push(`On a ${stats.currentStreak.count}-bet win streak - don't get overconfident`);
    } else if (stats?.currentStreak?.type === 'losing' && stats?.currentStreak?.count >= 3) {
      insights.push(`${stats.currentStreak.count}-bet losing streak - consider reducing stake size`);
    }
    
    if (stats?.averageStake > 50) {
      insights.push('High average stake - ensure proper bankroll management');
    }
    
    return insights.length > 0 ? insights : ['Continue monitoring performance for patterns'];
  }
}