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
}