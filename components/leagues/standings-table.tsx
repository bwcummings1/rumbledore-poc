'use client';

import { useState } from 'react';
import { useStandings } from '@/hooks/api/use-leagues';
import { ResponsiveTable, ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowUp, ArrowDown, Minus, Trophy, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface StandingsTableProps {
  leagueId: string;
  compact?: boolean;
}

// Extend the basic standings data with additional fields
interface ExtendedStanding {
  id: string;
  name: string;
  owner?: string;
  logo?: string;
  abbrev?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  standing?: number;
  playoffSeed?: number;
  streak?: { type: 'W' | 'L'; count: number };
  trend?: number;
  isPlayoffTeam?: boolean;
  isEliminated?: boolean;
  clinched?: boolean;
}

export function StandingsTable({ leagueId, compact = false }: StandingsTableProps) {
  const { data: standings, isLoading } = useStandings(leagueId);
  const [sortField, setSortField] = useState<'wins' | 'points'>('wins');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(compact ? 6 : 10)].map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  // Transform and enhance standings data
  const enhancedStandings: ExtendedStanding[] = (standings || []).map((team: any, index: number) => ({
    ...team,
    streak: team.streak || { type: 'W' as 'W' | 'L', count: 0 },
    trend: team.trend || 0,
    isPlayoffTeam: index < 6, // Top 6 teams make playoffs
    isEliminated: false,
    clinched: false,
  }));

  const sortedStandings = [...enhancedStandings].sort((a, b) => {
    const field = sortField === 'wins' ? 'wins' : 'pointsFor';
    return sortOrder === 'desc' 
      ? (b[field] || 0) - (a[field] || 0)
      : (a[field] || 0) - (b[field] || 0);
  });

  const renderTrend = (trend: number) => {
    if (trend > 0) return <ArrowUp className="h-4 w-4 text-green-500" />;
    if (trend < 0) return <ArrowDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const renderStreak = (streak: { type: 'W' | 'L'; count: number }) => {
    const className = streak.type === 'W' ? 'text-green-500' : 'text-red-500';
    return (
      <span className={cn('font-medium', className)}>
        {streak.count}{streak.type}
      </span>
    );
  };

  // Define columns for responsive table
  const columns: ResponsiveTableColumn<ExtendedStanding>[] = compact ? [
    {
      key: 'rank',
      label: 'Rank',
      priority: 1,
      className: 'w-[60px]',
      render: (_, team) => {
        const index = sortedStandings.indexOf(team);
        return (
          <div className="flex items-center gap-1">
            {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
            {index + 1}
          </div>
        );
      },
    },
    {
      key: 'team',
      label: 'Team',
      priority: 1,
      render: (_, team) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={team.logo} />
            <AvatarFallback>{team.abbrev || team.name?.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <span className="truncate max-w-[150px]">{team.name}</span>
        </div>
      ),
    },
    {
      key: 'record',
      label: 'W-L',
      priority: 1,
      align: 'center',
      render: (_, team) => (
        <span>
          {team.wins}-{team.losses}
          {team.ties > 0 && `-${team.ties}`}
        </span>
      ),
    },
    {
      key: 'pointsFor',
      label: 'PF',
      priority: 2,
      align: 'right',
      render: (value) => value?.toFixed(1) || '0.0',
    },
  ] : [
    {
      key: 'rank',
      label: 'Rank',
      priority: 1,
      className: 'w-[60px]',
      render: (_, team) => {
        const index = sortedStandings.indexOf(team);
        return (
          <div className="flex items-center gap-1">
            {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
            {team.isPlayoffTeam && index > 0 && <Target className="h-3 w-3 text-blue-500" />}
            {index + 1}
          </div>
        );
      },
    },
    {
      key: 'team',
      label: 'Team',
      priority: 1,
      render: (_, team) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={team.logo} />
            <AvatarFallback>{team.abbrev || team.name?.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{team.name}</div>
            {team.owner && (
              <div className="text-xs text-muted-foreground">{team.owner}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'record',
      label: 'Record',
      priority: 1,
      align: 'center',
      render: (_, team) => (
        <span className="font-medium">
          {team.wins}-{team.losses}
          {team.ties > 0 && `-${team.ties}`}
        </span>
      ),
    },
    {
      key: 'winPct',
      label: 'Win %',
      priority: 3,
      align: 'center',
      render: (_, team) => {
        const total = team.wins + team.losses + team.ties;
        const pct = total > 0 ? (team.wins + team.ties * 0.5) / total : 0;
        return <span>{(pct * 100).toFixed(1)}%</span>;
      },
    },
    {
      key: 'pointsFor',
      label: 'PF',
      priority: 2,
      align: 'right',
      render: (value) => value?.toFixed(1) || '0.0',
    },
    {
      key: 'pointsAgainst',
      label: 'PA',
      priority: 3,
      align: 'right',
      render: (value) => value?.toFixed(1) || '0.0',
    },
    {
      key: 'diff',
      label: 'Diff',
      priority: 2,
      align: 'right',
      render: (_, team) => {
        const diff = (team.pointsFor || 0) - (team.pointsAgainst || 0);
        return (
          <span className={cn(
            'font-medium',
            diff > 0 && 'text-green-500',
            diff < 0 && 'text-red-500'
          )}>
            {diff > 0 && '+'}{diff.toFixed(1)}
          </span>
        );
      },
    },
    {
      key: 'streak',
      label: 'Streak',
      priority: 3,
      align: 'center',
      render: (_, team) => renderStreak(team.streak),
    },
    {
      key: 'trend',
      label: 'Trend',
      priority: 3,
      align: 'center',
      render: (_, team) => renderTrend(team.trend),
    },
  ];

  // Mobile card renderer
  const mobileCard = (team: ExtendedStanding) => {
    const index = sortedStandings.indexOf(team);
    const diff = (team.pointsFor || 0) - (team.pointsAgainst || 0);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
              {team.isPlayoffTeam && index > 0 && <Target className="h-3 w-3 text-blue-500" />}
              <span className="font-bold text-lg">#{index + 1}</span>
            </div>
            <Avatar className="h-8 w-8">
              <AvatarImage src={team.logo} />
              <AvatarFallback>{team.abbrev || team.name?.substring(0, 2)}</AvatarFallback>
            </Avatar>
          </div>
          <Badge variant={team.isPlayoffTeam ? 'default' : 'secondary'}>
            {team.wins}-{team.losses}
            {team.ties > 0 && `-${team.ties}`}
          </Badge>
        </div>
        
        <div>
          <div className="font-medium">{team.name}</div>
          {team.owner && (
            <div className="text-xs text-muted-foreground">{team.owner}</div>
          )}
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Points For/Against</span>
          <span>
            {team.pointsFor?.toFixed(1)} / {team.pointsAgainst?.toFixed(1)}
          </span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Differential</span>
          <span className={cn(
            'font-medium',
            diff > 0 && 'text-green-500',
            diff < 0 && 'text-red-500'
          )}>
            {diff > 0 && '+'}{diff.toFixed(1)}
          </span>
        </div>
        
        {team.streak && team.streak.count > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Streak</span>
            {renderStreak(team.streak)}
          </div>
        )}
      </div>
    );
  };

  if (compact) {
    return (
      <ResponsiveTable
        columns={columns}
        data={sortedStandings.slice(0, 6)}
        mobileCard={mobileCard}
        keyExtractor={(team) => team.id}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            variant={sortField === 'wins' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortField('wins')}
          >
            By Record
          </Button>
          <Button
            variant={sortField === 'points' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortField('points')}
          >
            By Points
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
        >
          {sortOrder === 'desc' ? 'Highest First' : 'Lowest First'}
        </Button>
      </div>

      <ResponsiveTable
        columns={columns}
        data={sortedStandings}
        mobileCard={mobileCard}
        keyExtractor={(team) => team.id}
      />
    </div>
  );
}