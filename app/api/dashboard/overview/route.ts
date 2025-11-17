import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's leagues
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        leagues: {
          include: {
            league: {
              include: {
                teams: true,
                matchups: {
                  take: 10,
                  orderBy: { week: 'desc' }
                },
                members: {
                  include: {
                    user: true
                  }
                }
              }
            }
          }
        },
        bankrolls: {
          include: {
            league: true
          }
        },
        bets: {
          take: 10,
          orderBy: { placedAt: 'desc' },
          include: {
            league: true
          }
        },
        achievements: {
          include: {
            competitionReward: {
              include: {
                competition: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate stats
    const stats = {
      totalLeagues: user.leagues.length,
      activeBets: user.bets.filter(b => b.status === 'pending').length,
      totalWinnings: user.bets
        .filter(b => b.status === 'won')
        .reduce((sum, bet) => sum + (bet.potentialPayout - bet.amount), 0),
      weeklyScore: Math.floor(Math.random() * 100), // Mock for now
      minutesInMeetings: Math.floor(Math.random() * 1000), // Mock for now
      accidents: 0
    };

    // Get league standings for primary league
    const primaryLeague = user.leagues[0]?.league;
    const standings = primaryLeague?.teams.map((team, index) => ({
      rank: index + 1,
      name: team.name,
      owner: team.ownerName,
      wins: team.wins,
      losses: team.losses,
      points: team.pointsFor,
      trend: Math.random() > 0.5 ? 'up' : 'down'
    })).slice(0, 4);

    // Get recent activity
    const recentActivity = user.bets.slice(0, 3).map(bet => ({
      id: bet.id,
      type: 'bet',
      title: `Bet placed on ${bet.league.name}`,
      message: `$${bet.amount} at ${bet.odds} odds`,
      time: bet.placedAt.toISOString(),
      status: bet.status
    }));

    // Prepare weekly data for charts
    const weeklyData = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return {
        date: date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
        bets: Math.floor(Math.random() * 100000),
        winnings: Math.floor(Math.random() * 120000),
        bankroll: Math.floor(Math.random() * 80000)
      };
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl
      },
      stats,
      standings,
      recentActivity,
      weeklyData,
      bankrolls: user.bankrolls.map(b => ({
        leagueId: b.leagueId,
        leagueName: b.league.name,
        balance: b.balance,
        weeklyLimit: b.weeklyLimit,
        totalWagered: b.totalWagered,
        totalWon: b.totalWon
      }))
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}