import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { PrismaClient } from '@prisma/client';
import { auditLogger } from '@/lib/services/audit-logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';

const prisma = new PrismaClient();

export const GET = withAuth(
  async (req: Request, { params }: { params: { leagueId: string } }) => {
    try {
      const settings = await prisma.leagueSettings.findUnique({
        where: { leagueSandbox: params.leagueId },
      });

      if (!settings) {
        // Create default settings if they don't exist
        const newSettings = await prisma.leagueSettings.create({
          data: {
            leagueSandbox: params.leagueId,
            settings: {},
            features: {
              espn: true,
              ai_content: false,
              betting: false,
            },
            syncConfig: {
              auto_sync: true,
              sync_interval: 3600,
            },
          },
        });
        return NextResponse.json(newSettings);
      }

      return NextResponse.json(settings);
    } catch (error) {
      console.error('Error fetching league settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch league settings' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);

export const PUT = withAuth(
  async (req: Request, { params }: { params: { leagueId: string } }) => {
    try {
      const session = await getServerSession(authOptions);
      const data = await req.json();

      // Get existing settings for audit log
      const existingSettings = await prisma.leagueSettings.findUnique({
        where: { leagueSandbox: params.leagueId },
      });

      // Update or create settings
      const settings = await prisma.leagueSettings.upsert({
        where: { leagueSandbox: params.leagueId },
        update: {
          settings: data.settings || {},
          features: data.features || {},
          syncConfig: data.syncConfig || {},
          notificationConfig: data.notificationConfig || {},
          updatedBy: session?.user?.id,
        },
        create: {
          leagueSandbox: params.leagueId,
          settings: data.settings || {},
          features: data.features || {},
          syncConfig: data.syncConfig || {},
          notificationConfig: data.notificationConfig || {},
          updatedBy: session?.user?.id,
        },
      });

      // Log the settings update
      await auditLogger.logSettingsUpdate(
        session?.user?.id || '',
        'LEAGUE',
        params.leagueId,
        existingSettings,
        settings,
        req
      );

      return NextResponse.json(settings);
    } catch (error) {
      console.error('Error updating league settings:', error);
      return NextResponse.json(
        { error: 'Failed to update league settings' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);