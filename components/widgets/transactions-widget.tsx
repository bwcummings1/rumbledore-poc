'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Activity, UserPlus, UserMinus, ArrowUpDown } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

export function TransactionsWidget() {
  const { currentLeague } = useLeagueContext();
  
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', currentLeague?.id],
    queryFn: async () => {
      if (!currentLeague) return [];
      const { data } = await apiClient.leagues.transactions(currentLeague.id, { limit: 10 });
      return data;
    },
    enabled: !!currentLeague,
    refetchInterval: 60000, // Refresh every minute
  });

  if (!currentLeague) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a league to view activity</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTransactionIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'add':
        return <UserPlus className="h-3 w-3 text-green-500" />;
      case 'drop':
        return <UserMinus className="h-3 w-3 text-red-500" />;
      case 'trade':
        return <ArrowUpDown className="h-3 w-3 text-blue-500" />;
      default:
        return <Activity className="h-3 w-3 text-gray-500" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'add':
        return 'text-green-500';
      case 'drop':
        return 'text-red-500';
      case 'trade':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[250px]">
          {!transactions || transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent transactions
            </p>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction: any, index: number) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="mt-1">
                    {getTransactionIcon(transaction.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">
                      {transaction.team || 'Unknown Team'}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {transaction.description || transaction.player || 'Transaction'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.timestamp 
                        ? formatDistanceToNow(new Date(transaction.timestamp), { addSuffix: true })
                        : 'Recently'}
                    </p>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getTransactionColor(transaction.type)}`}
                  >
                    {transaction.type || 'Action'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}