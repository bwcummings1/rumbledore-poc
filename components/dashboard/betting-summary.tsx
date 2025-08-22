'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useBankroll, useActiveBets } from '@/hooks/api/use-betting';
import { useLeagueContext } from '@/contexts/league-context';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Trophy,
  Target,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function BettingSummary() {
  const router = useRouter();
  const { currentLeague } = useLeagueContext();
  const { data: bankroll, isLoading: bankrollLoading } = useBankroll(currentLeague?.id || '');
  const { data: activeBets, isLoading: betsLoading } = useActiveBets(currentLeague?.id || '');

  if (!currentLeague) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Betting Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Select a league to view betting summary
          </div>
        </CardContent>
      </Card>
    );
  }

  if (bankrollLoading || betsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Betting Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const profitLoss = bankroll?.profitLoss || 0;
  const roi = bankroll?.roi || 0;
  const winRate = bankroll?.totalBets > 0 
    ? ((bankroll.wonBets / bankroll.totalBets) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4">
      {/* Bankroll Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Bankroll Overview</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.push('/rumble/betting')}
            >
              View Details
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-2xl font-bold">
                {bankroll?.currentBalance?.toFixed(0) || '1000'}
              </p>
              <Progress 
                value={(bankroll?.currentBalance || 1000) / 10} 
                className="mt-2"
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">P/L</p>
              <div className="flex items-center">
                <p className={cn(
                  "text-2xl font-bold",
                  profitLoss >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(0)}
                </p>
                {profitLoss >= 0 ? (
                  <TrendingUp className="h-4 w-4 ml-1 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 ml-1 text-red-500" />
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ROI</p>
              <p className={cn(
                "text-2xl font-bold",
                roi >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold">{winRate}%</p>
              <p className="text-xs text-muted-foreground">
                {bankroll?.wonBets || 0}-{bankroll?.lostBets || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Bets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active Bets</CardTitle>
            <Badge variant="outline">
              {activeBets?.length || 0} Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!activeBets || activeBets.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No active bets
            </div>
          ) : (
            <div className="space-y-3">
              {activeBets.slice(0, 3).map((bet: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center space-x-3">
                    <DollarSign className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">{bet.selection}</p>
                      <p className="text-xs text-muted-foreground">
                        {bet.marketType} • {bet.odds > 0 ? '+' : ''}{bet.odds}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">${bet.stake}</p>
                    <p className="text-xs text-muted-foreground">
                      To win ${bet.potentialPayout}
                    </p>
                  </div>
                </div>
              ))}
              {activeBets.length > 3 && (
                <Button 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => router.push('/rumble/betting')}
                >
                  View all {activeBets.length} bets
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}