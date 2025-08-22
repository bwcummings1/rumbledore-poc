'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';
import { useBankroll } from '@/hooks/api/use-betting';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function BankrollWidget() {
  const { currentLeague } = useLeagueContext();
  const { data: bankroll, isLoading } = useBankroll(currentLeague?.id || '');

  if (!currentLeague) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Bankroll
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a league to view bankroll</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Bankroll
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2" />
            <Skeleton className="h-6 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const balance = bankroll?.currentBalance || 1000;
  const profitLoss = bankroll?.profitLoss || 0;
  const roi = bankroll?.roi || 0;
  const progressValue = (balance / 1000) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Bankroll
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-3xl font-bold">${balance.toFixed(0)}</span>
              <div className="flex items-center gap-1">
                {profitLoss >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className={cn(
                  "text-sm font-medium",
                  profitLoss >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(0)}
                </span>
              </div>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">ROI</p>
              <p className={cn(
                "font-semibold",
                roi >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Win Rate</p>
              <p className="font-semibold">
                {bankroll?.totalBets > 0 
                  ? ((bankroll.wonBets / bankroll.totalBets) * 100).toFixed(1)
                  : '0'}%
              </p>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground">
            Week {bankroll?.week || 1} • {bankroll?.totalBets || 0} bets placed
          </div>
        </div>
      </CardContent>
    </Card>
  );
}