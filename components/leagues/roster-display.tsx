'use client';

import { useState } from 'react';
import { useRoster } from '@/hooks/api/use-teams';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ResponsiveTable, ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Plus,
  Minus,
  ArrowUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RosterDisplayProps {
  leagueId: string;
  teamId: string;
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K', 'BENCH', 'IR'];

interface Player {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  team: string;
  position: string;
  lineupSlot?: string;
  image?: string;
  injuryStatus?: string;
  opponent?: string;
  projectedPoints: number;
  actualPoints?: number;
}

export function RosterDisplay({ leagueId, teamId }: RosterDisplayProps) {
  const { data: roster, isLoading } = useRoster(leagueId, teamId);
  const [view, setView] = useState<'lineup' | 'bench' | 'all'>('lineup');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading roster...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Mock player data for now (will be replaced with real data)
  const mockPlayers: Player[] = roster?.players || [];

  const groupedPlayers = mockPlayers.reduce((acc, player) => {
    const position = player.lineupSlot || 'BENCH';
    if (!acc[position]) acc[position] = [];
    acc[position].push(player);
    return acc;
  }, {} as Record<string, Player[]>);

  const renderPlayerStatus = (player: Player) => {
    if (player.injuryStatus === 'OUT') {
      return <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> OUT
      </Badge>;
    }
    if (player.injuryStatus === 'QUESTIONABLE') {
      return <Badge variant="secondary" className="gap-1">Q</Badge>;
    }
    if (player.injuryStatus === 'DOUBTFUL') {
      return <Badge variant="secondary" className="gap-1">D</Badge>;
    }
    return null;
  };

  // Define columns for responsive table
  const columns: ResponsiveTableColumn<Player>[] = [
    {
      key: 'player',
      label: 'Player',
      priority: 1,
      render: (_, player) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={player.image} />
            <AvatarFallback>
              {player.firstName?.[0]}{player.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{player.name}</div>
            <div className="text-xs text-muted-foreground">
              {player.position} - {player.team}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 2,
      align: 'center',
      render: (_, player) => renderPlayerStatus(player),
    },
    {
      key: 'opponent',
      label: 'Opponent',
      priority: 3,
      align: 'center',
      render: (_, player) => (
        <span className="text-sm">
          {player.opponent || '-'}
        </span>
      ),
    },
    {
      key: 'projected',
      label: 'Proj',
      priority: 1,
      align: 'right',
      render: (_, player) => renderProjection(player.projectedPoints, player.actualPoints),
    },
    {
      key: 'actual',
      label: 'Actual',
      priority: 2,
      align: 'right',
      render: (_, player) => (
        <span className="font-medium">
          {player.actualPoints?.toFixed(1) || '-'}
        </span>
      ),
    },
  ];

  // Mobile card renderer
  const mobileCard = (player: Player) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={player.image} />
            <AvatarFallback>
              {player.firstName?.[0]}{player.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium text-sm">{player.name}</div>
            <div className="text-xs text-muted-foreground">
              {player.position} - {player.team}
            </div>
          </div>
        </div>
        {renderPlayerStatus(player)}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Opponent</span>
        <span>{player.opponent || '-'}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Projected/Actual</span>
        <div className="flex gap-2">
          <span>{player.projectedPoints.toFixed(1)}</span>
          {player.actualPoints && (
            <>
              <span>/</span>
              <span className="font-medium">{player.actualPoints.toFixed(1)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderProjection = (projected: number, actual?: number) => {
    if (actual !== undefined) {
      const diff = actual - projected;
      const color = diff > 0 ? 'text-green-500' : 'text-red-500';
      return (
        <div className="text-right">
          <div className="font-medium">{actual.toFixed(1)}</div>
          <div className={cn('text-xs', color)}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
          </div>
        </div>
      );
    }
    return <div className="text-right text-muted-foreground">{projected.toFixed(1)}</div>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Roster</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Player
            </Button>
            <Button variant="outline" size="sm">
              <ArrowUpDown className="h-4 w-4 mr-1" /> Optimize
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="lineup">Starting Lineup</TabsTrigger>
            <TabsTrigger value="bench">Bench</TabsTrigger>
            <TabsTrigger value="all">All Players</TabsTrigger>
          </TabsList>

          <TabsContent value="lineup" className="mt-4">
            <div className="space-y-4">
              {POSITION_ORDER.filter(pos => pos !== 'BENCH' && pos !== 'IR').map(position => (
                <div key={position} className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">
                    {position}
                  </div>
                  {groupedPlayers[position]?.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={player.image} />
                          <AvatarFallback>
                            {player.firstName?.[0]}{player.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{player.name}</span>
                            {renderPlayerStatus(player)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {player.team} • {player.position} 
                            {player.opponent && ` • vs ${player.opponent}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {renderProjection(player.projectedPoints, player.actualPoints)}
                        <Button variant="ghost" size="sm">
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(!groupedPlayers[position] || groupedPlayers[position].length === 0) && (
                    <div className="p-3 rounded-lg border border-dashed text-center text-muted-foreground">
                      Empty slot
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bench" className="mt-4">
            <div className="space-y-2">
              {groupedPlayers['BENCH']?.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={player.image} />
                      <AvatarFallback>
                        {player.firstName?.[0]}{player.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.name}</span>
                        <Badge variant="outline">{player.position}</Badge>
                        {renderPlayerStatus(player)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {player.team} {player.opponent && ` • vs ${player.opponent}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {renderProjection(player.projectedPoints)}
                    <Button variant="ghost" size="sm">
                      <TrendingUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )) || (
                <div className="text-center py-8 text-muted-foreground">
                  No bench players
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <ResponsiveTable
              columns={columns}
              data={mockPlayers}
              mobileCard={mobileCard}
              keyExtractor={(player) => player.id}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}