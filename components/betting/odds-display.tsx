/**
 * Odds Display Component
 * 
 * Displays current betting odds for NFL games with:
 * - Moneyline, spread, and total markets
 * - Multiple bookmaker comparison
 * - Line movement indicators
 * - Mobile responsive design
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowUpIcon, 
  ArrowDownIcon, 
  TrendingUpIcon,
  TrendingDownIcon,
  RefreshCwIcon,
  AlertCircleIcon
} from 'lucide-react';
import { GameOdds, formatAmericanOdds } from '@/types/betting';
import { cn } from '@/lib/utils';

interface OddsDisplayProps {
  gameId?: string;
  refreshInterval?: number;
  showMovement?: boolean;
  className?: string;
}

export function OddsDisplay({ 
  gameId, 
  refreshInterval = 300000, // 5 minutes
  showMovement = true,
  className 
}: OddsDisplayProps) {
  const [odds, setOdds] = useState<GameOdds[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedMarket, setSelectedMarket] = useState<'moneyline' | 'spread' | 'total'>('spread');

  // Fetch odds data
  const fetchOdds = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (gameId) params.append('gameId', gameId);
      params.append('includeMovements', showMovement.toString());

      const response = await fetch(`/api/odds/nfl?${params}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch odds');
      }

      setOdds(data.data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Set up auto-refresh
  useEffect(() => {
    fetchOdds();

    const interval = setInterval(fetchOdds, refreshInterval);
    return () => clearInterval(interval);
  }, [gameId, refreshInterval]);

  // Format team name for display
  const formatTeamName = (name: string): string => {
    const shortNames: Record<string, string> = {
      'Arizona Cardinals': 'ARI',
      'Atlanta Falcons': 'ATL',
      'Baltimore Ravens': 'BAL',
      'Buffalo Bills': 'BUF',
      'Carolina Panthers': 'CAR',
      'Chicago Bears': 'CHI',
      'Cincinnati Bengals': 'CIN',
      'Cleveland Browns': 'CLE',
      'Dallas Cowboys': 'DAL',
      'Denver Broncos': 'DEN',
      'Detroit Lions': 'DET',
      'Green Bay Packers': 'GB',
      'Houston Texans': 'HOU',
      'Indianapolis Colts': 'IND',
      'Jacksonville Jaguars': 'JAX',
      'Kansas City Chiefs': 'KC',
      'Las Vegas Raiders': 'LV',
      'Los Angeles Chargers': 'LAC',
      'Los Angeles Rams': 'LAR',
      'Miami Dolphins': 'MIA',
      'Minnesota Vikings': 'MIN',
      'New England Patriots': 'NE',
      'New Orleans Saints': 'NO',
      'New York Giants': 'NYG',
      'New York Jets': 'NYJ',
      'Philadelphia Eagles': 'PHI',
      'Pittsburgh Steelers': 'PIT',
      'San Francisco 49ers': 'SF',
      'Seattle Seahawks': 'SEA',
      'Tampa Bay Buccaneers': 'TB',
      'Tennessee Titans': 'TEN',
      'Washington Commanders': 'WAS'
    };
    return shortNames[name] || name;
  };

  // Render loading state
  if (loading && odds.length === 0) {
    return (
      <Card className={cn('animate-pulse', className)}>
        <CardHeader>
          <CardTitle>Loading Odds...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card className={cn('border-destructive', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircleIcon className="h-5 w-5" />
            Error Loading Odds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
          <Button onClick={fetchOdds} className="mt-4" variant="outline">
            <RefreshCwIcon className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Render no data state
  if (odds.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>No Odds Available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No odds data available at this time.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">NFL Betting Odds</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            Last update: {lastUpdate.toLocaleTimeString()}
          </Badge>
          <Button onClick={fetchOdds} size="sm" variant="outline">
            <RefreshCwIcon className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <Tabs value={selectedMarket} onValueChange={(v) => setSelectedMarket(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="spread">Spread</TabsTrigger>
          <TabsTrigger value="moneyline">Moneyline</TabsTrigger>
          <TabsTrigger value="total">Total</TabsTrigger>
        </TabsList>

        {odds.map((game) => (
          <Card key={game.gameId} className="mt-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {formatTeamName(game.awayTeam)} @ {formatTeamName(game.homeTeam)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {new Date(game.commenceTime).toLocaleDateString()} • {new Date(game.commenceTime).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <TabsContent value="spread" className="mt-0">
                {game.spread ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">{formatTeamName(game.awayTeam)}</h4>
                      <div className="text-2xl font-bold">
                        {game.spread.away.line > 0 && '+'}{game.spread.away.line}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatAmericanOdds(game.spread.away.odds)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">{formatTeamName(game.homeTeam)}</h4>
                      <div className="text-2xl font-bold">
                        {game.spread.home.line > 0 && '+'}{game.spread.home.line}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatAmericanOdds(game.spread.home.odds)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No spread available</p>
                )}
              </TabsContent>

              <TabsContent value="moneyline" className="mt-0">
                {game.moneyline ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">{formatTeamName(game.awayTeam)}</h4>
                      <div className="text-2xl font-bold">
                        {formatAmericanOdds(game.moneyline.away.odds)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {(game.moneyline.away.impliedProbability * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">{formatTeamName(game.homeTeam)}</h4>
                      <div className="text-2xl font-bold">
                        {formatAmericanOdds(game.moneyline.home.odds)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {(game.moneyline.home.impliedProbability * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No moneyline available</p>
                )}
              </TabsContent>

              <TabsContent value="total" className="mt-0">
                {game.total ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold">{game.total.line}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium">Over</h4>
                        <div className="text-xl font-semibold">
                          {formatAmericanOdds(game.total.over.odds)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {(game.total.over.impliedProbability * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-medium">Under</h4>
                        <div className="text-xl font-semibold">
                          {formatAmericanOdds(game.total.under.odds)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {(game.total.under.impliedProbability * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No total available</p>
                )}
              </TabsContent>

              {/* Bookmaker comparison */}
              {game.bookmakers.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Bookmakers ({game.bookmakers.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {game.bookmakers.map((book) => (
                      <Badge key={book.key} variant="secondary">
                        {book.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </Tabs>
    </div>
  );
}