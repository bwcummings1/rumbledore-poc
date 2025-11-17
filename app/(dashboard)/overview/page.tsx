'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Users, Calendar, Clock, Bell, Settings, Search, Menu, Loader2 } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface DashboardData {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  stats: {
    totalLeagues: number;
    activeBets: number;
    totalWinnings: number;
    weeklyScore: number;
    minutesInMeetings: number;
    accidents: number;
  };
  standings: Array<{
    rank: number;
    name: string;
    owner: string;
    wins: number;
    losses: number;
    points: number;
    trend: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    time: string;
    status: string;
  }>;
  weeklyData: Array<{
    date: string;
    bets: number;
    winnings: number;
    bankroll: number;
  }>;
  bankrolls: Array<{
    leagueId: string;
    leagueName: string;
    balance: number;
    weeklyLimit: number;
    totalWagered: number;
    totalWon: number;
  }>;
}

export default function OverviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch('/api/dashboard/overview');
        if (response.ok) {
          const data = await response.json();
          setDashboardData(data);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (session) {
      fetchDashboardData();
    }
  }, [session]);

  if (!mounted || status === 'loading') return null;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    }).toUpperCase();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-xs font-bold">R</span>
              </div>
              <span className="text-xl font-bold">RUMBLEDORE</span>
              <span className="text-xs text-zinc-500 ml-2">PRO DASHBOARD</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-3xl font-mono font-bold">{formatTime(currentTime)}</div>
              <div className="text-xs text-zinc-500">{formatDate(currentTime)}</div>
            </div>
            <div className="text-xs text-zinc-500">
              <div>FANTASY FOOTBALL</div>
              <div>{dashboardData?.stats.totalLeagues || 0} LEAGUES ACTIVE</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800 min-h-screen">
          <nav className="p-4">
            <div className="space-y-1">
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-900 text-white">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-sm font-medium">OVERVIEW</span>
              </button>
              <button 
                onClick={() => router.push('/leagues')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400"
              >
                <span className="text-sm">MY LEAGUES</span>
              </button>
              <button 
                onClick={() => router.push('/betting')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400"
              >
                <span className="text-sm">BETTING DASHBOARD</span>
              </button>
              <button 
                onClick={() => router.push('/competitions')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400"
              >
                <span className="text-sm">COMPETITIONS</span>
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 mb-3">RUMBLE</div>
              <div className="space-y-1">
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400">
                  <span className="text-sm">SPREAD BETTING</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400">
                  <span className="text-sm">OVER/UNDER</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400">
                  <span className="text-sm">PLAYER PROPS</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400">
                  <span className="text-sm">PARLAYS</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400">
                  <span className="text-sm">LIVE BETTING</span>
                </button>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 mb-3">USER</div>
              <div className="flex items-center gap-3 px-3 py-2">
                {dashboardData?.user.avatarUrl ? (
                  <img src={dashboardData.user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full" />
                )}
                <div>
                  <div className="text-sm font-medium">{dashboardData?.user.displayName || dashboardData?.user.username || 'User'}</div>
                  <div className="text-xs text-zinc-500">@{dashboardData?.user.username || 'user'}</div>
                </div>
              </div>
              <button 
                onClick={() => router.push('/profile/settings')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 text-zinc-400"
              >
                <span className="text-sm">PREFERENCES</span>
              </button>
            </div>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2">OVERVIEW</h1>
                <p className="text-sm text-zinc-500">Last updated {new Date().toLocaleTimeString()}</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-zinc-900/50 rounded-lg p-6 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-xs text-zinc-500">WEEKLY SCORE</span>
                    </div>
                    <div className="text-xs text-zinc-500">✓</div>
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold">{dashboardData?.stats.weeklyScore || 0}%</span>
                  </div>
                  <div className="text-xs text-zinc-500">PERFORMANCE RATING</div>
                  <div className="flex gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                </div>

                <div className="bg-zinc-900/50 rounded-lg p-6 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs text-zinc-500">TOTAL WINNINGS</span>
                    </div>
                    <div className="text-xs text-zinc-500">$</div>
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold">${dashboardData?.stats.totalWinnings || 0}</span>
                  </div>
                  <div className="text-xs text-zinc-500">{dashboardData?.stats.activeBets || 0} ACTIVE BETS</div>
                  <div className="flex gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                </div>

                <div className="bg-zinc-900/50 rounded-lg p-6 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full" />
                      <span className="text-xs text-zinc-500">LEAGUES</span>
                    </div>
                    <div className="text-xs text-zinc-500">◐</div>
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold">{dashboardData?.stats.totalLeagues || 0}</span>
                    <span className="text-sm text-zinc-500 ml-2">ACTIVE</span>
                  </div>
                  <div className="text-xs text-zinc-500">FANTASY FOOTBALL</div>
                </div>
              </div>

              {/* Chart Section */}
              {dashboardData?.weeklyData && (
                <div className="bg-zinc-900/50 rounded-lg p-6 border border-zinc-800 mb-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex gap-4">
                      <button className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium border border-blue-500/30">
                        WEEK
                      </button>
                      <button className="px-4 py-2 text-zinc-500 hover:bg-zinc-800 rounded-lg text-sm">
                        MONTH
                      </button>
                      <button className="px-4 py-2 text-zinc-500 hover:bg-zinc-800 rounded-lg text-sm">
                        SEASON
                      </button>
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-blue-500" />
                        <span className="text-zinc-400">BETS</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-green-500" />
                        <span className="text-zinc-400">WINNINGS</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-orange-500" />
                        <span className="text-zinc-400">BANKROLL</span>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dashboardData.weeklyData}>
                      <defs>
                        <linearGradient id="betsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="winningsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#71717a"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis 
                        stroke="#71717a"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => `${value/1000}K`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#18181b', 
                          border: '1px solid #27272a',
                          borderRadius: '8px'
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="bets" 
                        stroke="#3b82f6" 
                        fill="url(#betsGradient)"
                        strokeWidth={2}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="winnings" 
                        stroke="#10b981" 
                        fill="url(#winningsGradient)"
                        strokeWidth={2}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="bankroll" 
                        stroke="#f97316" 
                        fill="url(#bankrollGradient)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Bottom Section */}
              <div className="grid grid-cols-3 gap-6">
                {/* League Standings */}
                <div className="bg-zinc-900/50 rounded-lg p-6 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-sm font-medium">LEAGUE STANDINGS</span>
                    </div>
                    <button 
                      onClick={() => router.push('/leagues')}
                      className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium border border-blue-500/30"
                    >
                      VIEW ALL
                    </button>
                  </div>
                  <div className="space-y-3">
                    {dashboardData?.standings?.map((team) => (
                      <div key={team.rank} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold text-zinc-600">{team.rank}</span>
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full" />
                          <div>
                            <div className="font-medium text-sm">{team.name}</div>
                            <div className="text-xs text-zinc-500">{team.owner}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{team.wins}-{team.losses}</div>
                          <div className="text-xs text-zinc-500">
                            {team.points.toFixed(1)} PTS
                          </div>
                        </div>
                      </div>
                    )) || (
                      <div className="text-center text-zinc-500 py-4">
                        No league data available
                      </div>
                    )}
                  </div>
                </div>

                {/* Bankroll Status */}
                <div className="bg-zinc-900/50 rounded-lg p-6 border border-zinc-800">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm font-medium">BANKROLL STATUS</span>
                    </div>
                    <span className="text-xs text-green-400 font-medium">ACTIVE</span>
                  </div>
                  
                  <div className="space-y-4">
                    {dashboardData?.bankrolls?.slice(0, 2).map((bankroll) => (
                      <div key={bankroll.leagueId} className="bg-zinc-800/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">{bankroll.leagueName}</div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-green-400">BALANCE</span>
                          <span className="text-2xl font-bold text-green-400">${bankroll.balance}</span>
                        </div>
                        <div className="text-xs text-zinc-500">
                          Won: ${bankroll.totalWon} | Wagered: ${bankroll.totalWagered}
                        </div>
                      </div>
                    )) || (
                      <div className="bg-zinc-800/50 rounded-lg p-3">
                        <div className="text-center text-zinc-500">
                          No bankroll data available
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Visual Element */}
                  <div className="mt-6 relative h-32 bg-gradient-to-b from-green-900/20 to-green-950/20 rounded-lg border border-green-500/20">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-24 h-24 border-2 border-green-500/30 rounded-full" />
                      <div className="absolute w-12 h-12 border border-green-500/20 rounded-full" />
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-8 bg-green-500/20 rounded-full animate-pulse" />
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-zinc-900/50 rounded-lg p-6 border border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">RECENT ACTIVITY</span>
                    </div>
                    <button className="text-xs text-zinc-500">CLEAR ALL</button>
                  </div>
                  
                  <div className="space-y-3">
                    {dashboardData?.recentActivity?.map((activity) => (
                      <div key={activity.id} className="bg-zinc-800/50 rounded-lg p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            <span className="text-xs font-medium">{activity.title}</span>
                            <span className="text-xs text-orange-400">{activity.status.toUpperCase()}</span>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-400 mb-1">{activity.message}</p>
                        <span className="text-xs text-zinc-500">
                          {new Date(activity.time).toLocaleDateString()}
                        </span>
                      </div>
                    )) || (
                      <div className="text-center text-zinc-500 py-4">
                        No recent activity
                      </div>
                    )}
                    
                    {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 && (
                      <button 
                        onClick={() => router.push('/activity')}
                        className="w-full text-center text-xs text-zinc-500 py-2"
                      >
                        SHOW ALL
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Chat Widget */}
          <div 
            onClick={() => router.push('/chat')}
            className="fixed bottom-6 right-6 bg-blue-500 text-white p-4 rounded-lg shadow-lg cursor-pointer hover:bg-blue-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-sm font-medium">AI ASSISTANT</span>
              <span className="text-xs">+</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}