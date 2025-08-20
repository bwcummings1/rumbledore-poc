import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const GET = withAuth(
  async (req: Request, { params }: { params: { leagueId: string } }) => {
    try {
      // First find the league by sandbox namespace
      const league = await prisma.league.findFirst({
        where: { sandboxNamespace: params.leagueId },
      });

      if (!league) {
        return NextResponse.json(
          { error: 'League not found' },
          { status: 404 }
        );
      }

      const members = await prisma.leagueMember.findMany({
        where: { leagueId: league.id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          joinedAt: 'desc',
        },
      });

      return NextResponse.json(members);
    } catch (error) {
      console.error('Error fetching league members:', error);
      return NextResponse.json(
        { error: 'Failed to fetch league members' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);