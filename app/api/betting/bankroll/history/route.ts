/**
 * API endpoint for bankroll history and statistics
 */

import { NextRequest } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { prisma } from '@/lib/prisma';
import { BankrollManager } from '@/lib/betting/bankroll-manager';

export const GET = createApiHandler(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const leagueId = searchParams.get('leagueId');
  const userId = searchParams.get('userId');
  const weeks = parseInt(searchParams.get('weeks') || '10');
  
  if (!leagueId) {
    return Response.json({ error: 'League ID is required' }, { status: 400 });
  }
  
  const bankrollManager = new BankrollManager();
  
  try {
    // Get historical bankroll data
    const history = await prisma.bankroll.findMany({
      where: {
        leagueId,
        ...(userId && { userId }),
      },
      orderBy: {
        week: 'desc',
      },
      take: weeks,
      include: {
        bets: {
          where: {
            status: 'SETTLED',
          },
          select: {
            result: true,
            stake: true,
            actualPayout: true,
            marketType: true,
          },
        },
      },
    });
    
    // Calculate aggregate statistics
    const allBets = await prisma.bet.findMany({
      where: {
        leagueId,
        ...(userId && { userId }),
        status: 'SETTLED',
      },
      select: {
        result: true,
        stake: true,
        actualPayout: true,
        odds: true,
        marketType: true,
        settledAt: true,
      },
    });
    
    // Calculate statistics
    const totalBets = allBets.length;
    const wonBets = allBets.filter(b => b.result === 'WIN').length;
    const lostBets = allBets.filter(b => b.result === 'LOSS').length;
    const pushBets = allBets.filter(b => b.result === 'PUSH').length;
    
    const totalWagered = allBets.reduce((sum, bet) => sum + bet.stake, 0);
    const totalPayout = allBets.reduce((sum, bet) => sum + (bet.actualPayout || 0), 0);
    const netProfit = totalPayout - totalWagered;
    const roi = totalWagered > 0 ? (netProfit / totalWagered) * 100 : 0;
    const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;
    
    // Calculate average stake
    const averageStake = totalBets > 0 ? totalWagered / totalBets : 0;
    
    // Find best win and worst loss
    const wins = allBets.filter(b => b.result === 'WIN');
    const losses = allBets.filter(b => b.result === 'LOSS');
    
    const bestWin = wins.length > 0 
      ? wins.reduce((best, bet) => 
          (bet.actualPayout || 0) - bet.stake > (best.actualPayout || 0) - best.stake ? bet : best
        )
      : null;
    
    const worstLoss = losses.length > 0
      ? losses.reduce((worst, bet) => 
          bet.stake > worst.stake ? bet : worst
        )
      : null;
    
    // Calculate streaks
    const sortedBets = allBets.sort((a, b) => 
      new Date(b.settledAt!).getTime() - new Date(a.settledAt!).getTime()
    );
    
    let currentStreak = { type: 'none' as 'winning' | 'losing' | 'none', count: 0 };
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;
    
    for (const bet of sortedBets) {
      if (bet.result === 'WIN') {
        tempWinStreak++;
        tempLossStreak = 0;
        if (currentStreak.type === 'none' || currentStreak.type === 'winning') {
          currentStreak.type = 'winning';
          currentStreak.count++;
        }
      } else if (bet.result === 'LOSS') {
        tempLossStreak++;
        tempWinStreak = 0;
        if (currentStreak.type === 'none' || currentStreak.type === 'losing') {
          currentStreak.type = 'losing';
          currentStreak.count++;
        }
      } else {
        // Push doesn't break streak but doesn't add to it
      }
      
      longestWinStreak = Math.max(longestWinStreak, tempWinStreak);
      longestLossStreak = Math.max(longestLossStreak, tempLossStreak);
    }
    
    // Market type breakdown
    const byMarketType = {
      moneyline: {
        total: allBets.filter(b => b.marketType === 'H2H').length,
        wins: allBets.filter(b => b.marketType === 'H2H' && b.result === 'WIN').length,
      },
      spread: {
        total: allBets.filter(b => b.marketType === 'SPREADS').length,
        wins: allBets.filter(b => b.marketType === 'SPREADS' && b.result === 'WIN').length,
      },
      total: {
        total: allBets.filter(b => b.marketType === 'TOTALS').length,
        wins: allBets.filter(b => b.marketType === 'TOTALS' && b.result === 'WIN').length,
      },
    };
    
    const stats = {
      totalBets,
      wonBets,
      lostBets,
      pushBets,
      totalWagered,
      netProfit,
      roi,
      winRate,
      averageStake,
      averageOdds: allBets.length > 0 
        ? allBets.reduce((sum, bet) => sum + bet.odds, 0) / allBets.length 
        : 0,
      bestWin: bestWin ? {
        stake: bestWin.stake,
        actualPayout: bestWin.actualPayout,
        profit: (bestWin.actualPayout || 0) - bestWin.stake,
        odds: bestWin.odds,
      } : null,
      worstLoss: worstLoss ? {
        stake: worstLoss.stake,
        odds: worstLoss.odds,
      } : null,
      currentStreak,
      longestWinStreak,
      longestLossStreak,
      byMarketType,
    };
    
    return Response.json({
      history: history.map(bankroll => ({
        id: bankroll.id,
        week: bankroll.week,
        initialBalance: bankroll.initialBalance,
        currentBalance: bankroll.currentBalance,
        profitLoss: bankroll.profitLoss,
        roi: bankroll.roi,
        totalBets: bankroll.totalBets,
        wonBets: bankroll.wonBets,
        lostBets: bankroll.lostBets,
        pushBets: bankroll.pushBets,
        totalWagered: bankroll.totalWagered,
        status: bankroll.status,
        createdAt: bankroll.createdAt,
        updatedAt: bankroll.updatedAt,
      })),
      stats,
    });
  } catch (error) {
    console.error('Error fetching bankroll history:', error);
    return Response.json(
      { error: 'Failed to fetch bankroll history' },
      { status: 500 }
    );
  }
});