'use client';

/**
 * BetSlip Component - Manages bet selections and placement
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { X, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { formatAmericanOdds } from '@/types/betting';
import { useToast } from '@/components/ui/use-toast';

interface BetSlipSelection {
  gameId: string;
  eventDate: Date;
  marketType: string;
  selection: string;
  line?: number;
  odds: number;
  homeTeam?: string;
  awayTeam?: string;
}

interface BetSlipProps {
  leagueId: string;
  leagueSandbox: string;
  bankrollBalance?: number;
  onBetPlaced?: () => void;
}

export function BetSlip({ 
  leagueId, 
  leagueSandbox,
  bankrollBalance = 1000,
  onBetPlaced 
}: BetSlipProps) {
  const [selections, setSelections] = useState<BetSlipSelection[]>([]);
  const [stake, setStake] = useState<string>('10');
  const [betType, setBetType] = useState<'single' | 'parlay'>('single');
  const [potentialPayout, setPotentialPayout] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch bet slip from API
  useEffect(() => {
    fetchBetSlip();
  }, []);

  // Calculate potential payout when selections or stake change
  useEffect(() => {
    calculatePotentialPayout();
  }, [selections, stake, betType]);

  const fetchBetSlip = async () => {
    try {
      const response = await fetch(`/api/betting/slip?stake=${stake}&type=${betType}`);
      if (response.ok) {
        const data = await response.json();
        setSelections(data.selections || []);
        setPotentialPayout(data.potentialPayout || 0);
      }
    } catch (error) {
      console.error('Error fetching bet slip:', error);
    }
  };

  const calculatePotentialPayout = async () => {
    if (selections.length === 0 || !stake || parseFloat(stake) <= 0) {
      setPotentialPayout(0);
      return;
    }

    try {
      const response = await fetch(
        `/api/betting/slip?stake=${stake}&type=${betType}`
      );
      if (response.ok) {
        const data = await response.json();
        setPotentialPayout(data.potentialPayout);
      }
    } catch (error) {
      console.error('Error calculating payout:', error);
    }
  };

  const removeSelection = async (gameId: string, marketType: string) => {
    try {
      const response = await fetch(
        `/api/betting/slip?gameId=${gameId}&marketType=${marketType}`,
        { method: 'DELETE' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setSelections(data.selections);
        toast({
          title: 'Selection removed',
          description: 'Bet slip updated',
        });
      }
    } catch (error) {
      console.error('Error removing selection:', error);
    }
  };

  const clearBetSlip = async () => {
    try {
      const response = await fetch('/api/betting/slip', { method: 'DELETE' });
      if (response.ok) {
        setSelections([]);
        setPotentialPayout(0);
        toast({
          title: 'Bet slip cleared',
          description: 'All selections removed',
        });
      }
    } catch (error) {
      console.error('Error clearing bet slip:', error);
    }
  };

  const placeBet = async () => {
    if (selections.length === 0) {
      setError('No selections in bet slip');
      return;
    }

    const stakeAmount = parseFloat(stake);
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      setError('Invalid stake amount');
      return;
    }

    if (stakeAmount > bankrollBalance) {
      setError('Insufficient funds');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let response;
      
      if (betType === 'parlay' && selections.length > 1) {
        // Place parlay bet
        response = await fetch('/api/betting/bets/parlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leagueId,
            leagueSandbox,
            stake: stakeAmount,
            selections,
          }),
        });
      } else {
        // Place single bet(s)
        const promises = selections.map(selection =>
          fetch('/api/betting/bets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leagueId,
              leagueSandbox,
              gameId: selection.gameId,
              eventDate: selection.eventDate,
              betType: 'STRAIGHT',
              marketType: selection.marketType,
              selection: selection.selection,
              line: selection.line,
              odds: selection.odds,
              stake: betType === 'single' ? stakeAmount / selections.length : stakeAmount,
            }),
          })
        );
        
        const results = await Promise.all(promises);
        response = results[0]; // Check first response
      }

      if (response.ok) {
        toast({
          title: 'Bet placed successfully!',
          description: `Potential payout: $${potentialPayout.toFixed(2)}`,
        });
        
        // Clear bet slip
        await clearBetSlip();
        
        // Notify parent component
        if (onBetPlaced) {
          onBetPlaced();
        }
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to place bet');
      }
    } catch (error: any) {
      setError('Error placing bet. Please try again.');
      console.error('Error placing bet:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderSelection = (selection: BetSlipSelection, index: number) => (
    <div key={`${selection.gameId}-${selection.marketType}`} className="space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {selection.homeTeam && selection.awayTeam
              ? `${selection.awayTeam} @ ${selection.homeTeam}`
              : selection.selection}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {selection.marketType}
            </Badge>
            {selection.line && (
              <span className="text-xs text-muted-foreground">
                Line: {selection.line > 0 ? `+${selection.line}` : selection.line}
              </span>
            )}
            <span className="text-xs font-medium">
              {formatAmericanOdds(selection.odds)}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => removeSelection(selection.gameId, selection.marketType)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {index < selections.length - 1 && <Separator />}
    </div>
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Bet Slip</CardTitle>
          {selections.length > 0 && (
            <Badge variant="outline">{selections.length} selections</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {selections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No selections in bet slip</p>
            <p className="text-sm mt-1">Add bets from the odds board</p>
          </div>
        ) : (
          <>
            {/* Bet Type Tabs */}
            {selections.length > 1 && (
              <Tabs value={betType} onValueChange={(v) => setBetType(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="single">Single Bets</TabsTrigger>
                  <TabsTrigger value="parlay">Parlay</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {/* Selections */}
            <ScrollArea className="h-[200px]">
              <div className="space-y-3">
                {selections.map((selection, index) => renderSelection(selection, index))}
              </div>
            </ScrollArea>

            {/* Stake Input */}
            <div className="space-y-2">
              <Label htmlFor="stake">Stake Amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="stake"
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  min="1"
                  max="500"
                  step="1"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Balance: ${bankrollBalance.toFixed(2)} | Min: $1 | Max: $500
              </p>
            </div>

            {/* Potential Payout */}
            <div className="space-y-2 p-3 bg-secondary rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm">Potential Payout</span>
                <span className="text-lg font-bold">
                  ${potentialPayout.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Potential Profit</span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  ${(potentialPayout - parseFloat(stake || '0')).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={clearBetSlip}
                disabled={loading}
                className="flex-1"
              >
                Clear Slip
              </Button>
              <Button
                onClick={placeBet}
                disabled={loading || selections.length === 0}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Placing...
                  </>
                ) : (
                  'Place Bet'
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}