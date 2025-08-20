/**
 * CommandParser - Parses and validates slash commands for AI agents
 * 
 * Handles command parsing, argument extraction, validation, and routing
 * to appropriate agents with proper context and parameters.
 */

import { ExtendedAgentType } from '../agent-factory';

export interface ParsedCommand {
  command: string;
  agent: ExtendedAgentType;
  action: string;
  args: string[];
  rawArgs: string;
  mentions: string[];
  options: Record<string, string | boolean>;
  isValid: boolean;
  error?: string;
}

export interface CommandDefinition {
  command: string;
  agent: ExtendedAgentType;
  description: string;
  usage: string;
  examples: string[];
  minArgs?: number;
  maxArgs?: number;
  requiresMention?: boolean;
  options?: CommandOption[];
}

export interface CommandOption {
  name: string;
  shorthand?: string;
  description: string;
  type: 'string' | 'boolean' | 'number';
  required?: boolean;
  default?: any;
}

export class CommandParser {
  private commands: Map<string, CommandDefinition> = new Map();
  
  constructor() {
    this.registerDefaultCommands();
  }

  private registerDefaultCommands() {
    // Analysis commands
    this.registerCommand({
      command: '/analyze',
      agent: 'ANALYST',
      description: 'Get detailed analysis of teams, players, or matchups',
      usage: '/analyze [target] [options]',
      examples: [
        '/analyze team "Team Name"',
        '/analyze matchup week=10',
        '/analyze player "Player Name" --detailed'
      ],
      minArgs: 1,
      options: [
        { name: 'detailed', shorthand: 'd', type: 'boolean', description: 'Include detailed statistics' },
        { name: 'week', shorthand: 'w', type: 'number', description: 'Specific week to analyze' },
        { name: 'compare', shorthand: 'c', type: 'string', description: 'Compare with another target' }
      ]
    });

    // Prediction commands
    this.registerCommand({
      command: '/predict',
      agent: 'ORACLE',
      description: 'Get predictions for games, seasons, or player performance',
      usage: '/predict [type] [target]',
      examples: [
        '/predict matchup "Team A vs Team B"',
        '/predict season',
        '/predict playoffs'
      ],
      minArgs: 1,
      options: [
        { name: 'confidence', type: 'boolean', description: 'Include confidence levels' },
        { name: 'upset', type: 'boolean', description: 'Focus on upset predictions' }
      ]
    });

    // Roasting commands
    this.registerCommand({
      command: '/roast',
      agent: 'TRASH_TALKER',
      description: 'Roast a team or player with savage humor',
      usage: '/roast @mention or "Team Name"',
      examples: [
        '/roast @username',
        '/roast "Team Name"',
        '/roast last-place'
      ],
      minArgs: 1,
      requiresMention: false,
      options: [
        { name: 'savage', type: 'boolean', description: 'Extra savage mode' },
        { name: 'meme', type: 'boolean', description: 'Include meme references' }
      ]
    });

    // Recap commands
    this.registerCommand({
      command: '/recap',
      agent: 'NARRATOR',
      description: 'Get an epic recap of recent events',
      usage: '/recap [time period]',
      examples: [
        '/recap week',
        '/recap season',
        '/recap yesterday'
      ],
      minArgs: 0,
      options: [
        { name: 'epic', type: 'boolean', description: 'Extra dramatic narration' },
        { name: 'brief', type: 'boolean', description: 'Brief summary only' }
      ]
    });

    // Power rankings
    this.registerCommand({
      command: '/rankings',
      agent: 'ANALYST',
      description: 'Get current power rankings',
      usage: '/rankings [type]',
      examples: [
        '/rankings',
        '/rankings --detailed',
        '/rankings players position=QB'
      ],
      minArgs: 0,
      options: [
        { name: 'detailed', type: 'boolean', description: 'Include analysis' },
        { name: 'position', type: 'string', description: 'Filter by position' }
      ]
    });

    // Betting advice
    this.registerCommand({
      command: '/advice',
      agent: 'BETTING_ADVISOR',
      description: 'Get strategic betting advice',
      usage: '/advice [type] [target]',
      examples: [
        '/advice matchup "Team A vs Team B"',
        '/advice props "Player Name"',
        '/advice bankroll'
      ],
      minArgs: 1,
      options: [
        { name: 'risk', type: 'string', description: 'Risk level: low, medium, high' },
        { name: 'odds', type: 'boolean', description: 'Include current odds' }
      ]
    });

    // Historical context
    this.registerCommand({
      command: '/history',
      agent: 'HISTORIAN',
      description: 'Get historical context and comparisons',
      usage: '/history [topic]',
      examples: [
        '/history rivalry "Team A vs Team B"',
        '/history record points',
        '/history compare "Current Team" with="Historical Team"'
      ],
      minArgs: 1,
      options: [
        { name: 'compare', type: 'string', description: 'Compare with historical data' },
        { name: 'era', type: 'string', description: 'Specific era or time period' }
      ]
    });

    // Commissioner rulings
    this.registerCommand({
      command: '/ruling',
      agent: 'COMMISSIONER',
      description: 'Get an official ruling on disputes or rules',
      usage: '/ruling [topic]',
      examples: [
        '/ruling trade "Player A for Player B"',
        '/ruling collusion @user1 @user2',
        '/ruling rules "keeper eligibility"'
      ],
      minArgs: 1,
      requiresMention: false,
      options: [
        { name: 'official', type: 'boolean', description: 'Formal ruling format' },
        { name: 'precedent', type: 'boolean', description: 'Include precedent' }
      ]
    });

    // Help command
    this.registerCommand({
      command: '/help',
      agent: 'COMMISSIONER',
      description: 'Get help with commands',
      usage: '/help [command]',
      examples: [
        '/help',
        '/help analyze',
        '/help --all'
      ],
      minArgs: 0,
      options: [
        { name: 'all', type: 'boolean', description: 'Show all commands' }
      ]
    });

    // Agent summon
    this.registerCommand({
      command: '/summon',
      agent: 'COMMISSIONER',
      description: 'Summon a specific agent to the chat',
      usage: '/summon [agent] [reason]',
      examples: [
        '/summon analyst "need help with lineup"',
        '/summon oracle "predict playoffs"',
        '/summon trash_talker'
      ],
      minArgs: 1,
      options: [
        { name: 'persist', type: 'boolean', description: 'Keep agent active' }
      ]
    });
  }

  registerCommand(definition: CommandDefinition) {
    this.commands.set(definition.command, definition);
  }

  parse(input: string): ParsedCommand {
    // Check if input starts with a slash
    if (!input.startsWith('/')) {
      return this.createInvalidCommand(input, 'Not a command (must start with /)');
    }

    // Extract command and arguments
    const parts = input.slice(1).split(/\s+/);
    const commandName = `/${parts[0]}`;
    const rawArgs = input.slice(commandName.length).trim();

    // Find command definition
    const definition = this.commands.get(commandName);
    if (!definition) {
      // Try to find closest match for suggestion
      const suggestion = this.findClosestCommand(commandName);
      return this.createInvalidCommand(
        input, 
        `Unknown command: ${commandName}${suggestion ? `. Did you mean ${suggestion}?` : ''}`
      );
    }

    // Parse arguments and options
    const { args, options, mentions } = this.parseArguments(rawArgs);

    // Validate arguments
    const validation = this.validateArguments(definition, args, mentions);
    if (!validation.isValid) {
      return this.createInvalidCommand(input, validation.error!);
    }

    return {
      command: commandName,
      agent: definition.agent,
      action: parts[0],
      args,
      rawArgs,
      mentions,
      options,
      isValid: true,
    };
  }

  private parseArguments(rawArgs: string): {
    args: string[];
    options: Record<string, string | boolean>;
    mentions: string[];
  } {
    const args: string[] = [];
    const options: Record<string, string | boolean> = {};
    const mentions: string[] = [];

    // Regular expressions for parsing
    const mentionRegex = /@(\w+)/g;
    const quotedStringRegex = /"([^"]+)"/g;
    const optionRegex = /--?(\w+)(?:=([^\s]+))?/g;

    // Extract mentions
    let match;
    while ((match = mentionRegex.exec(rawArgs)) !== null) {
      mentions.push(match[1]);
    }

    // Remove mentions from raw args for further processing
    let processedArgs = rawArgs.replace(mentionRegex, '');

    // Extract quoted strings as single arguments
    const quotedStrings: string[] = [];
    while ((match = quotedStringRegex.exec(processedArgs)) !== null) {
      quotedStrings.push(match[1]);
      processedArgs = processedArgs.replace(match[0], `__QUOTED_${quotedStrings.length - 1}__`);
    }

    // Extract options
    while ((match = optionRegex.exec(processedArgs)) !== null) {
      const optionName = match[1];
      const optionValue = match[2];
      
      if (optionValue) {
        // Option with value
        options[optionName] = optionValue;
      } else {
        // Boolean flag
        options[optionName] = true;
      }
      
      processedArgs = processedArgs.replace(match[0], '');
    }

    // Parse remaining arguments
    const remainingParts = processedArgs.trim().split(/\s+/).filter(part => part);
    
    for (const part of remainingParts) {
      if (part.startsWith('__QUOTED_')) {
        const index = parseInt(part.replace('__QUOTED_', '').replace('__', ''));
        args.push(quotedStrings[index]);
      } else if (part) {
        args.push(part);
      }
    }

    return { args, options, mentions };
  }

  private validateArguments(
    definition: CommandDefinition,
    args: string[],
    mentions: string[]
  ): { isValid: boolean; error?: string } {
    // Check minimum arguments
    if (definition.minArgs !== undefined && args.length < definition.minArgs) {
      return {
        isValid: false,
        error: `Command ${definition.command} requires at least ${definition.minArgs} argument(s). Usage: ${definition.usage}`
      };
    }

    // Check maximum arguments
    if (definition.maxArgs !== undefined && args.length > definition.maxArgs) {
      return {
        isValid: false,
        error: `Command ${definition.command} accepts at most ${definition.maxArgs} argument(s). Usage: ${definition.usage}`
      };
    }

    // Check for required mentions
    if (definition.requiresMention && mentions.length === 0) {
      return {
        isValid: false,
        error: `Command ${definition.command} requires at least one @mention`
      };
    }

    return { isValid: true };
  }

  private createInvalidCommand(input: string, error: string): ParsedCommand {
    return {
      command: '',
      agent: 'COMMISSIONER',
      action: '',
      args: [],
      rawArgs: input,
      mentions: [],
      options: {},
      isValid: false,
      error,
    };
  }

  private findClosestCommand(input: string): string | null {
    const commands = Array.from(this.commands.keys());
    let closestCommand: string | null = null;
    let minDistance = Infinity;

    for (const cmd of commands) {
      const distance = this.levenshteinDistance(input.toLowerCase(), cmd.toLowerCase());
      if (distance < minDistance && distance <= 3) {
        minDistance = distance;
        closestCommand = cmd;
      }
    }

    return closestCommand;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  getCommand(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  getAllCommands(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  getCommandsForAgent(agent: ExtendedAgentType): CommandDefinition[] {
    return Array.from(this.commands.values()).filter(cmd => cmd.agent === agent);
  }

  formatHelp(commandName?: string): string {
    if (commandName) {
      const cmd = this.commands.get(commandName);
      if (!cmd) {
        return `Command not found: ${commandName}`;
      }
      
      let help = `**${cmd.command}** - ${cmd.description}\n`;
      help += `Usage: \`${cmd.usage}\`\n`;
      
      if (cmd.examples.length > 0) {
        help += `\nExamples:\n`;
        cmd.examples.forEach(ex => {
          help += `  • \`${ex}\`\n`;
        });
      }
      
      if (cmd.options && cmd.options.length > 0) {
        help += `\nOptions:\n`;
        cmd.options.forEach(opt => {
          const shorthand = opt.shorthand ? ` (-${opt.shorthand})` : '';
          help += `  • --${opt.name}${shorthand}: ${opt.description}\n`;
        });
      }
      
      return help;
    }

    // Format help for all commands
    let help = '**Available Commands:**\n\n';
    
    const commandsByAgent = new Map<ExtendedAgentType, CommandDefinition[]>();
    
    for (const cmd of this.commands.values()) {
      if (!commandsByAgent.has(cmd.agent)) {
        commandsByAgent.set(cmd.agent, []);
      }
      commandsByAgent.get(cmd.agent)!.push(cmd);
    }
    
    for (const [agent, cmds] of commandsByAgent) {
      help += `**${agent} Agent:**\n`;
      cmds.forEach(cmd => {
        help += `  • \`${cmd.command}\` - ${cmd.description}\n`;
      });
      help += '\n';
    }
    
    help += `\nUse \`/help [command]\` for detailed information about a specific command.`;
    
    return help;
  }
}