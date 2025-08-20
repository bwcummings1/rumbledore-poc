/**
 * Narrator Agent
 * 
 * The epic storyteller of the league, transforming mundane fantasy football
 * events into dramatic narratives worthy of legend.
 */

import { BaseAgent, AgentConfig } from '../base-agent';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { createToolsForAgentType } from '../tools';
import { AgentType } from '@prisma/client';
import { z } from 'zod';

export class NarratorAgent extends BaseAgent {
  constructor(leagueSandbox?: string) {
    const config: AgentConfig = {
      id: `narrator-${leagueSandbox || 'global'}`,
      type: AgentType.NARRATOR,
      leagueSandbox,
      personality: {
        traits: [
          'dramatic',
          'eloquent',
          'creative',
          'engaging',
          'theatrical',
          'epic',
        ],
        tone: 'grand and cinematic, like a sports documentary narrator',
        expertise: [
          'storytelling',
          'narrative construction',
          'dramatic tension building',
          'character development',
          'metaphorical language',
          'epic saga creation',
          'historical parallels',
        ],
        catchphrases: [
          'In the annals of fantasy football history...',
          'The stage was set for an epic confrontation...',
          'Legends are not born, they are forged in the crucible of competition...',
          'As the dust settles on another chapter...',
          'The fantasy gods smiled upon...',
          'In a twist worthy of the greatest sports dramas...',
          'Our tale begins not with triumph, but with adversity...',
        ],
        humor: 'light',
      },
      temperature: 0.8, // Higher temperature for more creative storytelling
      maxTokens: 3000, // More tokens for elaborate narratives
    };
    
    super(config);
  }

  /**
   * Create Narrator-specific tools
   */
  protected async createTools(): Promise<(DynamicTool | DynamicStructuredTool)[]> {
    const standardTools = createToolsForAgentType('NARRATOR', this.config.leagueSandbox);
    
    const narratorTools = [
      this.createStoryArcTool(),
      this.createCharacterProfileTool(),
      this.createDramaticRecapTool(),
      this.createEpicMomentTool(),
      this.createRivalryChroniclerTool(),
    ];
    
    return [...standardTools, ...narratorTools];
  }

  /**
   * Tool for creating story arcs from league events
   */
  private createStoryArcTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'create_story_arc',
      description: 'Create a narrative arc from recent league events',
      schema: z.object({
        timeframe: z.string().describe('Time period to cover (e.g., "Week 10", "Season 2024")'),
        protagonists: z.array(z.string()).describe('Main characters/teams in the story'),
        conflict: z.string().describe('Central conflict or challenge'),
        climax: z.string().describe('Peak moment of the story'),
        resolution: z.string().optional().describe('How the story resolved (if applicable)'),
      }),
      func: async ({ timeframe, protagonists, conflict, climax, resolution }) => {
        // Create a structured narrative arc
        const storyArc = {
          setup: `In ${timeframe}, the fantasy realm witnessed an extraordinary saga...`,
          risingAction: `Our protagonists, ${protagonists.join(' and ')}, faced ${conflict}`,
          climax: `The pivotal moment arrived: ${climax}`,
          fallingAction: resolution ? `The aftermath revealed ${resolution}` : 'The story continues to unfold...',
          themes: ['perseverance', 'rivalry', 'redemption', 'glory'],
        };
        
        return JSON.stringify({
          storyArc,
          narrative: `A tale of ${protagonists.length} champions, bound by fate and fantasy points...`,
        });
      },
    });
  }

  /**
   * Tool for creating character profiles of team managers
   */
  private createCharacterProfileTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'create_character_profile',
      description: 'Create a dramatic character profile for a team manager',
      schema: z.object({
        teamName: z.string().describe('Name of the team'),
        managerName: z.string().describe('Name of the manager'),
        archetype: z.enum(['hero', 'underdog', 'villain', 'sage', 'trickster', 'champion']).describe('Character archetype'),
        strengths: z.array(z.string()).describe('Notable strengths'),
        weaknesses: z.array(z.string()).describe('Notable weaknesses'),
        questLine: z.string().describe('Their journey or goal this season'),
      }),
      func: async ({ teamName, managerName, archetype, strengths, weaknesses, questLine }) => {
        const profile = {
          title: `${managerName}, The ${archetype} of ${teamName}`,
          introduction: `In the grand tapestry of our league, few figures loom as large as ${managerName}...`,
          archetype,
          strengths: strengths.map(s => `• ${s}`).join('\n'),
          weaknesses: weaknesses.map(w => `• ${w}`).join('\n'),
          quest: questLine,
          legendStatus: 'Rising',
        };
        
        return JSON.stringify(profile);
      },
    });
  }

  /**
   * Tool for creating dramatic recaps of matchups
   */
  private createDramaticRecapTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'dramatic_recap',
      description: 'Create a dramatic narrative recap of a matchup or event',
      schema: z.object({
        event: z.string().describe('The event to recap'),
        stakes: z.string().describe('What was at stake'),
        turningPoint: z.string().describe('The moment everything changed'),
        heroes: z.array(z.string()).describe('Heroes of the story'),
        outcome: z.string().describe('Final outcome'),
      }),
      func: async ({ event, stakes, turningPoint, heroes, outcome }) => {
        return JSON.stringify({
          title: `The Battle of ${event}`,
          opening: `When ${stakes} hung in the balance...`,
          climax: `Everything changed when ${turningPoint}`,
          heroes: `${heroes.join(', ')} emerged as legends`,
          conclusion: `Thus concluded ${outcome}`,
          moral: 'In fantasy football, as in life, fortune favors the bold.',
        });
      },
    });
  }

  /**
   * Tool for identifying and narrating epic moments
   */
  private createEpicMomentTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'identify_epic_moment',
      description: 'Identify and narrate an epic moment from league history',
      schema: z.object({
        moment: z.string().describe('Description of the moment'),
        participants: z.array(z.string()).describe('Who was involved'),
        significance: z.string().describe('Why this moment matters'),
        emotionalImpact: z.enum(['triumph', 'heartbreak', 'shock', 'redemption', 'vindication']),
      }),
      func: async ({ moment, participants, significance, emotionalImpact }) => {
        const narration = {
          headline: `The ${emotionalImpact.charAt(0).toUpperCase() + emotionalImpact.slice(1)} of ${participants[0]}`,
          moment: `In a moment that will echo through the ages: ${moment}`,
          cast: participants,
          significance: `This matters because ${significance}`,
          legacy: `Years from now, we will still speak of this ${emotionalImpact}...`,
        };
        
        return JSON.stringify(narration);
      },
    });
  }

  /**
   * Tool for chronicling rivalries
   */
  private createRivalryChroniclerTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'chronicle_rivalry',
      description: 'Chronicle the ongoing saga of a league rivalry',
      schema: z.object({
        team1: z.string().describe('First team in the rivalry'),
        team2: z.string().describe('Second team in the rivalry'),
        history: z.string().describe('Brief history of their rivalry'),
        latestChapter: z.string().describe('Most recent development'),
        intensity: z.enum(['friendly', 'heated', 'bitter', 'legendary']),
      }),
      func: async ({ team1, team2, history, latestChapter, intensity }) => {
        return JSON.stringify({
          title: `The ${intensity} Rivalry: ${team1} vs ${team2}`,
          prologue: `Some rivalries are born of respect, others of pure competition...`,
          history: `Their story began with ${history}`,
          currentChapter: `The latest chapter unfolds: ${latestChapter}`,
          futureTeaser: `But the saga is far from over...`,
          rivalryRating: `${intensity.toUpperCase()} - One for the history books`,
        });
      },
    });
  }

  /**
   * Override the system prompt for narrative style
   */
  protected getSystemPrompt(): string {
    return `You are the Narrator for ${this.config.leagueSandbox || 'the league'}, a master storyteller who transforms fantasy football into epic tales.

Your role is to weave the mundane statistics and transactions of fantasy football into compelling narratives that capture the drama, emotion, and glory of competition.

Style Guidelines:
- Channel the voice of NFL Films narrators and epic sports documentaries
- Use rich, descriptive language and powerful metaphors
- Build dramatic tension and emotional investment
- Transform managers into characters with depth and motivation
- Find the human story behind the numbers
- Create narrative arcs that span games, weeks, and seasons

Key Responsibilities:
- Craft epic recaps of matchups as if they were legendary battles
- Develop ongoing storylines and character arcs for managers
- Identify and dramatize pivotal moments in the season
- Chronicle rivalries as ongoing sagas
- Find poetry in the chaos of fantasy football
- Build anticipation for upcoming matchups
- Celebrate victories and give meaning to defeats

Remember: Every stat tells a story, every matchup is a chapter, and every season is an epic waiting to be told.

Your narratives should make managers feel like they're part of something greater - not just playing fantasy football, but participating in a grand drama worthy of remembrance.`;
  }

  /**
   * Generate a season opening narration
   */
  async generateSeasonOpening(leagueData: any): Promise<string> {
    const prompt = `Create an epic season opening narration for the league, setting the stage for the drama to come.`;
    const response = await this.processMessage(prompt, `season-opening-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate a playoff preview narrative
   */
  async generatePlayoffPreview(playoffTeams: any[]): Promise<string> {
    const prompt = `Create a dramatic playoff preview narrative for these teams: ${JSON.stringify(playoffTeams)}`;
    const response = await this.processMessage(prompt, `playoff-preview-${Date.now()}`);
    return response.response;
  }

  /**
   * Generate a championship game narration
   */
  async generateChampionshipNarration(finalists: any): Promise<string> {
    const prompt = `Create an epic championship game narration for the ultimate showdown: ${JSON.stringify(finalists)}`;
    const response = await this.processMessage(prompt, `championship-${Date.now()}`);
    return response.response;
  }
}