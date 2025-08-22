import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const createLeagueSchema = z.object({
  espnLeagueId: z.number(),
  name: z.string().min(1).max(255),
  season: z.number().min(2020).max(2030)
});

// GET /api/leagues - List all leagues for the current user
export async function GET(request: NextRequest) {
  try {
    // In production, get user from session
    const userId = request.headers.get('x-user-id'); // For development
    
    const leagues = await prisma.league.findMany({
      where: userId ? {
        members: {
          some: {
            userId
          }
        }
      } : undefined,
      select: {
        id: true,
        espnLeagueId: true,
        name: true,
        season: true,
        sandboxNamespace: true,
        settings: true,
        isActive: true,
        lastSyncAt: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            players: true,
            teams: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    // Convert BigInt to number for JSON serialization
    const serializedLeagues = leagues.map(league => ({
      ...league,
      espnLeagueId: league.espnLeagueId ? Number(league.espnLeagueId) : null,
      _count: league._count ? {
        players: Number(league._count.players || 0),
        teams: Number(league._count.teams || 0)
      } : { players: 0, teams: 0 }
    }));
    
    return NextResponse.json(serializedLeagues);
  } catch (error) {
    console.error('Error fetching leagues:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leagues' },
      { status: 500 }
    );
  }
}

