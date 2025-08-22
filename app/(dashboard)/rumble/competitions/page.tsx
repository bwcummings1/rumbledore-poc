'use client';

import { useState } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { CompetitionDashboard } from '@/components/competitions/competition-dashboard';
import { CompetitionBrowser } from '@/components/competitions/competition-browser';
import { Leaderboard } from '@/components/competitions/leaderboard';
import { AchievementDisplay } from '@/components/competitions/achievement-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Target, Users, Award, TrendingUp } from 'lucide-react';
import { useCompetitions, useUserCompetitions } from '@/hooks/api/use-competitions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLeagueContext } from '@/contexts/league-context';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { Skeleton } from '@/components/ui/skeleton';

export default function CompetitionsPage() {
  const [scope, setScope] = useState<'league' | 'platform'>('league');
  const { currentLeague } = useLeagueContext();
  const { data: competitions, isLoading } = useCompetitions(scope);
  const { data: userCompetitions } = useUserCompetitions();

  return (
    <DashboardPageLayout
      header={{
        title: 'Competitions',
        description: 'Multi-tier betting competitions and leaderboards',
        icon: Trophy,
        actions: (
          <div className="flex gap-2">
            <Button
              variant={scope === 'league' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScope('league')}
            >
              League
            </Button>
            <Button
              variant={scope === 'platform' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScope('platform')}
            >
              Platform
            </Button>
            <LeagueSwitcher />
          </div>
        ),
      }}
    >
      {scope === 'league' && !currentLeague ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No League Selected</h3>
            <p className="text-muted-foreground text-center mb-4">
              Select a league to view competitions
            </p>
            <LeagueSwitcher />
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">
              <Trophy className="h-4 w-4 mr-2" />
              Active
              {userCompetitions && userCompetitions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {userCompetitions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="browse">
              <Target className="h-4 w-4 mr-2" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="leaderboards">
              <TrendingUp className="h-4 w-4 mr-2" />
              Leaderboards
            </TabsTrigger>
            <TabsTrigger value="achievements">
              <Award className="h-4 w-4 mr-2" />
              Achievements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <CompetitionDashboard scope={scope} />
          </TabsContent>

          <TabsContent value="browse">
            <CompetitionBrowser scope={scope} />
          </TabsContent>

          <TabsContent value="leaderboards">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
              </div>
            ) : (
              <div className="space-y-4">
                {competitions && competitions.length > 0 ? (
                  competitions.map((comp: any) => (
                    <Leaderboard 
                      key={comp.id} 
                      competitionId={comp.id}
                      title={comp.name}
                    />
                  ))
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Users className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Active Competitions</h3>
                      <p className="text-muted-foreground text-center">
                        Browse available competitions to get started
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="achievements">
            <AchievementDisplay />
          </TabsContent>
        </Tabs>
      )}
    </DashboardPageLayout>
  );
}