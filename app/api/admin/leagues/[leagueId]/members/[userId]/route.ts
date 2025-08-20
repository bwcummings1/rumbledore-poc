import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { PrismaClient } from '@prisma/client';
import { auditLogger } from '@/lib/services/audit-logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';

const prisma = new PrismaClient();

export const PATCH = withAuth(
  async (
    req: Request,
    { params }: { params: { leagueId: string; userId: string } }
  ) => {
    try {
      const session = await getServerSession(authOptions);
      const { role } = await req.json();

      // Find the league
      const league = await prisma.league.findFirst({
        where: { sandboxNamespace: params.leagueId },
      });

      if (!league) {
        return NextResponse.json(
          { error: 'League not found' },
          { status: 404 }
        );
      }

      // Get existing member for audit log
      const existingMember = await prisma.leagueMember.findFirst({
        where: {
          leagueId: league.id,
          userId: params.userId,
        },
      });

      if (!existingMember) {
        return NextResponse.json(
          { error: 'Member not found' },
          { status: 404 }
        );
      }

      // Update member role
      const updatedMember = await prisma.leagueMember.update({
        where: {
          leagueId_userId: {
            leagueId: league.id,
            userId: params.userId,
          },
        },
        data: { role },
        include: {
          user: true,
        },
      });

      // Log the permission change
      await auditLogger.logPermissionChange(
        session?.user?.id || '',
        params.userId,
        existingMember.role,
        role,
        req
      );

      return NextResponse.json(updatedMember);
    } catch (error) {
      console.error('Error updating member role:', error);
      return NextResponse.json(
        { error: 'Failed to update member role' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);

export const DELETE = withAuth(
  async (
    req: Request,
    { params }: { params: { leagueId: string; userId: string } }
  ) => {
    try {
      const session = await getServerSession(authOptions);

      // Find the league
      const league = await prisma.league.findFirst({
        where: { sandboxNamespace: params.leagueId },
      });

      if (!league) {
        return NextResponse.json(
          { error: 'League not found' },
          { status: 404 }
        );
      }

      // Delete the member
      await prisma.leagueMember.delete({
        where: {
          leagueId_userId: {
            leagueId: league.id,
            userId: params.userId,
          },
        },
      });

      // Log the member removal
      await auditLogger.logMemberRemove(
        session?.user?.id || '',
        params.leagueId,
        params.userId,
        req
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error removing member:', error);
      return NextResponse.json(
        { error: 'Failed to remove member' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);