"use client";

import DashboardPageLayout from "@/components/dashboard/layout";
import { BettingDashboard } from "@/components/betting/betting-dashboard";
import { BetSlip } from "@/components/betting/bet-slip";
import { OddsDisplay } from "@/components/betting/odds-display";
import EmailIcon from "@/components/icons/email";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BettingPage() {
  return (
    <DashboardPageLayout
      header={{
        title: "Betting Hub",
        description: "Place your bets and track your performance",
        icon: EmailIcon,
      }}
    >
      <Tabs defaultValue="place-bets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="place-bets">Place Bets</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="odds">Live Odds</TabsTrigger>
        </TabsList>

        <TabsContent value="place-bets" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold mb-4">Available Games</h3>
              <OddsDisplay />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Bet Slip</h3>
              <BetSlip />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dashboard">
          <BettingDashboard />
        </TabsContent>

        <TabsContent value="odds">
          <OddsDisplay />
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}