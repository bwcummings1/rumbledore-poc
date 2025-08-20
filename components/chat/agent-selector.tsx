'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Grid3x3,
  List,
  Check,
  Bot,
  Crown,
  TrendingUp,
  BookOpen,
  Flame,
  DollarSign,
  ScrollText,
  Eye,
} from 'lucide-react';

export interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  emoji: string;
  color: string;
  temperature: number;
  specialties: string[];
  tools: string[];
  available: boolean;
}

interface AgentSelectorProps {
  agents?: Agent[];
  selectedAgents?: string[];
  onSelectAgent?: (agentId: string) => void;
  onSummonAgent?: (agentId: string) => void;
  multiSelect?: boolean;
  viewMode?: 'grid' | 'list';
  className?: string;
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'commissioner',
    name: 'Commissioner',
    type: 'COMMISSIONER',
    description: 'The league authority who provides official rulings and manages disputes.',
    emoji: '👔',
    color: 'bg-blue-500',
    temperature: 0.6,
    specialties: ['Rules & Regulations', 'Dispute Resolution', 'League Management'],
    tools: ['League Rules', 'Historical Precedents', 'Official Rulings'],
    available: true,
  },
  {
    id: 'analyst',
    name: 'Analyst',
    type: 'ANALYST',
    description: 'Data-driven expert providing statistical insights and strategic analysis.',
    emoji: '📊',
    color: 'bg-green-500',
    temperature: 0.4,
    specialties: ['Statistical Analysis', 'Performance Metrics', 'Trend Analysis'],
    tools: ['Player Stats', 'Team Performance', 'Advanced Metrics'],
    available: true,
  },
  {
    id: 'narrator',
    name: 'Narrator',
    type: 'NARRATOR',
    description: 'Epic storyteller who brings league action to life with dramatic flair.',
    emoji: '📖',
    color: 'bg-purple-500',
    temperature: 0.8,
    specialties: ['Game Recaps', 'Season Narratives', 'Epic Storytelling'],
    tools: ['Game History', 'Player Stories', 'Dramatic Context'],
    available: true,
  },
  {
    id: 'trash-talker',
    name: 'Trash Talker',
    type: 'TRASH_TALKER',
    description: 'The savage roaster who delivers hilarious burns and spicy takes.',
    emoji: '🔥',
    color: 'bg-red-500',
    temperature: 0.9,
    specialties: ['Roasting', 'Memes', 'Savage Commentary'],
    tools: ['Team Records', 'Embarrassing Stats', 'Meme Generator'],
    available: true,
  },
  {
    id: 'betting-advisor',
    name: 'Betting Advisor',
    type: 'BETTING_ADVISOR',
    description: 'Strategic advisor for odds analysis and betting recommendations.',
    emoji: '💰',
    color: 'bg-yellow-500',
    temperature: 0.3,
    specialties: ['Odds Analysis', 'Risk Assessment', 'Betting Strategy'],
    tools: ['Live Odds', 'Historical Performance', 'Risk Calculator'],
    available: true,
  },
  {
    id: 'historian',
    name: 'League Historian',
    type: 'HISTORIAN',
    description: 'Keeper of league lore with deep knowledge of past seasons.',
    emoji: '📚',
    color: 'bg-indigo-500',
    temperature: 0.5,
    specialties: ['Historical Context', 'Record Books', 'Season Comparisons'],
    tools: ['Historical Data', 'Record Database', 'Season Archives'],
    available: true,
  },
  {
    id: 'oracle',
    name: 'League Oracle',
    type: 'ORACLE',
    description: 'Mystical predictor of future outcomes and upset alerts.',
    emoji: '🔮',
    color: 'bg-pink-500',
    temperature: 0.6,
    specialties: ['Game Predictions', 'Upset Detection', 'Season Forecasting'],
    tools: ['Prediction Models', 'Trend Analysis', 'Crystal Ball'],
    available: true,
  },
];

const getAgentIcon = (type: string) => {
  const icons: Record<string, any> = {
    COMMISSIONER: Crown,
    ANALYST: TrendingUp,
    NARRATOR: BookOpen,
    TRASH_TALKER: Flame,
    BETTING_ADVISOR: DollarSign,
    HISTORIAN: ScrollText,
    ORACLE: Eye,
  };
  return icons[type] || Bot;
};

export function AgentSelector({
  agents = DEFAULT_AGENTS,
  selectedAgents = [],
  onSelectAgent,
  onSummonAgent,
  multiSelect = false,
  viewMode: initialViewMode = 'grid',
  className,
}: AgentSelectorProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const handleAgentClick = (agentId: string) => {
    if (onSelectAgent) {
      onSelectAgent(agentId);
    }
  };

  const handleSummonClick = (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSummonAgent) {
      onSummonAgent(agentId);
    }
  };

  const isSelected = (agentId: string) => selectedAgents.includes(agentId);

  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {agents.map((agent) => {
        const Icon = getAgentIcon(agent.type);
        const selected = isSelected(agent.id);
        
        return (
          <Card
            key={agent.id}
            className={cn(
              'cursor-pointer transition-all duration-200 hover:shadow-lg',
              selected && 'ring-2 ring-primary',
              !agent.available && 'opacity-50 cursor-not-allowed',
              className
            )}
            onClick={() => agent.available && handleAgentClick(agent.id)}
            onMouseEnter={() => setHoveredAgent(agent.id)}
            onMouseLeave={() => setHoveredAgent(null)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl',
                  agent.color
                )}>
                  {agent.emoji}
                </div>
                {selected && (
                  <Badge variant="default" className="gap-1">
                    <Check className="h-3 w-3" />
                    Selected
                  </Badge>
                )}
              </div>
              <CardTitle className="mt-3 flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {agent.name}
              </CardTitle>
              <CardDescription className="text-xs">
                {agent.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium mb-1">Specialties:</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.specialties.slice(0, 2).map((specialty) => (
                      <Badge key={specialty} variant="secondary" className="text-xs">
                        {specialty}
                      </Badge>
                    ))}
                    {agent.specialties.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{agent.specialties.length - 2}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {hoveredAgent === agent.id && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Temperature: {agent.temperature}
                      </span>
                      <span className="text-muted-foreground">
                        {agent.tools.length} tools
                      </span>
                    </div>
                  </div>
                )}
                
                {agent.available && onSummonAgent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={(e) => handleSummonClick(agent.id, e)}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Summon
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  const renderListView = () => (
    <div className="space-y-2">
      {agents.map((agent) => {
        const Icon = getAgentIcon(agent.type);
        const selected = isSelected(agent.id);
        
        return (
          <Card
            key={agent.id}
            className={cn(
              'cursor-pointer transition-all duration-200',
              selected && 'ring-2 ring-primary',
              !agent.available && 'opacity-50 cursor-not-allowed'
            )}
            onClick={() => agent.available && handleAgentClick(agent.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0',
                  agent.color
                )}>
                  {agent.emoji}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4" />
                    <h4 className="font-medium">{agent.name}</h4>
                    {selected && (
                      <Badge variant="default" className="gap-1 ml-auto">
                        <Check className="h-3 w-3" />
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {agent.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      {agent.specialties.length} specialties
                    </span>
                    <span className="text-muted-foreground">
                      {agent.tools.length} tools
                    </span>
                    <span className="text-muted-foreground">
                      Temp: {agent.temperature}
                    </span>
                  </div>
                </div>
                
                {agent.available && onSummonAgent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleSummonClick(agent.id, e)}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Summon
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Select AI Agent</h3>
          <p className="text-sm text-muted-foreground">
            {multiSelect ? 'Select multiple agents for collaboration' : 'Choose an agent to assist you'}
          </p>
        </div>
        
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')}>
          <TabsList>
            <TabsTrigger value="grid">
              <Grid3x3 className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="list">
              <List className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {viewMode === 'grid' ? renderGridView() : renderListView()}
      
      {multiSelect && selectedAgents.length > 0 && (
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-2">
            Selected Agents ({selectedAgents.length}):
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedAgents.map((agentId) => {
              const agent = agents.find(a => a.id === agentId);
              if (!agent) return null;
              return (
                <Badge key={agentId} variant="secondary">
                  {agent.emoji} {agent.name}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}