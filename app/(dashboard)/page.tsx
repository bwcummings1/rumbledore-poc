'use client';

import DashboardPageLayout from "@/components/dashboard/layout";
import { LeagueSwitcher } from "@/components/leagues/league-switcher";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import DashboardChart from "@/components/dashboard/chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { UpcomingGames } from "@/components/dashboard/upcoming-games";
import { BettingSummary } from "@/components/dashboard/betting-summary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, TrendingUp, DollarSign, MessageSquare } from "lucide-react";
import { useDashboardStats, useLeagueMetrics, useRecentActivity } from "@/hooks/api/use-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeagueContext } from "@/contexts/league-context";

export default function DashboardOverview() {
  const { currentLeague } = useLeagueContext();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: metrics, isLoading: metricsLoading } = useLeagueMetrics();
  const { data: activities, isLoading: activitiesLoading } = useRecentActivity();

  const currentDate = new Date().toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <DashboardPageLayout
      header={{
        title: "Overview",
        description: currentLeague 
          ? `${currentLeague.name} • Week ${metrics?.currentWeek || '—'} • ${currentDate}`
          : `Welcome to Rumbledore • ${currentDate}`,
        icon: Home,
        actions: <LeagueSwitcher />,
      }}
    >
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading || metricsLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <DashboardStats stats={stats} metrics={metrics} />
        )}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="betting">Betting</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardChart />
            <UpcomingGames games={stats?.upcomingGames} isLoading={statsLoading} />
          </div>
          <RecentActivity transactions={activities} isLoading={activitiesLoading} />
        </TabsContent>

        <TabsContent value="betting">
          <BettingSummary />
        </TabsContent>

        <TabsContent value="activity">
          <RecentActivity transactions={activities} isLoading={activitiesLoading} />
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <QuickActions />
    </DashboardPageLayout>
  );
}
