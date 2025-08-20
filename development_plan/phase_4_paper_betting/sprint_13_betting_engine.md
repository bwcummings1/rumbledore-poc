# Sprint 13: Betting Engine

## Sprint Overview
Build the core betting engine with bankroll management, bet placement, and automated settlement.

**Duration**: 2 weeks (Week 3-4 of Phase 4)  
**Dependencies**: Sprint 12 (Odds Integration) complete  
**Risk Level**: Medium - Complex financial calculations

## Implementation Guide

### Bankroll Management

```typescript
// /lib/betting/bankroll-manager.ts
export class BankrollManager {
  async initializeWeeklyBankroll(userId: string, leagueSandbox: string): Promise<Bankroll> {
    const existingBankroll = await prisma.bankroll.findFirst({
      where: {
        userId,
        leagueSandbox,
        week: getCurrentWeek(),
      },
    });

    if (existingBankroll) return existingBankroll;

    return await prisma.bankroll.create({
      data: {
        userId,
        leagueSandbox,
        week: getCurrentWeek(),
        startingBalance: 1000,
        currentBalance: 1000,
        status: 'ACTIVE',
      },
    });
  }

  async placeBet(bet: BetRequest): Promise<BetResult> {
    const bankroll = await this.getBankroll(bet.userId, bet.leagueSandbox);
    
    // Validate bet
    if (bet.amount > bankroll.currentBalance) {
      throw new Error('Insufficient funds');
    }

    if (bet.amount < 1 || bet.amount > 500) {
      throw new Error('Bet amount must be between 1 and 500 units');
    }

    // Create bet record
    const betRecord = await prisma.bet.create({
      data: {
        userId: bet.userId,
        leagueSandbox: bet.leagueSandbox,
        gameId: bet.gameId,
        betType: bet.type,
        selection: bet.selection,
        odds: bet.odds,
        amount: bet.amount,
        potentialPayout: this.calculatePayout(bet.amount, bet.odds),
        status: 'PENDING',
      },
    });

    // Update bankroll
    await prisma.bankroll.update({
      where: { id: bankroll.id },
      data: {
        currentBalance: bankroll.currentBalance - bet.amount,
        pendingBets: bankroll.pendingBets + 1,
      },
    });

    return betRecord;
  }

  private calculatePayout(amount: number, odds: number): number {
    if (odds > 0) {
      return amount * (1 + odds / 100);
    } else {
      return amount * (1 + 100 / Math.abs(odds));
    }
  }
}
```

### Settlement Engine

```typescript
// /lib/betting/settlement-engine.ts
export class SettlementEngine {
  async settleCompletedGames(): Promise<SettlementResult> {
    const pendingBets = await prisma.bet.findMany({
      where: { status: 'PENDING' },
      include: { game: true },
    });

    const completedGames = await this.getCompletedGames();
    const settledBets = [];

    for (const bet of pendingBets) {
      const gameResult = completedGames.find(g => g.id === bet.gameId);
      if (!gameResult) continue;

      const won = this.evaluateBet(bet, gameResult);
      const payout = won ? bet.potentialPayout : 0;

      // Update bet
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          status: won ? 'WON' : 'LOST',
          payout,
          settledAt: new Date(),
        },
      });

      // Update bankroll
      if (won) {
        await prisma.bankroll.update({
          where: { userId: bet.userId, week: getCurrentWeek() },
          data: {
            currentBalance: { increment: payout },
            totalWinnings: { increment: payout - bet.amount },
          },
        });
      }

      settledBets.push({ betId: bet.id, won, payout });
    }

    return { settledCount: settledBets.length, settledBets };
  }

  private evaluateBet(bet: any, gameResult: any): boolean {
    switch (bet.betType) {
      case 'SPREAD':
        return this.evaluateSpread(bet, gameResult);
      case 'MONEYLINE':
        return this.evaluateMoneyline(bet, gameResult);
      case 'TOTAL':
        return this.evaluateTotal(bet, gameResult);
      default:
        return false;
    }
  }
}
```

## Success Criteria
- [ ] Bankroll management working
- [ ] Bet validation comprehensive
- [ ] Settlement accurate
- [ ] Payout calculations correct
- [ ] Transaction history complete
