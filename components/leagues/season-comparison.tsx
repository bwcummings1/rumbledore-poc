'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSeasonComparison } from '@/hooks/api/use-league-history';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useState } from 'react';

interface SeasonComparisonProps {
  leagueId: string;
}

export function SeasonComparison({ leagueId }: SeasonComparisonProps) {
  const { data: seasons, isLoading } = useSeasonComparison(leagueId);
  const [selectedSeason1, setSelectedSeason1] = useState('2023');
  const [selectedSeason2, setSelectedSeason2] = useState('2022');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Season Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const mockSeasonData = {
    '2023': {
      avgScore: 112.5,
      highScore: 185.4,
      lowScore: 62.3,
      totalTrades: 24,
      totalTransactions: 312,
      champion: 'Dynasty Builders',
    },
    '2022': {
      avgScore: 108.2,
      highScore: 172.8,
      lowScore: 58.9,
      totalTrades: 18,
      totalTransactions: 287,
      champion: 'Fantasy Legends',
    },
  };

  const season1 = mockSeasonData[selectedSeason1 as keyof typeof mockSeasonData];
  const season2 = mockSeasonData[selectedSeason2 as keyof typeof mockSeasonData];

  const renderComparison = (label: string, value1: number | string, value2: number | string) => {
    const isNumeric = typeof value1 === 'number' && typeof value2 === 'number';
    let trend = null;
    
    if (isNumeric) {
      const diff = value1 - value2;
      if (diff > 0) trend = <TrendingUp className="h-4 w-4 text-green-500" />;
      else if (diff < 0) trend = <TrendingDown className="h-4 w-4 text-red-500" />;
      else trend = <Minus className="h-4 w-4 text-muted-foreground" />;
    }

    return (
      <div className="grid grid-cols-3 gap-4 p-3 rounded-lg border">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-center">
          <div className="font-medium">{value1}</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="font-medium">{value2}</span>
            {trend}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Season Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select value={selectedSeason1} onValueChange={setSelectedSeason1}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2023">2023 Season</SelectItem>
                <SelectItem value="2022">2022 Season</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedSeason2} onValueChange={setSelectedSeason2}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2023">2023 Season</SelectItem>
                <SelectItem value="2022">2022 Season</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {season1 && season2 && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-4 p-2 border-b font-medium">
                <div>Metric</div>
                <div className="text-center">{selectedSeason1}</div>
                <div className="text-center">{selectedSeason2}</div>
              </div>
              
              {renderComparison('Avg Score', season1.avgScore, season2.avgScore)}
              {renderComparison('High Score', season1.highScore, season2.highScore)}
              {renderComparison('Low Score', season1.lowScore, season2.lowScore)}
              {renderComparison('Total Trades', season1.totalTrades, season2.totalTrades)}
              {renderComparison('Transactions', season1.totalTransactions, season2.totalTransactions)}
              {renderComparison('Champion', season1.champion, season2.champion)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}