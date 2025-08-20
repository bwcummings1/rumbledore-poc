/**
 * League Oracle Agent
 * 
 * The mystical predictor of fantasy futures, combining data analysis with
 * intuitive insights to forecast outcomes and reveal what lies ahead.
 */

import { BaseAgent, AgentConfig } from '../base-agent';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { createToolsForAgentType } from '../tools';
import { AgentType } from '@prisma/client';
import { z } from 'zod';

export class LeagueOracleAgent extends BaseAgent {
  constructor(leagueSandbox?: string) {
    const config: AgentConfig = {
      id: `oracle-${leagueSandbox || 'global'}`,
      type: AgentType.ANALYST, // Using ANALYST as proxy for ORACLE
      leagueSandbox,
      personality: {
        traits: [
          'mysterious',
          'insightful',
          'prophetic',
          'analytical',
          'confident',
          'enigmatic',
          'wise',
        ],
        tone: 'mystical yet grounded in data, like a sage who speaks in probabilities',
        expertise: [
          'predictive analytics',
          'trend forecasting',
          'pattern recognition',
          'probability assessment',
          'scenario planning',
          'outcome modeling',
          'risk prediction',
          'performance projection',
          'championship forecasting',
          'upset prediction',
        ],
        catchphrases: [
          'The patterns in the data reveal...',
          'I foresee three possible futures...',
          'The winds of change blow toward...',
          'My calculations show a 73.6% probability that...',
          'The fantasy gods whisper of...',
          'In the convergence of trends, I see...',
          'The data streams converge to show...',
          'Mark my words, before the season ends...',
        ],
        humor: 'light',
      },
      temperature: 0.6, // Balanced for creative but grounded predictions
      maxTokens: 2500,
    };
    
    super(config);
  }

  /**
   * Create Oracle-specific tools
   */
  protected async createTools(): Promise<(DynamicTool | DynamicStructuredTool)[]> {
    const standardTools = createToolsForAgentType('ANALYST', this.config.leagueSandbox);
    
    const oracleTools = [
      this.createMatchupPredictionTool(),
      this.createSeasonProjectionTool(),
      this.createUpsetAlertTool(),
      this.createTrendForecastTool(),
      this.createChampionshipOddsTool(),
      this.createBreakoutPredictionTool(),
      this.createScenarioAnalysisTool(),
    ];
    
    return [...standardTools, ...oracleTools];
  }

  /**
   * Tool for matchup predictions
   */
  private createMatchupPredictionTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'predict_matchup',
      description: 'Predict the outcome of a matchup with confidence levels',
      schema: z.object({
        team1: z.string().describe('First team'),
        team2: z.string().describe('Second team'),
        factors: z.array(z.string()).describe('Key factors influencing the matchup'),
        week: z.number().describe('Week number'),
        includeScenarios: z.boolean().default(true),
      }),
      func: async ({ team1, team2, factors, week, includeScenarios }) => {
        // Simulate prediction calculations
        const team1Probability = 0.45 + Math.random() * 0.3; // 45-75%
        const team2Probability = 1 - team1Probability;
        const marginOfVictory = Math.floor(Math.random() * 30) + 5;
        const confidence = Math.min(Math.max(Math.abs(team1Probability - 0.5) * 2, 0.3), 0.9);
        
        const scenarios = includeScenarios ? [
          {
            scenario: 'Most Likely',
            description: `${team1Probability > 0.5 ? team1 : team2} wins by ${marginOfVictory}`,
            probability: 0.45,
          },
          {
            scenario: 'Blowout',
            description: `${team1Probability > 0.5 ? team1 : team2} dominates by 30+`,
            probability: 0.15,
          },
          {
            scenario: 'Nail-biter',
            description: 'Decided by less than 5 points',
            probability: 0.25,
          },
          {
            scenario: 'Upset Special',
            description: `${team1Probability < 0.5 ? team1 : team2} pulls off the upset`,
            probability: 0.15,
          },
        ] : null;
        
        return JSON.stringify({
          prediction: {
            winner: team1Probability > team2Probability ? team1 : team2,
            loser: team1Probability > team2Probability ? team2 : team1,
            margin: marginOfVictory,
            confidence: (confidence * 100).toFixed(0) + '%',
          },
          probabilities: {
            [team1]: (team1Probability * 100).toFixed(1) + '%',
            [team2]: (team2Probability * 100).toFixed(1) + '%',
          },
          keyFactors: factors,
          scenarios,
          insight: `The stars align for ${team1Probability > team2Probability ? team1 : team2}, but ${factors[0]} could change everything`,
        });
      },
    });
  }

  /**
   * Tool for season projections
   */
  private createSeasonProjectionTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'project_season',
      description: 'Project season outcomes for teams or the league',
      schema: z.object({
        team: z.string().optional().describe('Specific team to project'),
        currentWeek: z.number().describe('Current week of season'),
        totalWeeks: z.number().default(14).describe('Total regular season weeks'),
        currentRecord: z.object({
          wins: z.number(),
          losses: z.number(),
        }).optional(),
      }),
      func: async ({ team, currentWeek, totalWeeks, currentRecord }) => {
        const remainingWeeks = totalWeeks - currentWeek;
        const projectedWins = currentRecord 
          ? currentRecord.wins + Math.floor(remainingWeeks * 0.5 + Math.random() * 3)
          : Math.floor(totalWeeks * 0.5 + Math.random() * 3);
        
        const projectedLosses = totalWeeks - projectedWins;
        const playoffProbability = projectedWins > 7 ? 0.7 + Math.random() * 0.3 : 0.1 + Math.random() * 0.4;
        const championshipProbability = playoffProbability * (0.1 + Math.random() * 0.2);
        
        return JSON.stringify({
          projection: {
            team: team || 'League Average',
            finalRecord: `${projectedWins}-${projectedLosses}`,
            currentRecord: currentRecord ? `${currentRecord.wins}-${currentRecord.losses}` : 'N/A',
            remainingGames: remainingWeeks,
            projectedPointsFor: 1600 + Math.random() * 400,
            projectedPointsAgainst: 1550 + Math.random() * 400,
          },
          probabilities: {
            makePlayoffs: (playoffProbability * 100).toFixed(1) + '%',
            winDivision: ((playoffProbability * 0.5) * 100).toFixed(1) + '%',
            winChampionship: (championshipProbability * 100).toFixed(1) + '%',
            lastPlace: projectedWins < 5 ? '15%' : '<5%',
          },
          trajectory: projectedWins > (currentRecord?.wins || 0) * (totalWeeks / currentWeek) ? 'Ascending' : 'Descending',
          criticalFactors: [
            'Remaining schedule strength',
            'Key player health',
            'Trade deadline moves',
          ],
        });
      },
    });
  }

  /**
   * Tool for upset alerts
   */
  private createUpsetAlertTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'detect_upset_potential',
      description: 'Identify potential upsets in upcoming matchups',
      schema: z.object({
        matchups: z.array(z.object({
          favorite: z.string(),
          underdog: z.string(),
          spread: z.number(),
        })).describe('Matchups to analyze'),
        threshold: z.number().default(0.35).describe('Minimum upset probability to flag'),
      }),
      func: async ({ matchups, threshold }) => {
        const upsetAlerts = matchups.map(matchup => {
          // Calculate upset probability based on various factors
          const baseUpsetChance = 0.25;
          const spreadFactor = Math.max(0, (10 - matchup.spread) / 20);
          const randomFactor = Math.random() * 0.3;
          const upsetProbability = Math.min(baseUpsetChance + spreadFactor + randomFactor, 0.65);
          
          return {
            matchup: `${matchup.underdog} vs ${matchup.favorite}`,
            upsetProbability,
            spread: matchup.spread,
            flagged: upsetProbability >= threshold,
            factors: upsetProbability >= threshold ? [
              'Favorable matchup dynamics',
              'Recent momentum shift',
              'Key player returning',
              'Historical upset pattern',
            ] : [],
          };
        }).filter(alert => alert.flagged);
        
        return JSON.stringify({
          upsetAlerts,
          totalFlagged: upsetAlerts.length,
          highestRisk: upsetAlerts.sort((a, b) => b.upsetProbability - a.upsetProbability)[0],
          oracleWarning: upsetAlerts.length > 2 ? 'Multiple upsets brewing this week!' : 'Standard week expected',
          confidence: 'Medium-High',
        });
      },
    });
  }

  /**
   * Tool for trend forecasting
   */
  private createTrendForecastTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'forecast_trend',
      description: 'Forecast performance trends for teams or players',
      schema: z.object({
        subject: z.string().describe('Team or player to forecast'),
        dataPoints: z.array(z.number()).describe('Recent performance data points'),
        horizon: z.number().default(4).describe('Weeks to forecast ahead'),
        factors: z.array(z.string()).optional().describe('External factors to consider'),
      }),
      func: async ({ subject, dataPoints, horizon, factors }) => {
        // Simple trend calculation
        const recentAvg = dataPoints.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const overallAvg = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
        const trend = recentAvg > overallAvg ? 'upward' : recentAvg < overallAvg ? 'downward' : 'stable';
        
        // Generate forecast
        const forecast = Array.from({ length: horizon }, (_, i) => {
          const trendFactor = trend === 'upward' ? 1.05 : trend === 'downward' ? 0.95 : 1.0;
          const randomVariance = 0.9 + Math.random() * 0.2;
          return recentAvg * Math.pow(trendFactor, i + 1) * randomVariance;
        });
        
        return JSON.stringify({
          subject,
          analysis: {
            recentPerformance: recentAvg.toFixed(1),
            historicalAverage: overallAvg.toFixed(1),
            trend,
            momentum: trend === 'upward' ? 'Building' : trend === 'downward' ? 'Fading' : 'Neutral',
          },
          forecast: forecast.map((val, i) => ({
            week: `Week +${i + 1}`,
            projected: val.toFixed(1),
            confidence: (90 - i * 10) + '%',
          })),
          factors: factors || ['Recent form', 'Schedule difficulty', 'Health status'],
          verdict: `${subject} is ${trend === 'upward' ? 'ascending toward peak performance' : trend === 'downward' ? 'due for a bounce-back' : 'maintaining steady state'}`,
        });
      },
    });
  }

  /**
   * Tool for championship odds
   */
  private createChampionshipOddsTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'calculate_championship_odds',
      description: 'Calculate championship odds for all playoff contenders',
      schema: z.object({
        contenders: z.array(z.object({
          team: z.string(),
          record: z.string(),
          pointsFor: z.number(),
          recentForm: z.enum(['hot', 'warm', 'cold']),
        })).describe('Playoff contenders'),
        weeksUntilPlayoffs: z.number(),
      }),
      func: async ({ contenders, weeksUntilPlayoffs }) => {
        // Calculate odds for each contender
        const odds = contenders.map(team => {
          const recordBonus = parseInt(team.record.split('-')[0]) * 0.02;
          const pointsBonus = team.pointsFor / 10000;
          const formBonus = team.recentForm === 'hot' ? 0.15 : team.recentForm === 'warm' ? 0.05 : -0.05;
          const baseOdds = 1 / contenders.length;
          
          const finalOdds = Math.min(Math.max(baseOdds + recordBonus + pointsBonus + formBonus, 0.05), 0.45);
          
          return {
            team: team.team,
            championshipOdds: (finalOdds * 100).toFixed(1) + '%',
            playoffSeed: Math.ceil(Math.random() * contenders.length),
            momentum: team.recentForm,
            keyToVictory: finalOdds > 0.2 ? 'Maintain current form' : 'Need key improvements',
          };
        }).sort((a, b) => parseFloat(b.championshipOdds) - parseFloat(a.championshipOdds));
        
        return JSON.stringify({
          championshipOdds: odds,
          favorite: odds[0],
          darkHorse: odds[Math.floor(odds.length / 2)],
          analysis: {
            competitiveness: 'High parity - anyone can win',
            weeksRemaining: weeksUntilPlayoffs,
            volatility: weeksUntilPlayoffs > 2 ? 'High - much can change' : 'Low - patterns are set',
          },
          oraclePrediction: `The championship will be decided by ${['a last-minute lineup decision', 'an unexpected injury', 'a waiver wire gem'][Math.floor(Math.random() * 3)]}`,
        });
      },
    });
  }

  /**
   * Tool for breakout predictions
   */
  private createBreakoutPredictionTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'predict_breakout',
      description: 'Predict breakout performances for players or teams',
      schema: z.object({
        candidates: z.array(z.string()).describe('Potential breakout candidates'),
        timeframe: z.string().describe('When the breakout might occur'),
        category: z.enum(['player', 'team', 'strategy']),
      }),
      func: async ({ candidates, timeframe, category }) => {
        const predictions = candidates.map(candidate => ({
          name: candidate,
          breakoutProbability: (0.2 + Math.random() * 0.6),
          timing: timeframe,
          catalysts: [
            'Opportunity increase',
            'Matchup advantages',
            'System changes',
            'Health improvements',
          ].slice(0, Math.floor(Math.random() * 3) + 2),
          projectedImpact: ['High', 'Medium', 'Game-changing'][Math.floor(Math.random() * 3)],
        })).sort((a, b) => b.breakoutProbability - a.breakoutProbability);
        
        return JSON.stringify({
          breakoutPredictions: predictions.slice(0, 3),
          category,
          timeframe,
          confidence: 'The patterns are clear to those who can see',
          topPick: {
            name: predictions[0].name,
            probability: (predictions[0].breakoutProbability * 100).toFixed(0) + '%',
            reasoning: `All signs point to ${predictions[0].name} making a significant leap`,
          },
          warning: 'With great breakout potential comes great variance risk',
        });
      },
    });
  }

  /**
   * Tool for scenario analysis
   */
  private createScenarioAnalysisTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'analyze_scenarios',
      description: 'Analyze multiple future scenarios and their probabilities',
      schema: z.object({
        situation: z.string().describe('Current situation to analyze'),
        variables: z.array(z.string()).describe('Key variables that could change'),
        timeHorizon: z.string().describe('Time horizon for scenarios'),
      }),
      func: async ({ situation, variables, timeHorizon }) => {
        const scenarios = [
          {
            name: 'Best Case',
            probability: 0.2,
            description: `All ${variables.length} variables break favorably`,
            outcome: 'Championship victory',
            keyRequirements: variables.map(v => `${v} must go perfectly`),
          },
          {
            name: 'Most Likely',
            probability: 0.5,
            description: 'Mixed results across variables',
            outcome: 'Playoff appearance, competitive showing',
            keyRequirements: ['Maintain current trajectory', 'Avoid major setbacks'],
          },
          {
            name: 'Worst Case',
            probability: 0.15,
            description: 'Multiple negative outcomes converge',
            outcome: 'Miss playoffs, rebuild needed',
            keyRequirements: ['Immediate corrective action required'],
          },
          {
            name: 'Chaos',
            probability: 0.15,
            description: 'Unexpected events reshape everything',
            outcome: 'Completely unpredictable',
            keyRequirements: ['Adaptability will be key'],
          },
        ];
        
        return JSON.stringify({
          currentSituation: situation,
          timeHorizon,
          scenarios,
          variables,
          recommendation: 'Prepare for the most likely while hedging against the worst',
          oracleInsight: `The threads of fate are tangled, but ${scenarios[1].name} scenario emerges strongest`,
          criticalDecisionPoint: `Within ${timeHorizon}, a crucial choice about ${variables[0]} will determine the path`,
        });
      },
    });
  }

  /**
   * Override the system prompt for oracle style
   */
  protected getSystemPrompt(): string {
    return `You are the League Oracle for ${this.config.leagueSandbox || 'the league'}, a mystical seer who combines data analysis with intuitive insights to predict the future.

Your role is to forecast outcomes, identify patterns, and reveal what lies ahead for teams and managers in their fantasy football journey.

Oracle Principles:
- Blend statistical analysis with mystical presentation
- Speak with confidence but acknowledge uncertainty
- Provide specific probabilities and predictions
- Identify patterns others might miss
- Warn of potential upsets and surprises
- See multiple possible futures and their likelihoods
- Connect current events to future outcomes

Key Responsibilities:
- Predict matchup outcomes with confidence levels
- Project season trajectories and playoff probabilities  
- Identify upset potential and dark horse candidates
- Forecast performance trends and breakout players
- Calculate championship odds and paths to victory
- Provide scenario analysis for critical decisions
- Warn of impending dangers and opportunities
- Reveal hidden patterns in the data

Communication Style:
- Mystical but grounded in data - "The numbers reveal..."
- Use probability ranges rather than absolutes
- Create suspense while delivering insights
- Acknowledge when the future is unclear
- Provide multiple scenarios when appropriate
- Use metaphors of fate, destiny, and fortune
- Balance mystery with actionable advice

Prediction Framework:
- Always provide confidence levels (Low/Medium/High)
- Include probability percentages when possible
- Identify key factors that could change outcomes
- Offer both most likely and alternative scenarios
- Update predictions as new data emerges

Remember: You see patterns where others see chaos, futures where others see uncertainty. Your gift is making the complex probabilities of fantasy football feel like destiny unfolding.`;
  }

  /**
   * Generate weekly predictions
   */
  async generateWeeklyPredictions(weekData: any): Promise<string> {
    const prompt = `Generate comprehensive weekly predictions for all matchups and key storylines: ${JSON.stringify(weekData)}`;
    const response = await this.processMessage(prompt, `weekly-predictions-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate playoff forecast
   */
  async generatePlayoffForecast(standingsData: any): Promise<string> {
    const prompt = `Create a detailed playoff forecast with probabilities and scenarios: ${JSON.stringify(standingsData)}`;
    const response = await this.processMessage(prompt, `playoff-forecast-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate season prophecy
   */
  async generateSeasonProphecy(leagueData: any): Promise<string> {
    const prompt = `Create a mystical season prophecy with specific predictions and warnings: ${JSON.stringify(leagueData)}`;
    const response = await this.processMessage(prompt, `season-prophecy-${Date.now()}`);
    return response.response;
  }
}