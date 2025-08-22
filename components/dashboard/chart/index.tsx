"use client";

import * as React from "react";
import { XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bullet } from "@/components/ui/bullet";
import { useLeagueContext } from "@/contexts/league-context";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TimePeriod = "week" | "month" | "season";

type ChartDataPoint = {
  date: string;
  wins: number;
  points: number;
  rank: number;
};

const chartConfig = {
  wins: {
    label: "Wins",
    color: "var(--chart-1)",
  },
  points: {
    label: "Points",
    color: "var(--chart-2)",
  },
  rank: {
    label: "Rank",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export default function DashboardChart() {
  const [activeTab, setActiveTab] = React.useState<TimePeriod>("week");
  const { currentLeague } = useLeagueContext();
  
  const { data: chartData, isLoading } = useQuery({
    queryKey: ['chart-data', currentLeague?.id, activeTab],
    queryFn: async () => {
      if (!currentLeague) return null;
      
      // Fetch performance data based on time period
      const { data } = await apiClient.stats.performance(currentLeague.id, {
        period: activeTab,
      });
      
      // Transform data for chart
      return data?.map((item: any) => ({
        date: item.date || item.week || 'W' + item.weekNumber,
        wins: item.wins || 0,
        points: item.points || 0,
        rank: item.rank || 0,
      })) || generateMockData(activeTab);
    },
    enabled: !!currentLeague,
  });

  const handleTabChange = (value: string) => {
    if (value === "week" || value === "month" || value === "season") {
      setActiveTab(value as TimePeriod);
    }
  };

  const formatYAxisValue = (value: number) => {
    if (value === 0) return "";
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  // Generate mock data if no real data available
  const generateMockData = (period: TimePeriod): ChartDataPoint[] => {
    const count = period === 'week' ? 7 : period === 'month' ? 4 : 17;
    return Array.from({ length: count }, (_, i) => ({
      date: period === 'week' ? `Day ${i + 1}` : period === 'month' ? `Week ${i + 1}` : `W${i + 1}`,
      wins: Math.floor(Math.random() * 10),
      points: Math.floor(Math.random() * 150) + 50,
      rank: Math.floor(Math.random() * 12) + 1,
    }));
  };

  const renderChart = (data: ChartDataPoint[]) => {
    return (
      <div className="bg-accent rounded-lg p-3">
        <ChartContainer className="md:aspect-[3/1] w-full" config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              left: -12,
              right: 12,
              top: 12,
              bottom: 12,
            }}
          >
            <defs>
              <linearGradient id="fillWins" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-wins)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-wins)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillPoints" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-points)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-points)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid
              horizontal={false}
              strokeDasharray="8 8"
              strokeWidth={2}
              stroke="var(--muted-foreground)"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={12}
              strokeWidth={1.5}
              className="uppercase text-sm fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={0}
              tickCount={6}
              className="text-sm fill-muted-foreground"
              tickFormatter={formatYAxisValue}
              domain={[0, "dataMax"]}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Area
              dataKey="points"
              type="natural"
              fill="url(#fillPoints)"
              fillOpacity={0.5}
              stroke="var(--color-points)"
              strokeWidth={2}
              stackId="a"
            />
            <Area
              dataKey="wins"
              type="natural"
              fill="url(#fillWins)"
              fillOpacity={0.5}
              stroke="var(--color-wins)"
              strokeWidth={2}
              stackId="b"
              scale={10}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    );
  };

  if (!currentLeague) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Select a league to view performance data
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const currentData = chartData || generateMockData(activeTab);
  
  // Calculate totals for display
  const totals = currentData.reduce((acc, item) => ({
    totalWins: acc.totalWins + item.wins,
    totalPoints: acc.totalPoints + item.points,
    avgRank: acc.avgRank + item.rank / currentData.length,
  }), { totalWins: 0, totalPoints: 0, avgRank: 0 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Chart</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={activeTab} onValueChange={handleTabChange}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-row items-center justify-between">
              <TabsList>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="season">Season</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-6">
                <Bullet
                  label="Total Points"
                  value={totals.totalPoints.toFixed(0)}
                  bulletColor="bg-chart-2"
                />
                <Bullet
                  label="Wins"
                  value={totals.totalWins.toString()}
                  bulletColor="bg-chart-1"
                />
                <Bullet
                  label="Avg Rank"
                  value={totals.avgRank.toFixed(1)}
                  bulletColor="bg-chart-3"
                />
              </div>
            </div>
            <TabsContent value={activeTab} className="space-y-4">
              {renderChart(currentData)}
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}