/**
 * Commissioner Agent
 * 
 * The authoritative voice of the league, providing official updates,
 * rule clarifications, and maintaining order in the fantasy realm.
 */

import { BaseAgent, AgentConfig } from '../base-agent';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { createToolsForAgentType } from '../tools';
import { AgentType } from '@prisma/client';

export class CommissionerAgent extends BaseAgent {
  constructor(leagueSandbox?: string) {
    const config: AgentConfig = {
      id: `commissioner-${leagueSandbox || 'global'}`,
      type: AgentType.COMMISSIONER,
      leagueSandbox,
      personality: {
        traits: [
          'authoritative',
          'fair',
          'knowledgeable',
          'diplomatic',
          'decisive',
        ],
        tone: 'professional yet engaging',
        expertise: [
          'league rules and regulations',
          'dispute resolution',
          'trade evaluation',
          'competitive balance',
          'league history and traditions',
        ],
        catchphrases: [
          'By the power vested in me as Commissioner...',
          'In the interest of competitive balance...',
          'The league has spoken...',
          'As guardian of this fantasy realm...',
        ],
        humor: 'light',
      },
      temperature: 0.6, // Slightly lower for more consistent, authoritative responses
      maxTokens: 2500,
    };
    
    super(config);
  }

  /**
   * Create Commissioner-specific tools
   */
  protected async createTools(): Promise<(DynamicTool | DynamicStructuredTool)[]> {
    // Get standard tools for Commissioner
    const standardTools = createToolsForAgentType('COMMISSIONER', this.config.leagueSandbox);
    
    // Add Commissioner-specific tools
    const commissionerTools = [
      this.createRulingTool(),
      this.createTradeEvaluationTool(),
      this.createAnnouncementTool(),
    ];
    
    return [...standardTools, ...commissionerTools];
  }

  /**
   * Tool for making official rulings
   */
  private createRulingTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'make_ruling',
      description: 'Make an official ruling on a league matter or dispute',
      schema: z.object({
        issue: z.string().describe('The issue or dispute to rule on'),
        parties: z.array(z.string()).describe('Teams or managers involved'),
        ruling: z.string().describe('The official ruling'),
        rationale: z.string().describe('Reasoning behind the ruling'),
      }),
      func: async ({ issue, parties, ruling, rationale }) => {
        // Format the official ruling
        const officialRuling = {
          timestamp: new Date().toISOString(),
          issue,
          partiesInvolved: parties,
          ruling,
          rationale,
          status: 'FINAL',
        };
        
        // Store in memory for future reference
        await this.memory.store({
          content: `Official Ruling: ${issue}\nParties: ${parties.join(', ')}\nDecision: ${ruling}\nRationale: ${rationale}`,
          metadata: {
            type: 'ruling',
            ...officialRuling,
          },
          importance: 0.9, // Rulings are very important
        });
        
        return JSON.stringify(officialRuling);
      },
    });
  }

  /**
   * Tool for evaluating trades
   */
  private createTradeEvaluationTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'evaluate_trade',
      description: 'Evaluate the fairness and impact of a proposed trade',
      schema: z.object({
        team1: z.string().describe('First team in the trade'),
        team1Gives: z.array(z.string()).describe('Players team 1 is trading away'),
        team2: z.string().describe('Second team in the trade'),
        team2Gives: z.array(z.string()).describe('Players team 2 is trading away'),
      }),
      func: async ({ team1, team1Gives, team2, team2Gives }) => {
        // Mock trade evaluation logic
        // In production, this would analyze player values, team needs, etc.
        
        const evaluation = {
          team1: {
            name: team1,
            giving: team1Gives,
            valueGiven: team1Gives.length * 50, // Simplified value calculation
          },
          team2: {
            name: team2,
            giving: team2Gives,
            valueGiven: team2Gives.length * 50,
          },
          fairnessScore: 0.85 + Math.random() * 0.15, // 85-100% fairness
          recommendation: 'APPROVED',
          notes: 'Trade appears balanced and benefits both teams',
        };
        
        // Store trade evaluation
        await this.memory.store({
          content: `Trade Evaluation: ${team1} trades ${team1Gives.join(', ')} for ${team2}'s ${team2Gives.join(', ')}`,
          metadata: {
            type: 'trade_evaluation',
            ...evaluation,
          },
          importance: 0.7,
        });
        
        return JSON.stringify(evaluation);
      },
    });
  }

  /**
   * Tool for making league announcements
   */
  private createAnnouncementTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'make_announcement',
      description: 'Create an official league announcement',
      schema: z.object({
        title: z.string().describe('Announcement title'),
        content: z.string().describe('Announcement content'),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('Priority level'),
      }),
      func: async ({ title, content, priority }) => {
        const announcement = {
          id: `announcement-${Date.now()}`,
          title,
          content,
          priority,
          timestamp: new Date().toISOString(),
          from: 'The Commissioner',
        };
        
        // Store announcement
        await this.memory.store({
          content: `Announcement: ${title}\n${content}`,
          metadata: {
            type: 'announcement',
            ...announcement,
          },
          importance: priority === 'urgent' ? 1.0 : priority === 'high' ? 0.8 : 0.6,
        });
        
        return JSON.stringify(announcement);
      },
    });
  }

  /**
   * Override system prompt for Commissioner-specific behavior
   */
  protected getSystemPrompt(): string {
    const basePrompt = super.getSystemPrompt();
    
    return `${basePrompt}

COMMISSIONER-SPECIFIC GUIDELINES:

1. AUTHORITY & FAIRNESS:
   - You are the final authority on all league matters
   - Always be impartial and consider all perspectives
   - Base decisions on league rules and precedent
   - Maintain competitive balance as your primary concern

2. COMMUNICATION STYLE:
   - Begin important announcements with your catchphrases
   - Use formal language for rulings and official matters
   - Be approachable but maintain professional distance
   - Add occasional humor to keep things engaging

3. KEY RESPONSIBILITIES:
   - Resolve disputes fairly and quickly
   - Evaluate trades for collusion and fairness
   - Make announcements about league events
   - Maintain league traditions and culture
   - Ensure all managers follow the rules

4. DECISION FRAMEWORK:
   - Consider league history and precedent
   - Evaluate impact on competitive balance
   - Ensure consistency in rulings
   - Document important decisions for future reference

5. INTERACTION APPROACH:
   - Address managers respectfully by team name
   - Acknowledge the stakes and emotions involved
   - Provide clear rationale for all decisions
   - Encourage healthy competition and sportsmanship

Remember: You are not just an administrator, but the guardian of the league's integrity and the architect of its legendary moments.`;
  }

  /**
   * Handle Commissioner-specific commands
   */
  async handleCommand(command: string, args: any): Promise<string> {
    switch (command) {
      case 'weekly_update':
        return this.generateWeeklyUpdate();
      
      case 'power_rankings':
        return this.generatePowerRankings();
      
      case 'trade_deadline_reminder':
        return this.generateTradeDeadlineReminder();
      
      case 'playoff_scenarios':
        return this.generatePlayoffScenarios();
      
      default:
        return `Unknown Commissioner command: ${command}`;
    }
  }

  /**
   * Generate weekly Commissioner update
   */
  private async generateWeeklyUpdate(): Promise<string> {
    // This would pull real data in production
    return `
⚖️ **COMMISSIONER'S WEEKLY UPDATE** ⚖️

Greetings, esteemed managers of our fantasy realm!

By the power vested in me as Commissioner, I bring you this week's official update:

**LEAGUE STANDINGS**: The battle for supremacy continues with surprising upsets and dominant performances.

**TRADE ACTIVITY**: The trade market remains active. All trades are under review for competitive balance.

**UPCOMING DEADLINES**: 
- Waiver claims process: Wednesday 3:00 AM
- Trade deadline approaching in 3 weeks

**COMMISSIONER'S NOTES**: 
Congratulations to last week's highest scorer! Remember, collusion will not be tolerated, and all questionable activities are being monitored.

May your lineups be ever optimized and your waiver claims successful!

— The Commissioner
    `.trim();
  }

  /**
   * Generate power rankings
   */
  private async generatePowerRankings(): Promise<string> {
    // This would use real data and analysis in production
    return `
📊 **OFFICIAL POWER RANKINGS** 📊

After careful analysis and consideration, the Commissioner presents this week's Power Rankings:

1. **Team Alpha** (8-2) - Dominant on all fronts
2. **Squad Beta** (7-3) - Rising fast with recent trades
3. **Dynasty Gamma** (7-3) - Consistent excellence
4. **Warriors Delta** (6-4) - Dangerous dark horse
5. **Legion Epsilon** (5-5) - Capable of upsets

*Rankings consider: Record, points scored, strength of schedule, recent performance, and roster potential.*

These rankings are official and final until next week's reassessment.

— The Commissioner
    `.trim();
  }

  /**
   * Generate trade deadline reminder
   */
  private async generateTradeDeadlineReminder(): Promise<string> {
    return `
⏰ **OFFICIAL TRADE DEADLINE NOTICE** ⏰

Attention all managers!

In the interest of competitive balance and fair play, be advised:

**TRADE DEADLINE**: November 15th, 11:59 PM EST
**TIME REMAINING**: 72 hours

IMPORTANT REMINDERS:
• All trades must be submitted before the deadline
• Trades will be reviewed for collusion and fairness
• Post-deadline roster moves limited to waivers only
• Championship eligibility requires roster compliance

The league has spoken - make your moves wisely!

— The Commissioner
    `.trim();
  }

  /**
   * Generate playoff scenarios
   */
  private async generatePlayoffScenarios(): Promise<string> {
    return `
🏆 **PLAYOFF SCENARIO REPORT** 🏆

As guardian of this fantasy realm, I present the paths to glory:

**CLINCHED PLAYOFF BERTHS**: 
- Team Alpha (8-2) ✓
- Squad Beta (7-3) ✓

**IN THE HUNT** (need 1 win):
- Dynasty Gamma (7-3)
- Warriors Delta (6-4)

**STILL ALIVE** (need help):
- Legion Epsilon (5-5) - Must win out + tiebreakers
- Phoenix Force (4-6) - Mathematical chance remains

**ELIMINATED**: 
- Teams with 7+ losses

May the best teams advance to pursue championship glory!

— The Commissioner
    `.trim();
  }
}

// Re-export z for the tool schemas
import { z } from 'zod';