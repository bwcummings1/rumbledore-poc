import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const GET = withAuth(
  async (req: Request) => {
    try {
      const users = await prisma.user.findMany({
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return NextResponse.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);