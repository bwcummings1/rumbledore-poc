import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z.string().min(3, 'Username must be at least 3 characters').optional(),
  displayName: z.string().min(1, 'Display name is required').optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validatedData = signupSchema.parse(body);
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });
    
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        password: hashedPassword,
        username: validatedData.username || validatedData.email.split('@')[0],
        displayName: validatedData.displayName || validatedData.email.split('@')[0],
        // Assign default member role
        userRoles: {
          create: {
            role: {
              connectOrCreate: {
                where: { name: 'MEMBER' },
                create: {
                  name: 'MEMBER',
                  description: 'Default member role',
                  permissions: {
                    create: [
                      {
                        permission: {
                          connectOrCreate: {
                            where: { name: 'VIEW_LEAGUES' },
                            create: {
                              name: 'VIEW_LEAGUES',
                              description: 'Can view leagues',
                              resource: 'LEAGUE',
                              action: 'READ',
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        createdAt: true,
      },
    });
    
    // Log signup event
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SIGNUP',
        entityType: 'USER',
        entityId: user.id,
        metadata: {
          email: user.email,
          username: user.username,
        },
      },
    });
    
    return NextResponse.json(
      {
        message: 'Account created successfully',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}