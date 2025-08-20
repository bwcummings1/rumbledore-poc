import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuditLogEntry {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogger {
  private static instance: AuditLogger;

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          metadata: entry.metadata || {},
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw - audit logging should not break the application
    }
  }

  async logAdminAction(
    userId: string,
    action: string,
    details: {
      entityType?: string;
      entityId?: string;
      oldValue?: any;
      newValue?: any;
      metadata?: any;
    },
    request?: Request
  ): Promise<void> {
    const ipAddress = request?.headers?.get('x-forwarded-for') || 
                     request?.headers?.get('x-real-ip') || 
                     'unknown';
    const userAgent = request?.headers?.get('user-agent') || 'unknown';

    await this.log({
      userId,
      action,
      entityType: details.entityType,
      entityId: details.entityId,
      oldValue: details.oldValue,
      newValue: details.newValue,
      metadata: details.metadata,
      ipAddress,
      userAgent,
    });
  }

  async getAuditLogs(filters?: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    const where: any = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.action) where.action = filters.action;
    
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    return await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });
  }

  // Specific logging methods for common actions
  async logLogin(userId: string, request?: Request): Promise<void> {
    await this.logAdminAction(userId, 'LOGIN', { entityType: 'USER', entityId: userId }, request);
  }

  async logLogout(userId: string, request?: Request): Promise<void> {
    await this.logAdminAction(userId, 'LOGOUT', { entityType: 'USER', entityId: userId }, request);
  }

  async logSettingsUpdate(
    userId: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
    request?: Request
  ): Promise<void> {
    await this.logAdminAction(
      userId,
      'UPDATE_SETTINGS',
      { entityType, entityId, oldValue, newValue },
      request
    );
  }

  async logMemberInvite(
    userId: string,
    leagueId: string,
    invitedEmail: string,
    role: string,
    request?: Request
  ): Promise<void> {
    await this.logAdminAction(
      userId,
      'INVITE_MEMBER',
      {
        entityType: 'LEAGUE',
        entityId: leagueId,
        metadata: { invitedEmail, role },
      },
      request
    );
  }

  async logMemberRemove(
    userId: string,
    leagueId: string,
    removedUserId: string,
    request?: Request
  ): Promise<void> {
    await this.logAdminAction(
      userId,
      'REMOVE_MEMBER',
      {
        entityType: 'LEAGUE',
        entityId: leagueId,
        metadata: { removedUserId },
      },
      request
    );
  }

  async logSyncTrigger(
    userId: string,
    leagueId: string,
    syncType: string,
    request?: Request
  ): Promise<void> {
    await this.logAdminAction(
      userId,
      'TRIGGER_SYNC',
      {
        entityType: 'LEAGUE',
        entityId: leagueId,
        metadata: { syncType },
      },
      request
    );
  }

  async logPermissionChange(
    userId: string,
    targetUserId: string,
    oldRole: string,
    newRole: string,
    request?: Request
  ): Promise<void> {
    await this.logAdminAction(
      userId,
      'CHANGE_PERMISSION',
      {
        entityType: 'USER',
        entityId: targetUserId,
        oldValue: { role: oldRole },
        newValue: { role: newRole },
      },
      request
    );
  }
}

export const auditLogger = AuditLogger.getInstance();