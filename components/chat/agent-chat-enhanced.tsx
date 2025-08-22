'use client';

import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '@/providers/websocket-provider';
import { useLeagueContext } from '@/contexts/league-context';
import { AgentSelector } from '@/components/ai/agent-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Bot, Loader2, Sparkles, Info, User } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export function AgentChatEnhanced() {
  const { currentLeague } = useLeagueContext();
  const { socket, subscribe, unsubscribe, emit } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('commissioner');
  const [streamingContent, setStreamingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to chat events
    const handleMessage = (data: any) => {
      if (data.isStreaming) {
        setStreamingContent(prev => prev + data.chunk);
      } else {
        const newMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.content || streamingContent,
          agent: data.agent || selectedAgent,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, newMessage]);
        setStreamingContent('');
        setIsTyping(false);
      }
    };

    const handleTyping = (data: any) => {
      setIsTyping(data.isTyping);
    };

    const handleError = (error: any) => {
      toast.error(error.message || 'Chat error occurred');
      setIsTyping(false);
      setStreamingContent('');
    };

    const handleStreamStart = () => {
      setStreamingContent('');
      setIsTyping(true);
    };

    const handleStreamEnd = () => {
      if (streamingContent) {
        const newMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: streamingContent,
          agent: selectedAgent,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, newMessage]);
        setStreamingContent('');
      }
      setIsTyping(false);
    };

    subscribe('chat:message', handleMessage);
    subscribe('chat:typing', handleTyping);
    subscribe('chat:error', handleError);
    subscribe('chat:stream:start', handleStreamStart);
    subscribe('chat:stream:chunk', (data: any) => {
      setStreamingContent(prev => prev + data.chunk);
    });
    subscribe('chat:stream:end', handleStreamEnd);

    // Join league room
    if (currentLeague && socket) {
      socket.emit('join:league', { leagueId: currentLeague.id });
    }

    return () => {
      unsubscribe('chat:message', handleMessage);
      unsubscribe('chat:typing', handleTyping);
      unsubscribe('chat:error', handleError);
      unsubscribe('chat:stream:start', handleStreamStart);
      unsubscribe('chat:stream:chunk', () => {});
      unsubscribe('chat:stream:end', handleStreamEnd);
      
      if (currentLeague && socket) {
        socket.emit('leave:league', { leagueId: currentLeague.id });
      }
    };
  }, [currentLeague, socket, subscribe, unsubscribe, selectedAgent, streamingContent]);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    if (!input.trim() || !currentLeague) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      // Send via WebSocket for real-time streaming
      if (socket && socket.connected) {
        socket.emit('chat:send', {
          message: input,
          agentType: selectedAgent,
          leagueId: currentLeague.id,
          stream: true, // Enable streaming
        });
      } else {
        // Fallback to API
        const { data } = await apiClient.ai.chat(
          input,
          selectedAgent,
          currentLeague.id
        );
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.response,
          agent: selectedAgent,
          timestamp: new Date(),
        }]);
        setIsTyping(false);
      }
    } catch (error) {
      toast.error('Failed to send message');
      setIsTyping(false);
    }
  };

  const getAgentColor = (agent: string) => {
    switch (agent) {
      case 'commissioner':
        return 'bg-blue-500';
      case 'analyst':
        return 'bg-green-500';
      case 'narrator':
        return 'bg-purple-500';
      case 'trash-talker':
        return 'bg-red-500';
      case 'betting-advisor':
        return 'bg-yellow-500';
      case 'historian':
        return 'bg-indigo-500';
      case 'oracle':
        return 'bg-pink-500';
      default:
        return 'bg-gray-500';
    }
  };

  const commandSuggestions = [
    '/help - Show available commands',
    '/stats - Get league statistics',
    '/standings - Show current standings',
    '/matchup - View current matchup',
    '/betting - Get betting advice',
    '/history - League history info',
    '/predict - Get predictions',
    '/roast [team] - Roast a team',
    '/recap - Weekly recap',
    '/news - Latest news',
  ];

  const handleCommandClick = (command: string) => {
    setInput(command.split(' - ')[0]);
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <span className="font-medium">AI Assistant</span>
            {currentLeague && (
              <Badge variant="outline" className="text-xs">
                {currentLeague.name}
              </Badge>
            )}
          </div>
          <AgentSelector
            value={selectedAgent}
            onValueChange={setSelectedAgent}
          />
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Start a Conversation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Ask {selectedAgent} anything about your league!
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {commandSuggestions.slice(0, 3).map((cmd, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => handleCommandClick(cmd)}
                  >
                    {cmd.split(' - ')[0]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={getAgentColor(message.agent || selectedAgent)}>
                    <Bot className="h-4 w-4 text-white" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div
                className={cn(
                  'max-w-[70%] rounded-lg p-3',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium capitalize">
                      {message.agent || selectedAgent}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>

              {message.role === 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          
          {/* Streaming content */}
          {streamingContent && (
            <div className="flex gap-3 justify-start">
              <Avatar className="h-8 w-8">
                <AvatarFallback className={getAgentColor(selectedAgent)}>
                  <Bot className="h-4 w-4 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-[70%] rounded-lg p-3 bg-muted">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium capitalize">
                    {selectedAgent}
                  </span>
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
                <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
              </div>
            </div>
          )}
          
          {/* Typing indicator */}
          {isTyping && !streamingContent && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{selectedAgent} is thinking...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Command suggestions */}
      {input.startsWith('/') && (
        <div className="px-4 py-2 border-t border-b bg-muted/50">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>Available commands:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {commandSuggestions
              .filter(cmd => cmd.toLowerCase().includes(input.toLowerCase()))
              .slice(0, 5)
              .map((cmd, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="h-auto py-1 px-2 text-xs"
                  onClick={() => handleCommandClick(cmd)}
                >
                  {cmd}
                </Button>
              ))}
          </div>
        </div>
      )}

      <div className="p-4 border-t">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={currentLeague 
              ? `Ask ${selectedAgent} about ${currentLeague.name}...`
              : `Select a league to chat with ${selectedAgent}...`}
            disabled={isTyping || !currentLeague}
          />
          <Button 
            type="submit" 
            disabled={!input.trim() || isTyping || !currentLeague}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}