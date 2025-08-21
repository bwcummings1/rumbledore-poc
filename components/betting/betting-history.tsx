'use client';

/**
 * BettingHistory Component - Displays user's settled betting history
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  History, 
  TrendingUp, 
  TrendingDown,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Download
} from 'lucide-react';
import { BetInfo, formatAmericanOdds } from '@/types/betting';
import { format } from 'date-fns';

interface BettingHistoryProps {
  leagueId: string;
  limit?: number;
}

export function BettingHistory({ 
  leagueId,
  limit = 50
}: BettingHistoryProps) {
  const [bets, setBets] = useState<BetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'won' | 'lost' | 'push'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'payout'>('date');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchBettingHistory();
  }, [leagueId, page]);

  const fetchBettingHistory = async () => {
    setLoading(true);
    
    try {
      const response = await fetch(
        `/api/betting/bets?leagueId=${leagueId}&status=history&limit=${limit}&offset=${page * limit}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (page === 0) {
          setBets(data);
        } else {
          setBets(prev => [...prev, ...data]);
        }
        setHasMore(data.length === limit);
      }
    } catch (err) {
      console.error('Error fetching betting history:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportHistory = () => {
    // Create CSV content
    const headers = ['Date', 'Type', 'Selection', 'Market', 'Odds', 'Stake', 'Result', 'Payout'];
    const rows = filteredBets.map(bet => [
      format(new Date(bet.settledAt || bet.createdAt), 'yyyy-MM-dd'),
      bet.betType,
      bet.selection,
      bet.marketType,
      formatAmericanOdds(bet.odds),
      bet.stake.toFixed(2),
      bet.result || '',
      (bet.actualPayout || 0).toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `betting-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getResultIcon = (result?: string) => {
    switch (result) {
      case 'WIN':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'LOSS':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'PUSH':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getResultBadge = (result?: string) => {
    switch (result) {
      case 'WIN':
        return <Badge className="bg-green-600">Won</Badge>;
      case 'LOSS':
        return <Badge variant="destructive">Lost</Badge>;
      case 'PUSH':
        return <Badge variant="secondary">Push</Badge>;
      case 'VOID':
        return <Badge variant="outline">Void</Badge>;
      default:
        return <Badge variant="outline">{result}</Badge>;
    }
  };

  const filteredBets = bets.filter(bet => {
    if (filter === 'all') return true;
    if (filter === 'won') return bet.result === 'WIN';
    if (filter === 'lost') return bet.result === 'LOSS';
    if (filter === 'push') return bet.result === 'PUSH';
    return true;
  });

  const sortedBets = [...filteredBets].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.settledAt || b.createdAt).getTime() - 
             new Date(a.settledAt || a.createdAt).getTime();
    }
    if (sortBy === 'payout') {
      return (b.actualPayout || 0) - (a.actualPayout || 0);
    }
    return 0;
  });

  const calculateStats = () => {
    const won = bets.filter(b => b.result === 'WIN').length;
    const lost = bets.filter(b => b.result === 'LOSS').length;
    const push = bets.filter(b => b.result === 'PUSH').length;
    const totalStaked = bets.reduce((sum, b) => sum + b.stake, 0);
    const totalPayout = bets.reduce((sum, b) => sum + (b.actualPayout || 0), 0);
    const profit = totalPayout - totalStaked;

    return { won, lost, push, totalStaked, totalPayout, profit };
  };

  const stats = calculateStats();

  if (loading && page === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Betting History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Betting History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              onClick={exportHistory}
              variant="outline"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              onClick={() => {
                setPage(0);
                fetchBettingHistory();
              }}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistics */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-secondary rounded-lg">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Record</p>
            <p className="text-sm font-semibold">
              {stats.won}-{stats.lost}-{stats.push}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-sm font-semibold">
              {bets.length > 0 
                ? ((stats.won / bets.length) * 100).toFixed(1)
                : '0.0'}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Profit/Loss</p>
            <p className={`text-sm font-semibold flex items-center justify-center gap-1 ${
              stats.profit >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {stats.profit >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              ${Math.abs(stats.profit).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
              <SelectItem value="push">Push</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="payout">Payout</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bet History Table */}
        {sortedBets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No betting history</p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Selection</TableHead>
                    <TableHead>Odds</TableHead>
                    <TableHead>Stake</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBets.map((bet) => (
                    <TableRow key={bet.id}>
                      <TableCell className="text-xs">
                        {format(new Date(bet.settledAt || bet.createdAt), 'MMM d')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{bet.selection}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {bet.marketType}
                            </Badge>
                            {bet.line && (
                              <span className="text-xs text-muted-foreground">
                                {bet.line > 0 ? `+${bet.line}` : bet.line}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatAmericanOdds(bet.odds)}
                      </TableCell>
                      <TableCell className="text-sm">
                        ${bet.stake.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {getResultBadge(bet.result)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {getResultIcon(bet.result)}
                          <span className={`text-sm font-medium ${
                            bet.result === 'WIN' ? 'text-green-600' : ''
                          }`}>
                            ${(bet.actualPayout || 0).toFixed(2)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            
            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => setPage(prev => prev + 1)}
                  variant="outline"
                  disabled={loading}
                >
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}