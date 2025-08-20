import { Job } from 'bull';
import { ESPNClient } from '@/lib/espn/client';
import { DataTransformer } from '@/lib/transform/transformer';
import { prisma } from '@/lib/prisma';
import { getCookieManager } from '@/lib/crypto/cookie-manager';

export interface LeagueSyncJob {
  leagueId: string;
  userId: string;
  fullSync?: boolean;
  scoringPeriodId?: number;
}

export async function processLeagueSync(job: Job<LeagueSyncJob>) {
  const { leagueId, userId, fullSync = false, scoringPeriodId } = job.data;
  
  console.log(`Processing league sync for ${leagueId} (full: ${fullSync})`);
  
  try {
    // Update job progress
    await job.progress(10);
    
    // Get league and credentials
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        credentials: {
          where: { userId },
        },
      },
    });

    if (!league) {
      throw new Error(`League ${leagueId} not found`);
    }

    if (!league.credentials || league.credentials.length === 0) {
      throw new Error(`No credentials found for league ${leagueId}`);
    }

    await job.progress(20);

    // Get decrypted cookies
    const cookieManager = getCookieManager();
    const cookies = await cookieManager.getCookies(userId, leagueId);
    
    if (!cookies) {
      throw new Error('Failed to retrieve cookies');
    }

    await job.progress(30);

    // Initialize ESPN client
    const client = new ESPNClient({
      leagueId: Number(league.espnLeagueId),
      seasonId: league.season,
      cookies,
    });

    // Fetch league data
    const leagueData = await client.getLeague();
    await job.progress(50);
    
    // Transform data
    const transformer = new DataTransformer();
    const transformed = await transformer.transformLeague(leagueData);
    await job.progress(60);
    
    // Store in database using transaction
    await prisma.$transaction(async (tx) => {
      // Update league settings
      await tx.league.update({
        where: { id: leagueId },
        data: {
          settings: transformed.settings,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await job.progress(70);

      // Update teams
      for (const team of transformed.teams) {
        await tx.leagueTeam.upsert({
          where: {
            leagueId_espnTeamId: {
              leagueId,
              espnTeamId: team.espnTeamId,
            },
          },
          update: {
            name: team.name,
            abbreviation: team.abbreviation,
            logoUrl: team.logoUrl,
            wins: team.wins,
            losses: team.losses,
            ties: team.ties,
            pointsFor: team.pointsFor,
            pointsAgainst: team.pointsAgainst,
            standing: team.standing,
            playoffSeed: team.playoffSeed,
            updatedAt: new Date(),
          },
          create: {
            leagueId,
            espnTeamId: team.espnTeamId,
            name: team.name,
            abbreviation: team.abbreviation,
            logoUrl: team.logoUrl,
            wins: team.wins,
            losses: team.losses,
            ties: team.ties,
            pointsFor: team.pointsFor,
            pointsAgainst: team.pointsAgainst,
            standing: team.standing,
            playoffSeed: team.playoffSeed,
          },
        });
      }

      await job.progress(80);

      // Update players if full sync
      if (fullSync && transformed.players.length > 0) {
        for (const player of transformed.players) {
          await tx.leaguePlayer.upsert({
            where: {
              leagueId_espnPlayerId: {
                leagueId,
                espnPlayerId: BigInt(player.espnPlayerId),
              },
            },
            update: {
              name: player.name,
              position: player.position,
              nflTeam: player.nflTeam,
              stats: player.stats,
              injuryStatus: player.injuryStatus,
              updatedAt: new Date(),
            },
            create: {
              leagueId,
              espnPlayerId: BigInt(player.espnPlayerId),
              name: player.name,
              position: player.position,
              nflTeam: player.nflTeam,
              stats: player.stats,
              injuryStatus: player.injuryStatus,
            },
          });
        }
      }

      await job.progress(90);

      // Sync matchups if available
      if (leagueData.schedule && leagueData.schedule.length > 0) {
        const matchups = transformer.transformMatchups(leagueData.schedule);
        
        for (const matchup of matchups) {
          // Get team IDs from ESPN team IDs
          const homeTeam = await tx.leagueTeam.findUnique({
            where: {
              leagueId_espnTeamId: {
                leagueId,
                espnTeamId: matchup.homeTeamId,
              },
            },
          });

          const awayTeam = await tx.leagueTeam.findUnique({
            where: {
              leagueId_espnTeamId: {
                leagueId,
                espnTeamId: matchup.awayTeamId,
              },
            },
          });

          if (homeTeam && awayTeam) {
            await tx.leagueMatchup.upsert({
              where: {
                leagueId_week_homeTeamId_awayTeamId: {
                  leagueId,
                  week: matchup.week,
                  homeTeamId: homeTeam.id,
                  awayTeamId: awayTeam.id,
                },
              },
              update: {
                homeScore: matchup.homeScore,
                awayScore: matchup.awayScore,
                isComplete: matchup.isComplete,
                isPlayoffs: matchup.isPlayoffs,
              },
              create: {
                leagueId,
                week: matchup.week,
                matchupPeriod: matchup.matchupPeriod,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                homeScore: matchup.homeScore,
                awayScore: matchup.awayScore,
                isComplete: matchup.isComplete,
                isPlayoffs: matchup.isPlayoffs,
              },
            });
          }
        }
      }
    });

    // Update job progress
    await job.progress(100);
    
    console.log(`League sync completed for ${leagueId}`);
    
    return {
      success: true,
      leagueId,
      teamsUpdated: transformed.teams.length,
      playersUpdated: fullSync ? transformed.players.length : 0,
      lastSync: new Date(),
    };
  } catch (error) {
    console.error(`League sync failed for ${leagueId}:`, error);
    throw error;
  }
}