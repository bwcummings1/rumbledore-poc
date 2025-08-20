import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();

// Login validation schema
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const { email, password } = LoginSchema.parse(credentials);

          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              userRoles: {
                include: {
                  role: {
                    include: {
                      permissions: {
                        include: {
                          permission: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          if (!user || !user.password) {
            return null;
          }

          const isValidPassword = await bcrypt.compare(password, user.password);
          if (!isValidPassword) {
            return null;
          }

          // Log successful login
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              entityType: 'USER',
              entityId: user.id,
              metadata: {},
            },
          });

          // Extract roles and permissions
          const roles = user.userRoles.map(ur => ur.role.name);
          const permissions = user.userRoles.flatMap(ur => 
            ur.role.permissions.map(rp => rp.permission.name)
          );

          return {
            id: user.id,
            email: user.email,
            name: user.displayName || user.username,
            image: user.avatarUrl,
            roles,
            permissions: [...new Set(permissions)], // Remove duplicates
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.roles = user.roles;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.roles = token.roles || [];
        session.user.permissions = token.permissions || [];
      }
      return session;
    },
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/error',
  },
};

// RBAC Middleware functions
export async function checkPermission(
  userId: string,
  permission: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return false;

  // Check if user has the required permission
  return user.userRoles.some(ur =>
    ur.role.permissions.some(rp => rp.permission.name === permission)
  );
}

export async function requireRole(
  userId: string,
  roleName: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) return false;

  return user.userRoles.some(ur => ur.role.name === roleName);
}

// Helper to check if user is admin
export async function isAdmin(userId: string): Promise<boolean> {
  const adminRoles = ['SUPER_ADMIN', 'LEAGUE_OWNER', 'LEAGUE_ADMIN'];
  
  for (const role of adminRoles) {
    if (await requireRole(userId, role)) {
      return true;
    }
  }
  
  return false;
}