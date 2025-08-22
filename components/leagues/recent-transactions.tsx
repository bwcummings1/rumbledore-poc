'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, UserPlus, UserMinus, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface RecentTransactionsProps {
  leagueId: string;
}

export function RecentTransactions({ leagueId }: RecentTransactionsProps) {
  // TODO: Add useTransactions hook when API is ready
  const transactions: any[] = []; // Placeholder
  const isLoading = false;

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'add':
        return <UserPlus className="h-4 w-4" />;
      case 'drop':
        return <UserMinus className="h-4 w-4" />;
      case 'trade':
        return <RefreshCw className="h-4 w-4" />;
      default:
        return <ArrowRight className="h-4 w-4" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'add':
        return <Badge className="bg-green-500/20 text-green-500">Add</Badge>;
      case 'drop':
        return <Badge className="bg-red-500/20 text-red-500">Drop</Badge>;
      case 'trade':
        return <Badge className="bg-blue-500/20 text-blue-500">Trade</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No recent transactions
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((transaction, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  {getTransactionIcon(transaction.type)}
                  <div>
                    <div className="text-sm font-medium">{transaction.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {transaction.team} • {transaction.date}
                    </div>
                  </div>
                </div>
                {getTransactionBadge(transaction.type)}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Link href={`/leagues/${leagueId}/transactions`}>
            <Button variant="outline" className="w-full" size="sm">
              View All Transactions
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}