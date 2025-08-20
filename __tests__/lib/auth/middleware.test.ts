import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { requireAuth, requirePermission, requireAdmin } from '@/lib/auth/middleware';
import { getServerSession } from 'next-auth';

// Mock next-auth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

// Mock auth config
jest.mock('@/lib/auth/auth-config', () => ({
  authOptions: {},
  checkPermission: jest.fn(),
}));

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should throw error if no session exists', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      await expect(requireAuth()).rejects.toThrow('Unauthorized');
    });

    it('should return session if authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          roles: ['MEMBER'],
        },
      };
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);

      const session = await requireAuth();
      expect(session).toEqual(mockSession);
    });
  });

  describe('requireAdmin', () => {
    it('should throw error if user is not admin', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          roles: ['MEMBER'],
        },
      };
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);

      await expect(requireAdmin()).rejects.toThrow('Forbidden');
    });

    it('should return session if user is admin', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'admin@example.com',
          roles: ['SUPER_ADMIN'],
        },
      };
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);

      const session = await requireAdmin();
      expect(session).toEqual(mockSession);
    });

    it('should accept LEAGUE_OWNER as admin', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'owner@example.com',
          roles: ['LEAGUE_OWNER'],
        },
      };
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);

      const session = await requireAdmin();
      expect(session).toEqual(mockSession);
    });

    it('should accept LEAGUE_ADMIN as admin', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'admin@example.com',
          roles: ['LEAGUE_ADMIN'],
        },
      };
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);

      const session = await requireAdmin();
      expect(session).toEqual(mockSession);
    });
  });

  describe('requirePermission', () => {
    it('should check specific permission', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);
      
      const { checkPermission } = require('@/lib/auth/auth-config');
      (checkPermission as jest.Mock).mockResolvedValue(true);

      const session = await requirePermission('leagues.create');
      
      expect(checkPermission).toHaveBeenCalledWith('user-123', 'leagues.create');
      expect(session).toEqual(mockSession);
    });

    it('should throw error if permission denied', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };
      (getServerSession as jest.Mock).mockResolvedValue(mockSession);
      
      const { checkPermission } = require('@/lib/auth/auth-config');
      (checkPermission as jest.Mock).mockResolvedValue(false);

      await expect(requirePermission('system.manage')).rejects.toThrow('Forbidden');
    });
  });
});