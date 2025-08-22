'use client';

import DashboardPageLayout from "@/components/dashboard/layout";
import { LeagueSwitcher } from "@/components/leagues/league-switcher";
import { BettingDashboard } from "@/components/betting/betting-dashboard";
import { BetSlip } from "@/components/betting/bet-slip";
import { OddsDisplay } from "@/components/betting/odds-display";
import { ActiveBets } from "@/components/betting/active-bets";
import { BettingHistory } from "@/components/betting/betting-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Activity, History, TrendingUp } from "lucide-react";
import { useLeagueContext } from "@/contexts/league-context";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BettingPage() {
  const { currentLeague } = useLeagueContext();
  const { data: session } = useSession();

  if (!currentLeague) {
    return (
      <DashboardPageLayout
        header={{
          title: "Paper Betting",
          description: "Select a league to start betting",
          icon: DollarSign,
          actions: <LeagueSwitcher />,
        }}
      >
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No League Selected</h3>
            <p className="text-muted-foreground text-center mb-4">
              Select a league from the switcher above to access betting features.
            </p>
            <LeagueSwitcher />
          </CardContent>
        </Card>
      </DashboardPageLayout>
    );
  }

  if (!session?.user) {
    return (
      <DashboardPageLayout
        header={{
          title: "Paper Betting",
          description: "Login to place bets",
          icon: DollarSign,
          actions: <LeagueSwitcher />,
        }}
      >
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Login Required</h3>
            <p className="text-muted-foreground text-center mb-4">
              Please login to access betting features.
            </p>
            <Button onClick={() => window.location.href = '/login'}>
              Login
            </Button>
          </CardContent>
        </Card>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      header={{
        title: "Paper Betting",
        description: `${currentLeague.name} • Week ${currentLeague.currentWeek || 1}`,
        icon: DollarSign,
        actions: <LeagueSwitcher />,
      }}
    >
      <Tabs defaultValue="place-bets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="place-bets">
            <DollarSign className="h-4 w-4 mr-2" />
            Place Bets
          </TabsTrigger>
          <TabsTrigger value="active">
            <Activity className="h-4 w-4 mr-2" />
            Active Bets
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <TrendingUp className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="place-bets" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Available Games</h3>
              <OddsDisplay />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Bet Slip</h3>
              <BetSlip />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="active">
          <ActiveBets />
        </TabsContent>

        <TabsContent value="dashboard">
          <BettingDashboard 
            leagueId={currentLeague.id}
            leagueSandbox={currentLeague.sandbox}
            userId={session.user.id}
          />
        </TabsContent>

        <TabsContent value="history">
          <BettingHistory />
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}