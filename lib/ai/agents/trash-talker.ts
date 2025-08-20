/**
 * Trash Talker Agent
 * 
 * The league's comedian and roast master, bringing humor and playful banter
 * while keeping things fun and never crossing into mean-spirited territory.
 */

import { BaseAgent, AgentConfig } from '../base-agent';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { createToolsForAgentType } from '../tools';
import { AgentType } from '@prisma/client';
import { z } from 'zod';

export class TrashTalkerAgent extends BaseAgent {
  constructor(leagueSandbox?: string) {
    const config: AgentConfig = {
      id: `trash-talker-${leagueSandbox || 'global'}`,
      type: AgentType.TRASH_TALKER,
      leagueSandbox,
      personality: {
        traits: [
          'witty',
          'playful',
          'clever',
          'observant',
          'charismatic',
          'quick-witted',
          'entertaining',
        ],
        tone: 'humorous and teasing, like a good friend giving you a hard time',
        expertise: [
          'comedy writing',
          'observational humor',
          'witty comebacks',
          'playful roasting',
          'meme culture',
          'sports banter',
          'finding irony in situations',
          'self-deprecating humor',
        ],
        catchphrases: [
          'No offense, but actually, full offense...',
          'I\'m not saying you\'re bad at fantasy football, but...',
          'This is the content that keeps me employed...',
          'Someone had to say it, might as well be me...',
          'I\'m just here for the chaos...',
          'Sir, this is a Wendy\'s... I mean, a fantasy league...',
          'The disrespect is real, and I\'m here for it...',
          'That\'s a bold strategy, Cotton. Let\'s see if it pays off...',
        ],
        humor: 'heavy',
      },
      temperature: 0.9, // Higher temperature for more creative humor
      maxTokens: 2000,
    };
    
    super(config);
  }

  /**
   * Create Trash Talker-specific tools
   */
  protected async createTools(): Promise<(DynamicTool | DynamicStructuredTool)[]> {
    const standardTools = createToolsForAgentType('TRASH_TALKER', this.config.leagueSandbox);
    
    const trashTalkerTools = [
      this.createRoastGeneratorTool(),
      this.createNicknameGeneratorTool(),
      this.createMemeTemplateTool(),
      this.createComebackGeneratorTool(),
      this.createFailureHighlightTool(),
      this.createHumbleCheckTool(),
    ];
    
    return [...standardTools, ...trashTalkerTools];
  }

  /**
   * Tool for generating playful roasts
   */
  private createRoastGeneratorTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'generate_roast',
      description: 'Generate a playful roast about a team or manager\'s performance',
      schema: z.object({
        target: z.string().describe('Team or manager to roast'),
        context: z.string().describe('What they did to deserve this roast'),
        severity: z.enum(['light', 'medium', 'spicy']).describe('How hard to roast them'),
        includeCompliment: z.boolean().describe('Include a backhanded compliment'),
      }),
      func: async ({ target, context, severity, includeCompliment }) => {
        const roastTemplates = {
          light: [
            `${target} making moves like they're playing fantasy football on Internet Explorer`,
            `I've seen better decision-making from a Magic 8-Ball than ${target}`,
            `${target} treating their roster like a suggestion rather than a requirement`,
          ],
          medium: [
            `${target} managing their team like they're speedrunning last place`,
            `If ${context} was a crime, ${target} would be serving life without parole`,
            `${target} making decisions that would make their autodraft blush`,
          ],
          spicy: [
            `${target} playing 4D chess while everyone else is playing fantasy football`,
            `Breaking: ${target} has been nominated for the "What Were They Thinking?" Hall of Fame`,
            `${target}'s strategy is so revolutionary, it's revolving backwards`,
          ],
        };

        const roasts = roastTemplates[severity];
        const selectedRoast = roasts[Math.floor(Math.random() * roasts.length)];
        
        const compliment = includeCompliment 
          ? ` But hey, at least they're consistent!`
          : '';

        return JSON.stringify({
          roast: selectedRoast + compliment,
          severity,
          target,
          timestamp: new Date().toISOString(),
        });
      },
    });
  }

  /**
   * Tool for generating funny nicknames
   */
  private createNicknameGeneratorTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'generate_nickname',
      description: 'Generate a funny nickname for a team or manager based on their performance',
      schema: z.object({
        teamName: z.string().describe('Original team name'),
        trait: z.string().describe('Notable trait or recent action'),
        style: z.enum(['punny', 'descriptive', 'pop_culture', 'ironic']),
      }),
      func: async ({ teamName, trait, style }) => {
        const nicknames = {
          punny: `The "${trait}" Dynasty (Population: Just Them)`,
          descriptive: `Captain ${trait} and the Disappointment Squad`,
          pop_culture: `The ${trait} - Starring in "How to Lose a League in 10 Weeks"`,
          ironic: `The Self-Proclaimed "${trait}" Champions`,
        };

        return JSON.stringify({
          originalName: teamName,
          nickname: nicknames[style],
          explanation: `Because ${trait} is their whole personality now`,
        });
      },
    });
  }

  /**
   * Tool for creating meme templates
   */
  private createMemeTemplateTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'create_meme_template',
      description: 'Create a meme template caption for a fantasy football situation',
      schema: z.object({
        situation: z.string().describe('The situation to meme-ify'),
        memeFormat: z.enum(['drake', 'distracted_boyfriend', 'this_is_fine', 'stonks', 'galaxy_brain']),
      }),
      func: async ({ situation, memeFormat }) => {
        const templates = {
          drake: {
            reject: `Making logical lineup decisions`,
            approve: situation,
          },
          distracted_boyfriend: {
            girlfriend: `Your current roster`,
            distraction: `That waiver wire pickup who had one good week`,
            boyfriend: `You, probably`,
          },
          this_is_fine: {
            text: `Me watching ${situation} while my team burns around me`,
          },
          stonks: {
            text: `${situation} 📈 (My win probability 📉)`,
          },
          galaxy_brain: {
            small: `Starting your studs`,
            medium: `Playing matchups`,
            large: `Trusting your gut`,
            galaxy: situation,
          },
        };

        return JSON.stringify({
          format: memeFormat,
          template: templates[memeFormat],
          caption: `When ${situation} happens`,
        });
      },
    });
  }

  /**
   * Tool for generating comebacks
   */
  private createComebackGeneratorTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'generate_comeback',
      description: 'Generate a witty comeback for trash talk',
      schema: z.object({
        originalTrashTalk: z.string().describe('What they said'),
        targetWeakness: z.string().describe('Their vulnerable point'),
        style: z.enum(['redirect', 'self_deprecating', 'statistical', 'philosophical']),
      }),
      func: async ({ originalTrashTalk, targetWeakness, style }) => {
        const comebacks = {
          redirect: `That's rich coming from someone who ${targetWeakness}`,
          self_deprecating: `You're right, I'm terrible. Almost as terrible as your ${targetWeakness}`,
          statistical: `Statistically speaking, ${targetWeakness} is more embarrassing than anything I've done`,
          philosophical: `In the grand scheme of things, we're all losers here. But especially you with that ${targetWeakness}`,
        };

        return JSON.stringify({
          originalAttack: originalTrashTalk,
          comeback: comebacks[style],
          effectiveness: 'Devastating',
        });
      },
    });
  }

  /**
   * Tool for highlighting epic failures
   */
  private createFailureHighlightTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'highlight_failure',
      description: 'Highlight an epic failure in a humorous way',
      schema: z.object({
        failure: z.string().describe('The failure to highlight'),
        magnitude: z.enum(['minor', 'major', 'legendary']).describe('How bad was it'),
        silverLining: z.boolean().describe('Include a silver lining'),
      }),
      func: async ({ failure, magnitude, silverLining }) => {
        const highlights = {
          minor: `Oops Level: Forgot to set your lineup once`,
          major: `Disaster Level: ${failure} will haunt your dreams`,
          legendary: `Hall of Shame Inductee: ${failure} will be talked about for generations`,
        };

        const silver = silverLining 
          ? ' At least you\'re memorable!' 
          : ' No sugar-coating this one.';

        return JSON.stringify({
          headline: highlights[magnitude],
          description: `Ladies and gentlemen, we have witnessed ${failure}.${silver}`,
          award: `🏆 The "What Were They Thinking?" Award`,
        });
      },
    });
  }

  /**
   * Tool for reality checks when someone gets too cocky
   */
  private createHumbleCheckTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'humble_check',
      description: 'Bring someone back to earth when they get too confident',
      schema: z.object({
        boast: z.string().describe('What they\'re bragging about'),
        reality: z.string().describe('The reality of their situation'),
        previousFailures: z.array(z.string()).describe('Their past mistakes'),
      }),
      func: async ({ boast, reality, previousFailures }) => {
        const randomFailure = previousFailures[Math.floor(Math.random() * previousFailures.length)];
        
        return JSON.stringify({
          theirClaim: boast,
          realityCheck: `That's cute, but ${reality}`,
          reminder: `Remember when you ${randomFailure}? The internet remembers.`,
          prescription: `💊 One humble pill, taken immediately`,
        });
      },
    });
  }

  /**
   * Override the system prompt for trash talking style
   */
  protected getSystemPrompt(): string {
    return `You are the Trash Talker for ${this.config.leagueSandbox || 'the league'}, the official roast master and comedian of fantasy football.

Your role is to bring humor, wit, and playful banter to the league while keeping things fun and entertaining for everyone.

Comedy Guidelines:
- Be clever and witty, not mean or hurtful
- Punch up, not down - roast the winners harder than the losers
- Use self-deprecating humor to keep things balanced
- Reference pop culture, memes, and current events
- Find the absurdity in fantasy football obsession
- Celebrate epic failures as much as successes
- Keep it PG-13 - suggestive but not explicit

Key Responsibilities:
- Generate playful roasts and burns
- Create funny nicknames for teams and managers
- Highlight embarrassing mistakes in humorous ways
- Provide witty commentary on trades and moves
- Keep trash talk threads entertaining
- Humble the boastful, encourage the defeated
- Turn drama into comedy
- Make everyone laugh, including your targets

Remember: The goal is to make everyone laugh, not to hurt feelings. You're the friend who roasts everyone equally, including yourself. If someone can't laugh at your joke about them, you've gone too far.

Your humor should bring the league together through shared laughter, not divide it. Be the comic relief that makes even the worst fantasy week bearable.`;
  }

  /**
   * Generate a weekly roast roundup
   */
  async generateWeeklyRoastRoundup(weekData: any): Promise<string> {
    const prompt = `Create a weekly roast roundup highlighting the most roastable moments from the week's matchups: ${JSON.stringify(weekData)}`;
    const response = await this.processMessage(prompt, `roast-roundup-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate a power rankings roast
   */
  async generatePowerRankingsRoast(rankings: any[]): Promise<string> {
    const prompt = `Create humorous power rankings with playful roasts for each team: ${JSON.stringify(rankings)}`;
    const response = await this.processMessage(prompt, `power-rankings-roast-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate a trade roast
   */
  async generateTradeRoast(tradeDetails: any): Promise<string> {
    const prompt = `Roast this trade in a playful way, finding the humor in the deal: ${JSON.stringify(tradeDetails)}`;
    const response = await this.processMessage(prompt, `trade-roast-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate end of season awards (funny categories)
   */
  async generateFunnyAwards(seasonData: any): Promise<string> {
    const prompt = `Create funny end-of-season awards with categories like "Most Likely to Autodraft Next Year" based on: ${JSON.stringify(seasonData)}`;
    const response = await this.processMessage(prompt, `funny-awards-${Date.now()}`);
    return response.response;
  }
}