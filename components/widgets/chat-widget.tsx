'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, Bot, User } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function ChatWidget() {
  const { currentLeague } = useLeagueContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    setIsLoading(true);

    try {
      // Simulate AI response (replace with actual API call)
      setTimeout(() => {
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `I can help you with ${currentLeague.name}! Try asking about standings, stats, or betting advice.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiResponse]);
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      toast.error('Failed to send message');
      setIsLoading(false);
    }
  };

  if (!currentLeague) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            AI Assistant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a league to chat with AI</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[400px]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          AI Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ScrollArea className="flex-1 pr-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Ask me anything about {currentLeague.name}!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-2',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-3 w-3" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg p-2 text-sm',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    {message.content}
                  </div>
                  {message.role === 'user' && (
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-3 w-3" />
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" />
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2 mt-4"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your league..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}