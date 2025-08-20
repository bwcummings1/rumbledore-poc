'use client';

/**
 * Agent Selector Component
 * 
 * Allows users to choose which AI agent to interact with,
 * displaying agent personalities and capabilities.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, 
  Gavel, 
  TrendingUp, 
  MessageSquare, 
  Sparkles,
  History,
  Eye,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Agent {
  id: string;
  type: string;
  name: string;
  description: string;
  avatar?: string;
  personality: {
    traits: string[];
    tone: string;
    expertise: string[];
    humor: string;
  };
  capabilities: string[];
  temperature: number;
  availability: string;
}

interface AgentSelectorProps {
  onSelect: (agent: Agent) => void;
  selectedAgentId?: string;
  leagueSandbox?: string;
  showMultiSelect?: boolean;
  onMultiSelect?: (agents: Agent[]) => void;
  className?: string;
}

const agentIcons: Record<string, React.ReactNode> = {
  commissioner: <Gavel className="w-5 h-5" />,
  analyst: <TrendingUp className="w-5 h-5" />,
  narrator: <Sparkles className="w-5 h-5" />,
  'trash-talker': <MessageSquare className="w-5 h-5" />,
  'betting-advisor': <Brain className="w-5 h-5" />,
  historian: <History className="w-5 h-5" />,
  oracle: <Eye className="w-5 h-5" />,
};

const agentColors: Record<string, string> = {
  commissioner: 'bg-blue-500',
  analyst: 'bg-green-500',
  narrator: 'bg-purple-500',
  'trash-talker': 'bg-red-500',
  'betting-advisor': 'bg-yellow-500',
  historian: 'bg-indigo-500',
  oracle: 'bg-pink-500',
};

export function AgentSelector({
  onSelect,
  selectedAgentId,
  leagueSandbox,
  showMultiSelect = false,
  onMultiSelect,
  className,
}: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    fetchAgents();
  }, [leagueSandbox]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (leagueSandbox) params.append('league', leagueSandbox);
      
      const response = await fetch(`/api/ai/agents?${params}`);
      const data = await response.json();
      setAgents(data.agents);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentClick = (agent: Agent) => {
    if (showMultiSelect) {
      const newSelected = new Set(selectedAgents);
      if (newSelected.has(agent.id)) {
        newSelected.delete(agent.id);
      } else {
        newSelected.add(agent.id);
      }
      setSelectedAgents(newSelected);
      
      if (onMultiSelect) {
        const selectedAgentsList = agents.filter(a => newSelected.has(a.id));
        onMultiSelect(selectedAgentsList);
      }
    } else {
      onSelect(agent);
    }
  };

  const isSelected = (agentId: string) => {
    if (showMultiSelect) {
      return selectedAgents.has(agentId);
    }
    return selectedAgentId === agentId;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Choose Your Agent</h3>
          {showMultiSelect && (
            <Badge variant="secondary">
              {selectedAgents.size} selected
            </Badge>
          )}
        </div>
        
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')}>
          <TabsList className="grid w-[200px] grid-cols-2">
            <TabsTrigger value="grid">Grid</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Agents Display */}
      <ScrollArea className="h-[600px] pr-4">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-lg',
                  isSelected(agent.id) && 'ring-2 ring-primary'
                )}
                onClick={() => handleAgentClick(agent)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={agent.avatar} alt={agent.name} />
                      <AvatarFallback className={agentColors[agent.id]}>
                        {agentIcons[agent.id]}
                      </AvatarFallback>
                    </Avatar>
                    {isSelected(agent.id) && (
                      <Badge variant="default" className="ml-auto">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-2">{agent.name}</CardTitle>
                  <CardDescription className="text-sm">
                    {agent.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Personality Traits
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {agent.personality.traits.slice(0, 3).map((trait) => (
                        <Badge key={trait} variant="outline" className="text-xs">
                          {trait}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Capabilities
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {agent.capabilities.slice(0, 2).map((cap) => (
                        <li key={cap} className="flex items-center gap-1">
                          <span className="w-1 h-1 bg-muted-foreground rounded-full" />
                          {cap}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Humor: {agent.personality.humor}
                    </span>
                    <span className="text-muted-foreground">
                      Temp: {agent.temperature}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  isSelected(agent.id) && 'ring-2 ring-primary'
                )}
                onClick={() => handleAgentClick(agent)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={agent.avatar} alt={agent.name} />
                      <AvatarFallback className={agentColors[agent.id]}>
                        {agentIcons[agent.id]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-semibold">{agent.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="hidden md:flex gap-1">
                      {agent.personality.traits.slice(0, 2).map((trait) => (
                        <Badge key={trait} variant="outline" className="text-xs">
                          {trait}
                        </Badge>
                      ))}
                    </div>
                    {isSelected(agent.id) && (
                      <Badge variant="default">Selected</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Multi-select Actions */}
      {showMultiSelect && selectedAgents.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <span className="text-sm">
            {selectedAgents.size} agent{selectedAgents.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedAgents(new Set());
                if (onMultiSelect) onMultiSelect([]);
              }}
            >
              Clear Selection
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const selected = agents.filter(a => selectedAgents.has(a.id));
                onSelect(selected[0]); // Or handle multi-select differently
              }}
            >
              Start Collaboration
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}