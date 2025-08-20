# Sprint 11: Chat Integration

## Sprint Overview
Integrate AI agents into the chat system for real-time, context-aware interactions with league members.

**Duration**: 2 weeks (Week 7-8 of Phase 3)  
**Dependencies**: Sprint 10 (Content Pipeline) must be complete  
**Risk Level**: Medium - Real-time performance and context management

## Implementation Guide

### Chat Agent Integration

```typescript
// /lib/ai/chat/chat-manager.ts
import { AgentFactory } from '../agent-factory';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';

export class ChatAgentManager {
  private io: Server;
  private redis: Redis;
  private activeSessions = new Map<string, ChatSession>();

  constructor(io: Server) {
    this.io = io;
    this.redis = new Redis(process.env.REDIS_URL!);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      socket.on('agent:message', async (data) => {
        await this.handleAgentMessage(socket, data);
      });

      socket.on('agent:command', async (data) => {
        await this.handleAgentCommand(socket, data);
      });

      socket.on('agent:summon', async (data) => {
        await this.summonAgent(socket, data);
      });
    });
  }

  private async handleAgentMessage(socket: Socket, data: any) {
    const { message, agentType, leagueSandbox, sessionId } = data;

    // Get or create session
    const session = this.getOrCreateSession(sessionId, socket.id, leagueSandbox);

    // Get agent
    const agent = AgentFactory.getAgent(agentType, leagueSandbox);
    if (!agent) {
      socket.emit('agent:error', { error: 'Agent not available' });
      return;
    }

    // Process message with rate limiting
    if (!this.checkRateLimit(socket.id)) {
      socket.emit('agent:error', { error: 'Rate limit exceeded' });
      return;
    }

    // Send typing indicator
    socket.emit('agent:typing', { agentType });

    try {
      // Get context
      const context = await this.buildChatContext(leagueSandbox, session);

      // Process message
      const response = await agent.processMessage(message, sessionId, context);

      // Send response
      socket.emit('agent:response', {
        agentType,
        message: response.response,
        toolsUsed: response.toolsUsed,
        timestamp: new Date(),
      });

      // Update session
      session.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });
      session.messages.push({
        role: 'assistant',
        agent: agentType,
        content: response.response,
        timestamp: new Date(),
      });

    } catch (error) {
      socket.emit('agent:error', { error: 'Failed to process message' });
    }
  }

  private async handleAgentCommand(socket: Socket, data: any) {
    const { command, args, leagueSandbox } = data;

    const commands = {
      '/analyze': this.analyzeCommand,
      '/predict': this.predictCommand,
      '/roast': this.roastCommand,
      '/recap': this.recapCommand,
    };

    const handler = commands[command];
    if (handler) {
      const result = await handler.call(this, args, leagueSandbox);
      socket.emit('agent:command-result', result);
    } else {
      socket.emit('agent:error', { error: 'Unknown command' });
    }
  }

  private async summonAgent(socket: Socket, data: any) {
    const { agentType, leagueSandbox, reason } = data;

    // Broadcast agent arrival
    this.io.to(`league:${leagueSandbox}`).emit('agent:arrived', {
      agentType,
      message: `${agentType} has joined the chat!`,
      reason,
    });

    // Initialize agent in room
    const agent = AgentFactory.createAgent({
      id: `${agentType}-${leagueSandbox}`,
      type: agentType as any,
      leagueSandbox,
      personality: this.getAgentPersonality(agentType),
    });

    // Agent introduction
    const intro = await agent.processMessage(
      'Introduce yourself to the league',
      `summon-${Date.now()}`
    );

    socket.emit('agent:response', {
      agentType,
      message: intro.response,
      isIntroduction: true,
    });
  }

  private getOrCreateSession(
    sessionId: string,
    socketId: string,
    leagueSandbox: string
  ): ChatSession {
    if (!this.activeSessions.has(sessionId)) {
      this.activeSessions.set(sessionId, {
        id: sessionId,
        socketId,
        leagueSandbox,
        messages: [],
        startedAt: new Date(),
      });
    }
    return this.activeSessions.get(sessionId)!;
  }

  private checkRateLimit(socketId: string): boolean {
    // Implement rate limiting logic
    return true;
  }

  private async buildChatContext(leagueSandbox: string, session: ChatSession) {
    // Get recent chat messages
    const recentMessages = await this.getRecentChatMessages(leagueSandbox);

    // Get current matchups
    const currentMatchups = await this.getCurrentMatchups(leagueSandbox);

    return {
      recentMessages,
      currentMatchups,
      sessionHistory: session.messages.slice(-5),
    };
  }

  private getAgentPersonality(agentType: string): any {
    const personalities = {
      analyst: {
        traits: ['analytical', 'data-driven', 'strategic'],
        tone: 'professional',
        expertise: ['statistics', 'trends', 'predictions'],
      },
      comedian: {
        traits: ['witty', 'playful', 'entertaining'],
        tone: 'humorous',
        expertise: ['jokes', 'roasts', 'memes'],
      },
      historian: {
        traits: ['knowledgeable', 'nostalgic', 'detailed'],
        tone: 'informative',
        expertise: ['history', 'records', 'comparisons'],
      },
      oracle: {
        traits: ['mysterious', 'confident', 'visionary'],
        tone: 'prophetic',
        expertise: ['predictions', 'insights', 'foresight'],
      },
    };

    return personalities[agentType] || personalities.analyst;
  }

  // Command handlers
  private async analyzeCommand(args: string[], leagueSandbox: string) {
    const analyst = AgentFactory.getAgent('analyst', leagueSandbox);
    const analysis = await analyst?.processMessage(
      `Analyze ${args.join(' ')}`,
      `cmd-${Date.now()}`
    );
    return analysis;
  }

  private async predictCommand(args: string[], leagueSandbox: string) {
    const oracle = AgentFactory.getAgent('oracle', leagueSandbox);
    const prediction = await oracle?.processMessage(
      `Predict ${args.join(' ')}`,
      `cmd-${Date.now()}`
    );
    return prediction;
  }

  private async roastCommand(args: string[], leagueSandbox: string) {
    const comedian = AgentFactory.getAgent('comedian', leagueSandbox);
    const roast = await comedian?.processMessage(
      `Roast ${args.join(' ')}`,
      `cmd-${Date.now()}`
    );
    return roast;
  }

  private async recapCommand(args: string[], leagueSandbox: string) {
    const analyst = AgentFactory.getAgent('analyst', leagueSandbox);
    const recap = await analyst?.processMessage(
      'Provide a brief recap of the current week',
      `cmd-${Date.now()}`
    );
    return recap;
  }

  private async getRecentChatMessages(leagueSandbox: string) {
    // Fetch recent chat messages from database
    return [];
  }

  private async getCurrentMatchups(leagueSandbox: string) {
    // Fetch current week matchups
    return [];
  }
}

interface ChatSession {
  id: string;
  socketId: string;
  leagueSandbox: string;
  messages: any[];
  startedAt: Date;
}
```

### React Chat Components

```tsx
// /components/chat/agent-chat.tsx
'use client';

import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send } from 'lucide-react';

interface AgentChatProps {
  socket: Socket;
  leagueSandbox: string;
  currentAgent?: string;
}

export function AgentChat({ socket, leagueSandbox, currentAgent = 'analyst' }: AgentChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    socket.on('agent:response', (data) => {
      setMessages(prev => [...prev, {
        type: 'agent',
        ...data,
      }]);
      setIsTyping(false);
    });

    socket.on('agent:typing', () => {
      setIsTyping(true);
    });

    socket.on('agent:error', (data) => {
      console.error('Agent error:', data);
      setIsTyping(false);
    });

    return () => {
      socket.off('agent:response');
      socket.off('agent:typing');
      socket.off('agent:error');
    };
  }, [socket]);

  const sendMessage = () => {
    if (!input.trim()) return;

    // Add user message
    setMessages(prev => [...prev, {
      type: 'user',
      content: input,
      timestamp: new Date(),
    }]);

    // Send to agent
    socket.emit('agent:message', {
      message: input,
      agentType: currentAgent,
      leagueSandbox,
      sessionId: `session-${Date.now()}`,
    });

    setInput('');
  };

  const getAgentAvatar = (agentType: string) => {
    const avatars = {
      analyst: '📊',
      comedian: '😄',
      historian: '📚',
      oracle: '🔮',
    };
    return avatars[agentType] || '🤖';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.type === 'agent' && (
              <Avatar className="mr-2">
                <AvatarFallback>
                  {getAgentAvatar(msg.agentType)}
                </AvatarFallback>
              </Avatar>
            )}
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.type === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {msg.type === 'agent' && (
                <p className="text-xs font-semibold mb-1">
                  {msg.agentType}
                </p>
              )}
              <p className="whitespace-pre-wrap">{msg.content || msg.message}</p>
              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <p className="text-xs mt-2 opacity-70">
                  Used: {msg.toolsUsed.join(', ')}
                </p>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Bot className="h-4 w-4" />
            <span className="text-sm">Agent is typing...</span>
          </div>
        )}
      </div>

      <div className="border-t p-4">
        <div className="flex space-x-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask the agent anything..."
          />
          <Button onClick={sendMessage} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Success Criteria
- [ ] Chat integration complete
- [ ] Real-time responses working
- [ ] Context awareness demonstrated
- [ ] Commands functional
- [ ] Rate limiting effective
- [ ] User experience smooth
