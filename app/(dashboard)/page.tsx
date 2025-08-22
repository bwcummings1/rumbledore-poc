'use client';

import DashboardPageLayout from "@/components/dashboard/layout";
import { WidgetDashboard } from "@/components/dashboard/widget-dashboard";
import { LeagueSwitcher } from "@/components/leagues/league-switcher";
import { Home } from "lucide-react";
import { useLeagueContext } from "@/contexts/league-context";

export default function DashboardOverview() {
  const { currentLeague } = useLeagueContext();

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
        title: "Dashboard",
        description: currentLeague 
          ? `${currentLeague.name} • ${currentDate}`
          : `Welcome to Rumbledore • ${currentDate}`,
        icon: Home,
        actions: <LeagueSwitcher />,
      }}
    >
      <WidgetDashboard />
    </DashboardPageLayout>
  );
}