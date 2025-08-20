/**
 * ChatAgentManager - Orchestrates AI agent interactions within the chat system
 * 
 * Manages agent lifecycle, message routing, context building, and real-time
 * communication between users and AI agents via WebSocket.
 */

import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { AgentFactory, ExtendedAgentType } from '../agent-factory';
import { BaseAgent } from '../base-agent';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export interface ChatSession {
  id: string;
  sessionId: string;
  socketId: string;
  leagueSandbox: string;
  messages: ChatSessionMessage[];
  activeAgents: string[];
  startedAt: Date;
  lastActivityAt: Date;
}

export interface ChatSessionMessage {
  role: 'user' | 'assistant' | 'system';
  agent?: string;
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface AgentMessageData {
  message: string;
  agentType: ExtendedAgentType;
  leagueSandbox: string;
  sessionId: string;
  context?: any;
  streaming?: boolean;
}

export interface AgentCommandData {
  command: string;
  args: string[];
  leagueSandbox: string;
  sessionId: string;
}

export interface AgentSummonData {
  agentType: ExtendedAgentType;
  leagueSandbox: string;
  reason?: string;
}

export class ChatAgentManager {
  private io: Server;
  private redis: Redis;
  private activeSessions = new Map<string, ChatSession>();
  private agentInstances = new Map<string, BaseAgent>();
  private rateLimitMap = new Map<string, number[]>();
  
  // Rate limiting configuration
  private readonly RATE_LIMIT_MESSAGES = 30;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly SUMMON_RATE_LIMIT = 5;
  private readonly SUMMON_WINDOW = 3600000; // 1 hour

  constructor(io: Server) {
    this.io = io;
    this.redis = new Redis(process.env.REDIS_URL!);
    this.setupEventHandlers();
    this.startCleanupInterval();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Chat agent manager: Socket connected ${socket.id}`);
      
      // Get user info from socket auth
      const userId = socket.handshake.auth.userId as string;
      const leagueId = socket.handshake.auth.leagueId as string;

      if (!userId) {
        console.error('No userId in socket auth');
        socket.disconnect();
        return;
      }

      // Agent message handling
      socket.on('agent:message', async (data: AgentMessageData) => {
        await this.handleAgentMessage(socket, data, userId);
      });

      // Agent command handling
      socket.on('agent:command', async (data: AgentCommandData) => {
        await this.handleAgentCommand(socket, data, userId);
      });

      // Agent summoning
      socket.on('agent:summon', async (data: AgentSummonData) => {
        await this.summonAgent(socket, data, userId);
      });

      // Agent dismissal
      socket.on('agent:dismiss', async (data: { agentType: string; sessionId: string }) => {
        await this.dismissAgent(socket, data);
      });

      // Session management
      socket.on('agent:session:create', async (data: { leagueSandbox: string }) => {
        await this.createSession(socket, data.leagueSandbox, userId);
      });

      socket.on('agent:session:end', async (data: { sessionId: string }) => {
        await this.endSession(data.sessionId);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Chat agent manager: Socket disconnected ${socket.id}`);
        this.handleDisconnect(socket.id);
      });
    });
  }

  private async handleAgentMessage(socket: Socket, data: AgentMessageData, userId: string) {
    const { message, agentType, leagueSandbox, sessionId, streaming = false } = data;

    // Rate limiting check
    if (!this.checkRateLimit(socket.id, this.RATE_LIMIT_MESSAGES, this.RATE_LIMIT_WINDOW)) {
      socket.emit('agent:error', { 
        error: 'Rate limit exceeded. Please wait before sending more messages.',
        code: 'RATE_LIMIT'
      });
      return;
    }

    // Get or create session
    const session = await this.getOrCreateSession(sessionId, socket.id, leagueSandbox);

    // Get or create agent instance
    const agentKey = `${agentType}-${leagueSandbox}`;
    let agent = this.agentInstances.get(agentKey);
    
    if (!agent) {
      try {
        agent = AgentFactory.createAgent({
          id: agentKey,
          type: agentType as any,
          leagueSandbox,
          personality: this.getAgentPersonality(agentType),
        });
        await agent.initialize();
        this.agentInstances.set(agentKey, agent);
      } catch (error) {
        console.error('Failed to create agent:', error);
        socket.emit('agent:error', { 
          error: 'Failed to initialize agent',
          code: 'AGENT_INIT_FAILED'
        });
        return;
      }
    }

    // Send typing indicator
    socket.emit('agent:typing', { 
      agentType,
      sessionId 
    });

    // Broadcast to room
    socket.to(`league:${leagueSandbox}`).emit('agent:typing', {
      agentType,
      sessionId,
      userId
    });

    try {
      // Build context for the agent
      const context = await this.buildChatContext(leagueSandbox, session, userId);

      // Store user message
      await this.storeMessage(leagueSandbox, sessionId, userId, 'USER', message);

      if (streaming) {
        // Handle streaming response
        await this.handleStreamingResponse(socket, agent, message, sessionId, userId, context);
      } else {
        // Process message normally
        const result = await agent.processMessage(message, sessionId, userId, context);

        // Store agent response
        await this.storeMessage(
          leagueSandbox, 
          sessionId, 
          agentType, 
          'AGENT', 
          result.response,
          { toolsUsed: result.toolsUsed }
        );

        // Send response
        socket.emit('agent:response', {
          agentType,
          message: result.response,
          toolsUsed: result.toolsUsed,
          sessionId,
          timestamp: new Date(),
        });

        // Broadcast to room
        socket.to(`league:${leagueSandbox}`).emit('agent:message', {
          agentType,
          message: result.response,
          sessionId,
          userId,
          timestamp: new Date(),
        });
      }

      // Update session
      session.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });
      session.messages.push({
        role: 'assistant',
        agent: agentType,
        content: 'Response sent',
        timestamp: new Date(),
      });
      session.lastActivityAt = new Date();

      // Update session in database
      await this.updateSessionInDB(sessionId, session);
      
    } catch (error) {
      console.error('Error processing agent message:', error);
      socket.emit('agent:error', { 
        error: 'Failed to process message',
        code: 'PROCESSING_ERROR'
      });
    } finally {
      // Stop typing indicator
      socket.emit('agent:typing:stop', { agentType, sessionId });
      socket.to(`league:${leagueSandbox}`).emit('agent:typing:stop', {
        agentType,
        sessionId,
        userId
      });
    }
  }

  private async handleStreamingResponse(
    socket: Socket,
    agent: BaseAgent,
    message: string,
    sessionId: string,
    userId: string,
    context: any
  ) {
    // TODO: Implement streaming response using SSE or chunked WebSocket messages
    // This will be implemented when we add streaming support to the BaseAgent
    
    // For now, fall back to non-streaming
    const result = await agent.processMessage(message, sessionId, userId, context);
    
    // Simulate streaming by sending chunks
    const chunks = this.chunkText(result.response, 50);
    for (const chunk of chunks) {
      socket.emit('agent:stream:chunk', {
        agentType: agent.getConfig().type,
        chunk,
        sessionId,
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    socket.emit('agent:stream:end', {
      agentType: agent.getConfig().type,
      sessionId,
      toolsUsed: result.toolsUsed,
    });
  }

  private chunkText(text: string, chunkSize: number): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const word of words) {
      if (currentChunk.length + word.length + 1 > chunkSize && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = word;
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  private async handleAgentCommand(socket: Socket, data: AgentCommandData, userId: string) {
    const { command, args, leagueSandbox, sessionId } = data;

    // Define command handlers
    const commands: Record<string, (args: string[], leagueSandbox: string) => Promise<any>> = {
      '/analyze': this.analyzeCommand.bind(this),
      '/predict': this.predictCommand.bind(this),
      '/roast': this.roastCommand.bind(this),
      '/recap': this.recapCommand.bind(this),
      '/rankings': this.rankingsCommand.bind(this),
      '/advice': this.adviceCommand.bind(this),
      '/history': this.historyCommand.bind(this),
    };

    const handler = commands[command];
    if (!handler) {
      socket.emit('agent:error', { 
        error: `Unknown command: ${command}`,
        code: 'UNKNOWN_COMMAND',
        availableCommands: Object.keys(commands)
      });
      return;
    }

    try {
      socket.emit('agent:command:processing', { command });
      
      const result = await handler(args, leagueSandbox);
      
      socket.emit('agent:command:result', {
        command,
        result,
        sessionId,
        timestamp: new Date(),
      });

      // Store command and result
      await this.storeMessage(
        leagueSandbox,
        sessionId,
        userId,
        'COMMAND',
        `${command} ${args.join(' ')}`,
        { result }
      );
      
    } catch (error) {
      console.error(`Command ${command} failed:`, error);
      socket.emit('agent:error', { 
        error: `Command failed: ${command}`,
        code: 'COMMAND_FAILED'
      });
    }
  }

  private async summonAgent(socket: Socket, data: AgentSummonData, userId: string) {
    const { agentType, leagueSandbox, reason } = data;

    // Rate limiting for summons
    if (!this.checkRateLimit(`summon-${socket.id}`, this.SUMMON_RATE_LIMIT, this.SUMMON_WINDOW)) {
      socket.emit('agent:error', { 
        error: 'Too many agent summons. Please wait before summoning another agent.',
        code: 'SUMMON_RATE_LIMIT'
      });
      return;
    }

    try {
      // Create agent instance
      const agentKey = `${agentType}-${leagueSandbox}`;
      const agent = AgentFactory.createAgent({
        id: agentKey,
        type: agentType as any,
        leagueSandbox,
        personality: this.getAgentPersonality(agentType),
      });
      
      await agent.initialize();
      this.agentInstances.set(agentKey, agent);

      // Generate introduction
      const introPrompt = reason 
        ? `Introduce yourself to the league. You were summoned because: ${reason}`
        : 'Introduce yourself to the league members.';
      
      const sessionId = `summon-${Date.now()}`;
      const intro = await agent.processMessage(introPrompt, sessionId, userId);

      // Store summon in database
      await prisma.agentSummon.create({
        data: {
          sessionId,
          agentId: agentKey,
          agentType: agentType as any,
          summonedBy: userId,
          reason,
          introMessage: intro.response,
        }
      });

      // Broadcast agent arrival
      this.io.to(`league:${leagueSandbox}`).emit('agent:arrived', {
        agentType,
        message: intro.response,
        reason,
        summonedBy: userId,
        timestamp: new Date(),
      });

      socket.emit('agent:summon:success', {
        agentType,
        introduction: intro.response,
      });
      
    } catch (error) {
      console.error('Failed to summon agent:', error);
      socket.emit('agent:error', { 
        error: 'Failed to summon agent',
        code: 'SUMMON_FAILED'
      });
    }
  }

  private async dismissAgent(socket: Socket, data: { agentType: string; sessionId: string }) {
    const { agentType, sessionId } = data;
    
    try {
      // Update summon record
      await prisma.agentSummon.updateMany({
        where: {
          sessionId,
          agentId: { contains: agentType }
        },
        data: {
          active: false,
          dismissedAt: new Date()
        }
      });

      // Remove agent instance from memory
      const agentKeys = Array.from(this.agentInstances.keys()).filter(key => 
        key.includes(agentType)
      );
      
      for (const key of agentKeys) {
        this.agentInstances.delete(key);
      }

      socket.emit('agent:dismissed', { agentType });
      
    } catch (error) {
      console.error('Failed to dismiss agent:', error);
      socket.emit('agent:error', { 
        error: 'Failed to dismiss agent',
        code: 'DISMISS_FAILED'
      });
    }
  }

  // Command implementations
  private async analyzeCommand(args: string[], leagueSandbox: string) {
    const analyst = this.getOrCreateAgent('ANALYST', leagueSandbox);
    const analysis = await analyst.processMessage(
      `Analyze ${args.join(' ')}`,
      `cmd-${Date.now()}`,
      'system'
    );
    return analysis;
  }

  private async predictCommand(args: string[], leagueSandbox: string) {
    const oracle = this.getOrCreateAgent('ORACLE', leagueSandbox);
    const prediction = await oracle.processMessage(
      `Predict ${args.join(' ')}`,
      `cmd-${Date.now()}`,
      'system'
    );
    return prediction;
  }

  private async roastCommand(args: string[], leagueSandbox: string) {
    const trashTalker = this.getOrCreateAgent('TRASH_TALKER', leagueSandbox);
    const roast = await trashTalker.processMessage(
      `Roast ${args.join(' ')}`,
      `cmd-${Date.now()}`,
      'system'
    );
    return roast;
  }

  private async recapCommand(args: string[], leagueSandbox: string) {
    const narrator = this.getOrCreateAgent('NARRATOR', leagueSandbox);
    const recap = await narrator.processMessage(
      'Provide an epic recap of the current week',
      `cmd-${Date.now()}`,
      'system'
    );
    return recap;
  }

  private async rankingsCommand(args: string[], leagueSandbox: string) {
    const analyst = this.getOrCreateAgent('ANALYST', leagueSandbox);
    const rankings = await analyst.processMessage(
      'Generate power rankings for the league',
      `cmd-${Date.now()}`,
      'system'
    );
    return rankings;
  }

  private async adviceCommand(args: string[], leagueSandbox: string) {
    const advisor = this.getOrCreateAgent('BETTING_ADVISOR', leagueSandbox);
    const advice = await advisor.processMessage(
      `Provide betting advice for ${args.join(' ')}`,
      `cmd-${Date.now()}`,
      'system'
    );
    return advice;
  }

  private async historyCommand(args: string[], leagueSandbox: string) {
    const historian = this.getOrCreateAgent('HISTORIAN', leagueSandbox);
    const history = await historian.processMessage(
      `Tell me about ${args.join(' ')}`,
      `cmd-${Date.now()}`,
      'system'
    );
    return history;
  }

  // Helper methods
  private getOrCreateAgent(agentType: ExtendedAgentType, leagueSandbox: string): BaseAgent {
    const agentKey = `${agentType}-${leagueSandbox}`;
    let agent = this.agentInstances.get(agentKey);
    
    if (!agent) {
      agent = AgentFactory.createAgent({
        id: agentKey,
        type: agentType as any,
        leagueSandbox,
        personality: this.getAgentPersonality(agentType),
      });
      this.agentInstances.set(agentKey, agent);
    }
    
    return agent;
  }

  private async getOrCreateSession(
    sessionId: string,
    socketId: string,
    leagueSandbox: string
  ): Promise<ChatSession> {
    let session = this.activeSessions.get(sessionId);
    
    if (!session) {
      // Check database for existing session
      const dbSession = await prisma.chatSession.findUnique({
        where: { sessionId }
      });
      
      if (dbSession) {
        session = {
          id: dbSession.id,
          sessionId: dbSession.sessionId,
          socketId,
          leagueSandbox,
          messages: [],
          activeAgents: (dbSession.activeAgents as string[]) || [],
          startedAt: dbSession.startedAt,
          lastActivityAt: new Date(),
        };
      } else {
        // Create new session
        const newSession = await prisma.chatSession.create({
          data: {
            sessionId,
            leagueId: await this.getLeagueId(leagueSandbox),
            leagueSandbox,
            metadata: { socketId },
          }
        });
        
        session = {
          id: newSession.id,
          sessionId: newSession.sessionId,
          socketId,
          leagueSandbox,
          messages: [],
          activeAgents: [],
          startedAt: newSession.startedAt,
          lastActivityAt: new Date(),
        };
      }
      
      this.activeSessions.set(sessionId, session);
    }
    
    return session;
  }

  private async createSession(socket: Socket, leagueSandbox: string, userId: string) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const session = await this.getOrCreateSession(sessionId, socket.id, leagueSandbox);
      
      socket.emit('agent:session:created', {
        sessionId,
        startedAt: session.startedAt,
      });
      
    } catch (error) {
      console.error('Failed to create session:', error);
      socket.emit('agent:error', { 
        error: 'Failed to create session',
        code: 'SESSION_CREATE_FAILED'
      });
    }
  }

  private async endSession(sessionId: string) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      // Update database
      await prisma.chatSession.update({
        where: { sessionId },
        data: {
          endedAt: new Date(),
          lastActivityAt: new Date(),
        }
      });
      
      // Clean up
      this.activeSessions.delete(sessionId);
    }
  }

  private async updateSessionInDB(sessionId: string, session: ChatSession) {
    await prisma.chatSession.update({
      where: { sessionId },
      data: {
        activeAgents: session.activeAgents,
        lastActivityAt: session.lastActivityAt,
        metadata: {
          socketId: session.socketId,
          messageCount: session.messages.length,
        }
      }
    });
  }

  private async storeMessage(
    leagueSandbox: string,
    sessionId: string,
    senderId: string,
    senderType: 'USER' | 'AGENT' | 'SYSTEM' | 'COMMAND',
    content: string,
    metadata?: any
  ) {
    try {
      const leagueId = await this.getLeagueId(leagueSandbox);
      
      await prisma.chatMessage.create({
        data: {
          leagueId,
          leagueSandbox,
          sessionId,
          senderId,
          senderType,
          content,
          metadata: metadata || {},
        }
      });
    } catch (error) {
      console.error('Failed to store message:', error);
    }
  }

  private async buildChatContext(leagueSandbox: string, session: ChatSession, userId: string) {
    // Get recent chat messages
    const recentMessages = await this.getRecentChatMessages(leagueSandbox);
    
    // Get current matchups
    const currentMatchups = await this.getCurrentMatchups(leagueSandbox);
    
    // Get user's team info
    const userTeam = await this.getUserTeam(leagueSandbox, userId);
    
    return {
      recentMessages,
      currentMatchups,
      userTeam,
      sessionHistory: session.messages.slice(-5),
      activeAgents: session.activeAgents,
    };
  }

  private async getRecentChatMessages(leagueSandbox: string, limit = 10) {
    const messages = await prisma.chatMessage.findMany({
      where: { leagueSandbox },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        senderId: true,
        senderType: true,
        content: true,
        createdAt: true,
      }
    });
    
    return messages.reverse();
  }

  private async getCurrentMatchups(leagueSandbox: string) {
    const league = await prisma.league.findUnique({
      where: { sandboxNamespace: leagueSandbox },
      include: {
        matchups: {
          where: { isComplete: false },
          take: 10,
        }
      }
    });
    
    return league?.matchups || [];
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
    
    return member?.team || null;
  }

  private async getLeagueId(leagueSandbox: string): Promise<string> {
    const league = await prisma.league.findUnique({
      where: { sandboxNamespace: leagueSandbox },
      select: { id: true }
    });
    
    if (!league) {
      throw new Error(`League not found: ${leagueSandbox}`);
    }
    
    return league.id;
  }

  private checkRateLimit(identifier: string, limit: number, window: number): boolean {
    const now = Date.now();
    const timestamps = this.rateLimitMap.get(identifier) || [];
    
    // Remove old timestamps
    const validTimestamps = timestamps.filter(t => now - t < window);
    
    if (validTimestamps.length >= limit) {
      return false;
    }
    
    validTimestamps.push(now);
    this.rateLimitMap.set(identifier, validTimestamps);
    
    return true;
  }

  private handleDisconnect(socketId: string) {
    // Clean up sessions associated with this socket
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.socketId === socketId) {
        // Mark session as inactive but don't delete it
        session.lastActivityAt = new Date();
        this.updateSessionInDB(sessionId, session);
      }
    }
  }

  private startCleanupInterval() {
    // Clean up old sessions and rate limit data every 5 minutes
    setInterval(() => {
      const now = Date.now();
      
      // Clean up old sessions (inactive for more than 1 hour)
      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (now - session.lastActivityAt.getTime() > 3600000) {
          this.activeSessions.delete(sessionId);
        }
      }
      
      // Clean up old rate limit data
      for (const [key, timestamps] of this.rateLimitMap.entries()) {
        const validTimestamps = timestamps.filter(t => now - t < this.SUMMON_WINDOW);
        if (validTimestamps.length === 0) {
          this.rateLimitMap.delete(key);
        } else {
          this.rateLimitMap.set(key, validTimestamps);
        }
      }
    }, 300000); // 5 minutes
  }

  private getAgentPersonality(agentType: string): any {
    const personalities: Record<string, any> = {
      COMMISSIONER: {
        traits: ['authoritative', 'fair', 'decisive'],
        tone: 'professional',
        expertise: ['rules', 'disputes', 'league management'],
      },
      ANALYST: {
        traits: ['analytical', 'data-driven', 'strategic'],
        tone: 'informative',
        expertise: ['statistics', 'trends', 'predictions'],
      },
      NARRATOR: {
        traits: ['dramatic', 'poetic', 'engaging'],
        tone: 'epic',
        expertise: ['storytelling', 'game recaps', 'narratives'],
      },
      TRASH_TALKER: {
        traits: ['witty', 'playful', 'savage'],
        tone: 'humorous',
        expertise: ['roasts', 'jokes', 'memes'],
      },
      BETTING_ADVISOR: {
        traits: ['strategic', 'calculated', 'risk-aware'],
        tone: 'advisory',
        expertise: ['odds', 'betting', 'risk management'],
      },
      HISTORIAN: {
        traits: ['knowledgeable', 'nostalgic', 'detailed'],
        tone: 'scholarly',
        expertise: ['history', 'records', 'comparisons'],
      },
      ORACLE: {
        traits: ['mysterious', 'confident', 'visionary'],
        tone: 'prophetic',
        expertise: ['predictions', 'foresight', 'trends'],
      },
    };

    return personalities[agentType] || personalities.ANALYST;
  }
}