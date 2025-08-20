import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { PrismaClient } from '@prisma/client';
import { auditLogger } from '@/lib/services/audit-logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';

const prisma = new PrismaClient();

export const POST = withAuth(
  async (req: Request, { params }: { params: { leagueId: string } }) => {
    try {
      const session = await getServerSession(authOptions);
      const { type } = await req.json();

      // Create sync status record
      const syncStatus = await prisma.syncStatus.create({
        data: {
          leagueSandbox: params.leagueId,
          syncType: type,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          metadata: {
            triggeredBy: session?.user?.id,
            triggeredAt: new Date().toISOString(),
          },
        },
      });

      // Log the sync trigger
      await auditLogger.logSyncTrigger(
        session?.user?.id || '',
        params.leagueId,
        type,
        req
      );

      // In a real implementation, you would trigger the actual sync job here
      // For now, we'll simulate it by updating the status after a delay
      setTimeout(async () => {
        try {
          await prisma.syncStatus.update({
            where: { id: syncStatus.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              recordsProcessed: Math.floor(Math.random() * 1000),
            },
          });
        } catch (error) {
          console.error('Error updating sync status:', error);
        }
      }, 5000);

      return NextResponse.json({
        message: `${type} sync started`,
        syncId: syncStatus.id,
      });
    } catch (error) {
      console.error('Error triggering sync:', error);
      return NextResponse.json(
        { error: 'Failed to trigger sync' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);