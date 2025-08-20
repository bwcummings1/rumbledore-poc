'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  Send, 
  Bot, 
  Sparkles, 
  ChevronDown,
  Command,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { CommandParser } from '@/lib/ai/chat/command-parser';
import { format } from 'date-fns';

interface AgentMessage {
  id: string;
  type: 'user' | 'agent' | 'system' | 'command';
  agentType?: string;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  streamingChunks?: string[];
  toolsUsed?: string[];
  error?: string;
}

interface AgentChatProps {
  socket: Socket;
  leagueSandbox: string;
  sessionId?: string;
  className?: string;
}

const AGENT_AVATARS: Record<string, { emoji: string; color: string }> = {
  COMMISSIONER: { emoji: '👔', color: 'bg-blue-500' },
  ANALYST: { emoji: '📊', color: 'bg-green-500' },
  NARRATOR: { emoji: '📖', color: 'bg-purple-500' },
  TRASH_TALKER: { emoji: '🔥', color: 'bg-red-500' },
  BETTING_ADVISOR: { emoji: '💰', color: 'bg-yellow-500' },
  HISTORIAN: { emoji: '📚', color: 'bg-indigo-500' },
  ORACLE: { emoji: '🔮', color: 'bg-pink-500' },
};

export function AgentChat({ socket, leagueSandbox, sessionId: initialSessionId, className }: AgentChatProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(initialSessionId || `session-${Date.now()}`);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandParser = useRef(new CommandParser());

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Connection events
    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Agent events
    socket.on('agent:response', (data) => {
      const newMessage: AgentMessage = {
        id: `msg-${Date.now()}`,
        type: 'agent',
        agentType: data.agentType,
        content: data.message,
        timestamp: new Date(data.timestamp),
        toolsUsed: data.toolsUsed,
      };
      setMessages(prev => [...prev, newMessage]);
      setIsTyping(false);
      setActiveAgent(data.agentType);
    });

    socket.on('agent:typing', (data) => {
      if (data.sessionId === sessionId) {
        setIsTyping(true);
        setActiveAgent(data.agentType);
      }
    });

    socket.on('agent:typing:stop', () => {
      setIsTyping(false);
    });

    // Streaming events
    socket.on('agent:stream:chunk', (data) => {
      if (data.sessionId === sessionId) {
        setStreamingMessage(prev => (prev || '') + data.chunk);
        setActiveAgent(data.agentType);
      }
    });

    socket.on('agent:stream:end', (data) => {
      if (data.sessionId === sessionId && streamingMessage) {
        const newMessage: AgentMessage = {
          id: `msg-${Date.now()}`,
          type: 'agent',
          agentType: data.agentType,
          content: streamingMessage,
          timestamp: new Date(),
          toolsUsed: data.toolsUsed,
        };
        setMessages(prev => [...prev, newMessage]);
        setStreamingMessage(null);
        setIsTyping(false);
      }
    });

    // Command events
    socket.on('agent:command:result', (data) => {
      const newMessage: AgentMessage = {
        id: `cmd-${Date.now()}`,
        type: 'command',
        agentType: data.result.agent,
        content: data.result.response,
        timestamp: new Date(data.timestamp),
      };
      setMessages(prev => [...prev, newMessage]);
    });

    // Error events
    socket.on('agent:error', (data) => {
      setError(data.error);
      setIsTyping(false);
      
      const errorMessage: AgentMessage = {
        id: `err-${Date.now()}`,
        type: 'system',
        content: data.error,
        timestamp: new Date(),
        error: data.code,
      };
      setMessages(prev => [...prev, errorMessage]);
    });

    // Agent arrival/dismissal
    socket.on('agent:arrived', (data) => {
      const arrivalMessage: AgentMessage = {
        id: `arrival-${Date.now()}`,
        type: 'system',
        content: `${data.agentType} has joined the chat!`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, arrivalMessage]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('agent:response');
      socket.off('agent:typing');
      socket.off('agent:typing:stop');
      socket.off('agent:stream:chunk');
      socket.off('agent:stream:end');
      socket.off('agent:command:result');
      socket.off('agent:error');
      socket.off('agent:arrived');
    };
  }, [socket, sessionId, streamingMessage]);

  // Handle input changes and command suggestions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    
    // Check for command suggestions
    if (value.startsWith('/')) {
      const allCommands = commandParser.current.getAllCommands();
      const suggestions = allCommands
        .map(cmd => cmd.command)
        .filter(cmd => cmd.startsWith(value))
        .slice(0, 5);
      setCommandSuggestions(suggestions);
    } else {
      setCommandSuggestions([]);
    }
  };

  // Send message
  const sendMessage = useCallback(() => {
    if (!input.trim() || !isConnected) return;

    const messageContent = input.trim();
    
    // Add user message immediately
    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: messageContent,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Check if it's a command
    if (messageContent.startsWith('/')) {
      const parsed = commandParser.current.parse(messageContent);
      
      if (!parsed.isValid) {
        const errorMessage: AgentMessage = {
          id: `err-${Date.now()}`,
          type: 'system',
          content: parsed.error || 'Invalid command',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setInput('');
        return;
      }

      // Send command to server
      socket.emit('agent:command', {
        command: parsed.command,
        args: parsed.args,
        leagueSandbox,
        sessionId,
      });
    } else {
      // Regular message - send to active agent or default
      socket.emit('agent:message', {
        message: messageContent,
        agentType: activeAgent || 'ANALYST',
        leagueSandbox,
        sessionId,
        streaming: true, // Enable streaming by default
      });
    }

    setInput('');
    setCommandSuggestions([]);
  }, [input, isConnected, socket, leagueSandbox, sessionId, activeAgent]);

  // Handle enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Render message
  const renderMessage = (message: AgentMessage) => {
    const isUser = message.type === 'user';
    const isAgent = message.type === 'agent';
    const isSystem = message.type === 'system';
    const isCommand = message.type === 'command';
    
    if (isSystem) {
      return (
        <div key={message.id} className="flex justify-center my-2">
          <Badge variant="secondary" className="text-xs">
            {message.content}
          </Badge>
        </div>
      );
    }

    return (
      <div
        key={message.id}
        className={cn(
          'flex gap-3 mb-4',
          isUser && 'flex-row-reverse'
        )}
      >
        {!isUser && (
          <Avatar className="h-8 w-8">
            {isAgent && message.agentType && (
              <AvatarFallback className={cn(
                'text-white',
                AGENT_AVATARS[message.agentType]?.color || 'bg-gray-500'
              )}>
                {AGENT_AVATARS[message.agentType]?.emoji || '🤖'}
              </AvatarFallback>
            )}
            {isCommand && (
              <AvatarFallback className="bg-gray-700">
                <Command className="h-4 w-4" />
              </AvatarFallback>
            )}
          </Avatar>
        )}
        
        <div className={cn(
          'flex flex-col max-w-[70%]',
          isUser && 'items-end'
        )}>
          {isAgent && message.agentType && (
            <span className="text-xs text-muted-foreground mb-1">
              {message.agentType.replace('_', ' ')}
            </span>
          )}
          
          <Card className={cn(
            'px-4 py-2',
            isUser && 'bg-primary text-primary-foreground',
            !isUser && 'bg-muted'
          )}>
            <p className="text-sm whitespace-pre-wrap">
              {message.content}
            </p>
            
            {message.toolsUsed && message.toolsUsed.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <span className="text-xs opacity-70">
                  Tools: {message.toolsUsed.join(', ')}
                </span>
              </div>
            )}
          </Card>
          
          <span className="text-xs text-muted-foreground mt-1">
            {format(message.timestamp, 'HH:mm')}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <h3 className="font-semibold">AI Agent Chat</h3>
          {activeAgent && (
            <Badge variant="outline">
              {activeAgent.replace('_', ' ')}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="default" className="text-xs">
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">
              Disconnected
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Sparkles className="h-12 w-12 mb-4" />
            <p className="text-sm">Start a conversation with an AI agent</p>
            <p className="text-xs mt-2">Type /help to see available commands</p>
          </div>
        )}
        
        {messages.map(renderMessage)}
        
        {streamingMessage && (
          <div className="flex gap-3 mb-4">
            <Avatar className="h-8 w-8">
              <AvatarFallback className={cn(
                'text-white',
                activeAgent && AGENT_AVATARS[activeAgent]?.color || 'bg-gray-500'
              )}>
                {activeAgent && AGENT_AVATARS[activeAgent]?.emoji || '🤖'}
              </AvatarFallback>
            </Avatar>
            <Card className="px-4 py-2 bg-muted max-w-[70%]">
              <p className="text-sm whitespace-pre-wrap">
                {streamingMessage}
                <span className="inline-block w-2 h-4 ml-1 bg-foreground animate-pulse" />
              </p>
            </Card>
          </div>
        )}
        
        {isTyping && !streamingMessage && (
          <div className="flex gap-3 mb-4">
            <Avatar className="h-8 w-8">
              <AvatarFallback className={cn(
                'text-white',
                activeAgent && AGENT_AVATARS[activeAgent]?.color || 'bg-gray-500'
              )}>
                {activeAgent && AGENT_AVATARS[activeAgent]?.emoji || '🤖'}
              </AvatarFallback>
            </Avatar>
            <Card className="px-4 py-2 bg-muted">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  {activeAgent?.replace('_', ' ')} is typing...
                </span>
              </div>
            </Card>
          </div>
        )}
        
        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-destructive/10 rounded-lg">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Command suggestions */}
      {commandSuggestions.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {commandSuggestions.map(cmd => (
              <Badge
                key={cmd}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => {
                  setInput(cmd + ' ');
                  inputRef.current?.focus();
                  setCommandSuggestions([]);
                }}
              >
                {cmd}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message or /help for commands..."
            disabled={!isConnected}
            className="flex-1"
          />
          <Button 
            onClick={sendMessage} 
            size="icon"
            disabled={!isConnected || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}