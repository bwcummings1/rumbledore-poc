'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStandings } from '@/hooks/api/use-leagues';
import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface StandingsCardProps {
  leagueId: string;
  compact?: boolean;
}

export function StandingsCard({ leagueId, compact = false }: StandingsCardProps) {
  const { data: standings, isLoading } = useStandings(leagueId);

  const displayStandings = compact ? standings?.slice(0, 6) : standings;

  return (
    <Card className={compact ? 'h-[400px] flex flex-col' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Standings</CardTitle>
          {compact && (
            <Link href={`/leagues/${leagueId}/standings`}>
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className={compact ? 'flex-1 overflow-auto' : ''}>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(compact ? 6 : 10)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-center">W-L</TableHead>
                <TableHead className="text-right">PF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayStandings?.map((team: any, index: number) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                      {index + 1}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{team.name}</div>
                    <div className="text-xs text-muted-foreground">{team.owner}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    {team.wins || 0}-{team.losses || 0}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {team.pointsFor?.toFixed(1) || '0.0'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}