import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.leagueAgentMemory.deleteMany();
  await prisma.leagueMatchup.deleteMany();
  await prisma.leagueRosterSpot.deleteMany();
  await prisma.leagueTeam.deleteMany();
  await prisma.leaguePlayer.deleteMany();
  await prisma.espnCredential.deleteMany();
  await prisma.leagueMember.deleteMany();
  await prisma.league.deleteMany();
  await prisma.user.deleteMany();

  // Create test users
  console.log('👤 Creating users...');
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@rumbledore.local',
        username: 'admin',
        displayName: 'Admin User',
        avatarUrl: '/avatars/user_krimson.png',
      },
    }),
    prisma.user.create({
      data: {
        email: 'john@rumbledore.local',
        username: 'jdoe',
        displayName: 'John Doe',
        avatarUrl: '/avatars/user_joyboy.png',
      },
    }),
    prisma.user.create({
      data: {
        email: 'jane@rumbledore.local',
        username: 'jsmith',
        displayName: 'Jane Smith',
        avatarUrl: '/avatars/user_mati.png',
      },
    }),
    prisma.user.create({
      data: {
        email: 'mike@rumbledore.local',
        username: 'mjohnson',
        displayName: 'Mike Johnson',
        avatarUrl: '/avatars/user_pek.png',
      },
    }),
  ]);

  // Create test leagues
  console.log('🏆 Creating leagues...');
  const leagues = await Promise.all([
    prisma.league.create({
      data: {
        espnLeagueId: BigInt(123456),
        name: 'The Championship League',
        season: 2024,
        sandboxNamespace: 'league_123456_2024',
        settings: {
          scoringType: 'ppr',
          teamCount: 12,
          playoffTeams: 6,
          tradeDeadline: '2024-11-15',
          waiverType: 'continuous',
          draftType: 'snake',
        },
        isActive: true,
        createdBy: users[0].id,
      },
    }),
    prisma.league.create({
      data: {
        espnLeagueId: BigInt(789012),
        name: 'Dynasty Warriors',
        season: 2024,
        sandboxNamespace: 'league_789012_2024',
        settings: {
          scoringType: 'half-ppr',
          teamCount: 10,
          playoffTeams: 4,
          tradeDeadline: '2024-11-20',
          waiverType: 'daily',
          draftType: 'auction',
        },
        isActive: true,
        createdBy: users[1].id,
      },
    }),
  ]);

  // Add members to leagues
  console.log('👥 Adding league members...');
  await Promise.all([
    // First league members
    prisma.leagueMember.create({
      data: {
        leagueId: leagues[0].id,
        userId: users[0].id,
        espnTeamId: 1,
        teamName: 'Admin All-Stars',
        role: 'OWNER',
      },
    }),
    prisma.leagueMember.create({
      data: {
        leagueId: leagues[0].id,
        userId: users[1].id,
        espnTeamId: 2,
        teamName: 'Touchdown Titans',
        role: 'MEMBER',
      },
    }),
    prisma.leagueMember.create({
      data: {
        leagueId: leagues[0].id,
        userId: users[2].id,
        espnTeamId: 3,
        teamName: 'Gridiron Gladiators',
        role: 'MEMBER',
      },
    }),
    // Second league members
    prisma.leagueMember.create({
      data: {
        leagueId: leagues[1].id,
        userId: users[1].id,
        espnTeamId: 1,
        teamName: 'Dynasty Kings',
        role: 'OWNER',
      },
    }),
    prisma.leagueMember.create({
      data: {
        leagueId: leagues[1].id,
        userId: users[3].id,
        espnTeamId: 2,
        teamName: 'Future Champions',
        role: 'MEMBER',
      },
    }),
  ]);

  // Create fantasy teams for first league
  console.log('🏈 Creating fantasy teams...');
  const teams = await Promise.all([
    prisma.leagueTeam.create({
      data: {
        leagueId: leagues[0].id,
        espnTeamId: 1,
        name: 'Admin All-Stars',
        abbreviation: 'AAS',
        wins: 8,
        losses: 2,
        ties: 0,
        pointsFor: 1256.5,
        pointsAgainst: 1089.3,
        standing: 1,
      },
    }),
    prisma.leagueTeam.create({
      data: {
        leagueId: leagues[0].id,
        espnTeamId: 2,
        name: 'Touchdown Titans',
        abbreviation: 'TDT',
        wins: 6,
        losses: 4,
        ties: 0,
        pointsFor: 1189.2,
        pointsAgainst: 1123.7,
        standing: 2,
      },
    }),
    prisma.leagueTeam.create({
      data: {
        leagueId: leagues[0].id,
        espnTeamId: 3,
        name: 'Gridiron Gladiators',
        abbreviation: 'GG',
        wins: 5,
        losses: 5,
        ties: 0,
        pointsFor: 1098.8,
        pointsAgainst: 1134.2,
        standing: 3,
      },
    }),
  ]);

  // Create sample players
  console.log('🏃 Creating players...');
  const playerData = [
    { name: 'Patrick Mahomes', position: 'QB', nflTeam: 'KC', espnId: 3139477 },
    { name: 'Christian McCaffrey', position: 'RB', nflTeam: 'SF', espnId: 3117251 },
    { name: 'Tyreek Hill', position: 'WR', nflTeam: 'MIA', espnId: 3116406 },
    { name: 'Travis Kelce', position: 'TE', nflTeam: 'KC', espnId: 15847 },
    { name: 'Justin Jefferson', position: 'WR', nflTeam: 'MIN', espnId: 4262921 },
    { name: 'Austin Ekeler', position: 'RB', nflTeam: 'LAC', espnId: 3068267 },
    { name: 'Stefon Diggs', position: 'WR', nflTeam: 'BUF', espnId: 2976212 },
    { name: 'Josh Allen', position: 'QB', nflTeam: 'BUF', espnId: 3918298 },
    { name: 'Derrick Henry', position: 'RB', nflTeam: 'TEN', espnId: 3043078 },
    { name: 'CeeDee Lamb', position: 'WR', nflTeam: 'DAL', espnId: 4241389 },
  ];

  const players = await Promise.all(
    playerData.map((player) =>
      prisma.leaguePlayer.create({
        data: {
          leagueId: leagues[0].id,
          espnPlayerId: BigInt(player.espnId),
          name: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          stats: {
            weeklyStats: {
              1: { points: faker.number.float({ min: 5, max: 35, fractionDigits: 1 }) },
              2: { points: faker.number.float({ min: 5, max: 35, fractionDigits: 1 }) },
              3: { points: faker.number.float({ min: 5, max: 35, fractionDigits: 1 }) },
            },
            seasonStats: {
              gamesPlayed: 10,
              averagePoints: faker.number.float({ min: 10, max: 25, fractionDigits: 1 }),
            },
          },
          projections: {
            weeklyProjections: {
              11: { points: faker.number.float({ min: 10, max: 30, fractionDigits: 1 }), confidence: 0.75 },
              12: { points: faker.number.float({ min: 10, max: 30, fractionDigits: 1 }), confidence: 0.72 },
            },
            seasonProjection: {
              gamesPlayed: 17,
              averagePoints: faker.number.float({ min: 12, max: 22, fractionDigits: 1 }),
              confidence: 0.78,
            },
          },
        },
      })
    )
  );

  // Create sample matchups
  console.log('🆚 Creating matchups...');
  await Promise.all([
    prisma.leagueMatchup.create({
      data: {
        leagueId: leagues[0].id,
        week: 10,
        matchupPeriod: 10,
        homeTeamId: teams[0].id,
        awayTeamId: teams[1].id,
        homeScore: 125.5,
        awayScore: 112.3,
        isComplete: true,
      },
    }),
    prisma.leagueMatchup.create({
      data: {
        leagueId: leagues[0].id,
        week: 11,
        matchupPeriod: 11,
        homeTeamId: teams[0].id,
        awayTeamId: teams[2].id,
        homeScore: null,
        awayScore: null,
        isComplete: false,
      },
    }),
  ]);

  // Create sample ESPN credentials (encrypted - in production, use proper encryption)
  console.log('🔐 Creating ESPN credentials...');
  await prisma.espnCredential.create({
    data: {
      userId: users[0].id,
      leagueId: leagues[0].id,
      encryptedSwid: Buffer.from('mock-swid-token').toString('base64'),
      encryptedEspnS2: Buffer.from('mock-espn-s2-token').toString('base64'),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      lastValidated: new Date(),
      isValid: true,
    },
  });

  // Create sample agent memory
  console.log('🤖 Creating agent memory...');
  await Promise.all([
    prisma.leagueAgentMemory.create({
      data: {
        leagueId: leagues[0].id,
        agentType: 'COMMISSIONER',
        memoryType: 'LONG_TERM',
        content: 'The Championship League has been highly competitive this season.',
        metadata: {
          context: 'league_overview',
          season: 2024,
        },
      },
    }),
    prisma.leagueAgentMemory.create({
      data: {
        leagueId: leagues[0].id,
        agentType: 'ANALYST',
        memoryType: 'SHORT_TERM',
        content: 'Admin All-Stars have maintained first place for 5 consecutive weeks.',
        metadata: {
          context: 'standings_analysis',
          week: 10,
        },
      },
    }),
  ]);

  console.log('✅ Seed completed successfully!');
  console.log(`📊 Created:`);
  console.log(`   - ${users.length} users`);
  console.log(`   - ${leagues.length} leagues`);
  console.log(`   - ${teams.length} teams`);
  console.log(`   - ${players.length} players`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });