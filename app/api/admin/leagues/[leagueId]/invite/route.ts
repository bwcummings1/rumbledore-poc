import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { PrismaClient } from '@prisma/client';
import { auditLogger } from '@/lib/services/audit-logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const POST = withAuth(
  async (req: Request, { params }: { params: { leagueId: string } }) => {
    try {
      const session = await getServerSession(authOptions);
      const { email, role } = await req.json();

      // Generate invitation token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

      // Create invitation
      const invitation = await prisma.invitation.create({
        data: {
          leagueSandbox: params.leagueId,
          email,
          role: role || 'MEMBER',
          token,
          expiresAt,
          createdBy: session?.user?.id,
        },
      });

      // Log the invitation
      await auditLogger.logMemberInvite(
        session?.user?.id || '',
        params.leagueId,
        email,
        role,
        req
      );

      // In a real implementation, you would send an email here
      // For now, we'll just return the invitation details
      const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${token}`;

      return NextResponse.json({
        message: 'Invitation sent successfully',
        invitation: {
          id: invitation.id,
          email,
          role,
          expiresAt,
          inviteUrl,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return NextResponse.json(
          { error: 'An invitation has already been sent to this email for this league' },
          { status: 400 }
        );
      }
      
      console.error('Error creating invitation:', error);
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);