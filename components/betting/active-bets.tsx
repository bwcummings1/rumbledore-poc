'use client';

/**
 * ActiveBets Component - Displays user's pending and live bets
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Clock, 
  TrendingUp, 
  AlertCircle,
  X,
  RefreshCw,
  Zap,
  Layers
} from 'lucide-react';
import { BetInfo, formatAmericanOdds } from '@/types/betting';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

interface ActiveBetsProps {
  leagueId: string;
  onBetCancelled?: () => void;
  autoRefresh?: boolean;
}

export function ActiveBets({ 
  leagueId,
  onBetCancelled,
  autoRefresh = true
}: ActiveBetsProps) {
  const [bets, setBets] = useState<BetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingBetId, setCancellingBetId] = useState<string | null>(null);
  const [betToCancel, setBetToCancel] = useState<BetInfo | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchActiveBets();
    
    // Auto-refresh every 30 seconds if enabled
    if (autoRefresh) {
      const interval = setInterval(fetchActiveBets, 30000);
      return () => clearInterval(interval);
    }
  }, [leagueId, autoRefresh]);

  const fetchActiveBets = async () => {
    try {
      const response = await fetch(
        `/api/betting/bets?leagueId=${leagueId}&status=active`
      );
      
      if (response.ok) {
        const data = await response.json();
        setBets(data);
        setError(null);
      } else {
        throw new Error('Failed to fetch active bets');
      }
    } catch (err) {
      console.error('Error fetching active bets:', err);
      setError('Failed to load active bets');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBet = async (bet: BetInfo) => {
    setBetToCancel(bet);
  };

  const confirmCancelBet = async () => {
    if (!betToCancel) return;

    setCancellingBetId(betToCancel.id);
    
    try {
      const response = await fetch(`/api/betting/bets/${betToCancel.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Bet cancelled',
          description: 'Your bet has been cancelled and stake refunded.',
        });
        
        // Remove bet from list
        setBets(prev => prev.filter(b => b.id !== betToCancel.id));
        
        // Notify parent
        if (onBetCancelled) {
          onBetCancelled();
        }
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel bet');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to cancel bet',
        variant: 'destructive',
      });
    } finally {
      setCancellingBetId(null);
      setBetToCancel(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'LIVE':
        return <Badge variant="default"><Zap className="h-3 w-3 mr-1" />Live</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMarketTypeLabel = (marketType: string) => {
    switch (marketType) {
      case 'H2H':
        return 'Moneyline';
      case 'SPREADS':
        return 'Spread';
      case 'TOTALS':
        return 'Total';
      default:
        return marketType;
    }
  };

  const renderBet = (bet: BetInfo) => {
    const isParlay = bet.betType === 'PARLAY';
    const canCancel = bet.status === 'PENDING' && new Date(bet.eventDate) > new Date();

    return (
      <div
        key={bet.id}
        className="p-4 border rounded-lg space-y-3 hover:bg-secondary/50 transition-colors"
      >
        {/* Bet Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isParlay && (
                <Badge variant="outline" className="text-xs">
                  <Layers className="h-3 w-3 mr-1" />
                  Parlay
                </Badge>
              )}
              {getStatusBadge(bet.status)}
            </div>
            <p className="font-medium text-sm">
              {bet.selection}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {getMarketTypeLabel(bet.marketType)}
              </Badge>
              {bet.line && (
                <span className="text-xs text-muted-foreground">
                  Line: {bet.line > 0 ? `+${bet.line}` : bet.line}
                </span>
              )}
              <span className="text-xs font-medium">
                {formatAmericanOdds(bet.odds)}
              </span>
            </div>
          </div>
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleCancelBet(bet)}
              disabled={cancellingBetId === bet.id}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Bet Details */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Stake</p>
            <p className="font-medium">${bet.stake.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Potential Payout</p>
            <p className="font-medium flex items-center gap-1">
              ${bet.potentialPayout.toFixed(2)}
              <TrendingUp className="h-3 w-3 text-green-600" />
            </p>
          </div>
        </div>

        {/* Event Time */}
        <div className="text-xs text-muted-foreground">
          <Clock className="h-3 w-3 inline mr-1" />
          {format(new Date(bet.eventDate), 'MMM d, h:mm a')}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Active Bets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Active Bets
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{bets.length} active</Badge>
              <Button
                onClick={fetchActiveBets}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : bets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No active bets</p>
              <p className="text-sm mt-1">Place a bet to get started</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {bets.map(bet => renderBet(bet))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!betToCancel} onOpenChange={() => setBetToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Bet?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this bet? Your stake of $
              {betToCancel?.stake.toFixed(2)} will be refunded to your bankroll.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Bet</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelBet}>
              Cancel Bet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}