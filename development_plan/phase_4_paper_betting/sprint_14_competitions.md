# Sprint 14: Competitions

## Sprint Overview
Create multi-tier competition system with leaderboards, tournaments, and achievement tracking.

**Duration**: 2 weeks (Week 5-6 of Phase 4)  
**Dependencies**: Sprint 13 (Betting Engine) complete  
**Risk Level**: Low - Building on established betting system

## Implementation Guide

### Competition Manager

```typescript
// /lib/betting/competition-manager.ts
export class CompetitionManager {
  async createCompetition(config: CompetitionConfig): Promise<Competition> {
    return await prisma.competition.create({
      data: {
        name: config.name,
        type: config.type, // 'WEEKLY', 'SEASON', 'CUSTOM'
        scope: config.scope, // 'LEAGUE', 'PLATFORM'
        leagueSandbox: config.leagueSandbox,
        startDate: config.startDate,
        endDate: config.endDate,
        entryFee: config.entryFee || 0,
        prizePool: config.prizePool || 0,
        rules: config.rules,
        status: 'PENDING',
      },
    });
  }

  async joinCompetition(competitionId: string, userId: string): Promise<void> {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) throw new Error('Competition not found');

    // Check eligibility
    if (competition.entryFee > 0) {
      await this.deductEntryFee(userId, competition.entryFee);
    }

    await prisma.competitionEntry.create({
      data: {
        competitionId,
        userId,
        joinedAt: new Date(),
      },
    });
  }

  async updateLeaderboard(competitionId: string): Promise<void> {
    const entries = await prisma.competitionEntry.findMany({
      where: { competitionId },
      include: {
        user: {
          include: {
            bets: {
              where: {
                createdAt: {
                  gte: competition.startDate,
                  lte: competition.endDate,
                },
                status: { in: ['WON', 'LOST'] },
              },
            },
          },
        },
      },
    });

    const standings = entries.map(entry => {
      const stats = this.calculateUserStats(entry.user.bets);
      return {
        userId: entry.userId,
        profit: stats.profit,
        roi: stats.roi,
        winRate: stats.winRate,
        totalBets: stats.totalBets,
        score: this.calculateScore(stats),
      };
    }).sort((a, b) => b.score - a.score);

    // Update leaderboard
    await prisma.leaderboard.upsert({
      where: { competitionId },
      update: { standings, updatedAt: new Date() },
      create: { competitionId, standings },
    });
  }

  private calculateUserStats(bets: any[]): UserStats {
    const totalBets = bets.length;
    const wonBets = bets.filter(b => b.status === 'WON').length;
    const totalWagered = bets.reduce((sum, b) => sum + b.amount, 0);
    const totalPayout = bets.reduce((sum, b) => sum + (b.payout || 0), 0);
    
    return {
      totalBets,
      wonBets,
      winRate: totalBets > 0 ? (wonBets / totalBets) * 100 : 0,
      profit: totalPayout - totalWagered,
      roi: totalWagered > 0 ? ((totalPayout - totalWagered) / totalWagered) * 100 : 0,
    };
  }

  private calculateScore(stats: UserStats): number {
    // Weighted scoring system
    return (
      stats.profit * 1.0 +
      stats.roi * 0.5 +
      stats.winRate * 0.3 +
      Math.min(stats.totalBets * 0.1, 10) // Activity bonus
    );
  }

  async distributeRewards(competitionId: string): Promise<void> {
    const leaderboard = await prisma.leaderboard.findUnique({
      where: { competitionId },
    });

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!leaderboard || !competition) return;

    const standings = leaderboard.standings as any[];
    const rewards = this.calculateRewards(competition.prizePool, standings.length);

    for (let i = 0; i < Math.min(standings.length, rewards.length); i++) {
      const user = standings[i];
      const reward = rewards[i];

      if (reward.badge) {
        await prisma.achievement.create({
          data: {
            userId: user.userId,
            type: 'COMPETITION_PLACEMENT',
            name: reward.badge,
            description: `Finished #${i + 1} in ${competition.name}`,
            metadata: { competitionId, placement: i + 1 },
          },
        });
      }

      if (reward.units) {
        // Add bonus units to next week's bankroll
        await this.awardBonusUnits(user.userId, reward.units);
      }
    }

    // Mark competition as completed
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: 'COMPLETED' },
    });
  }

  private calculateRewards(prizePool: number, participants: number): Reward[] {
    if (participants === 0) return [];

    return [
      { place: 1, units: prizePool * 0.5, badge: '🏆 Champion' },
      { place: 2, units: prizePool * 0.3, badge: '🥈 Runner-up' },
      { place: 3, units: prizePool * 0.2, badge: '🥉 Third Place' },
      { place: 4, units: 0, badge: '🏅 Top 5' },
      { place: 5, units: 0, badge: '🏅 Top 5' },
    ];
  }
}
```

### Leaderboard Component

```tsx
// /components/betting/leaderboard.tsx
export function CompetitionLeaderboard({ competitionId }: { competitionId: string }) {
  const [standings, setStandings] = useState<any[]>([]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {standings.map((entry, index) => (
          <div key={entry.userId} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              <span className="text-lg font-bold">#{index + 1}</span>
              <div>
                <p className="font-medium">{entry.userName}</p>
                <p className="text-sm text-gray-500">
                  {entry.winRate.toFixed(1)}% Win Rate
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">
                {entry.profit > 0 ? '+' : ''}{entry.profit} units
              </p>
              <p className="text-sm text-gray-500">
                ROI: {entry.roi.toFixed(1)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Success Criteria
- [ ] Competition creation working
- [ ] Leaderboard calculations accurate
- [ ] Reward distribution functional
- [ ] Achievement system integrated
- [ ] Multi-tier competitions supported
