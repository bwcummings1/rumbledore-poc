import { prisma } from '@/lib/prisma';
import { WebSocketServer } from '@/lib/websocket/server';
import {
  IAuditLogger,
  IdentityAuditEntry,
  EntityType,
  AuditAction,
} from '@/types/identity';

/**
 * IdentityAuditLogger class for comprehensive audit trail
 * Logs all identity resolution actions with before/after states
 */
export class IdentityAuditLogger implements IAuditLogger {
  private wsServer: WebSocketServer | null = null;
  
  constructor() {
    // Initialize WebSocket server for real-time monitoring
    try {
      this.wsServer = WebSocketServer.getInstance();
    } catch {
      // WebSocket server may not be initialized in some contexts
    }
  }
  
  /**
   * Log an identity resolution action
   */
  async logAction(
    action: Omit<IdentityAuditEntry, 'id' | 'performedAt'>,
    userId: string
  ): Promise<void> {
    try {
      // Create audit log entry
      const auditEntry = await prisma.identityAuditLog.create({
        data: {
          entityType: action.entityType,
          entityId: action.entityId,
          action: action.action,
          beforeState: action.beforeState || null,
          afterState: action.afterState || null,
          reason: action.reason || null,
          performedBy: userId,
        },
      });
      
      // Emit real-time event for monitoring
      await this.emitAuditEvent({
        ...auditEntry,
        performedAt: auditEntry.performedAt,
      } as IdentityAuditEntry);
      
      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[AUDIT] ${action.action} on ${action.entityType} ${action.entityId} by ${userId}`);
      }
    } catch (error) {
      console.error('Failed to log audit action:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }
  
  /**
   * Get audit trail for an entity
   */
  async getAuditTrail(
    entityType: EntityType,
    entityId: string
  ): Promise<IdentityAuditEntry[]> {
    const logs = await prisma.identityAuditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        performer: {
          select: {
            id: true,
            displayName: true,
            email: true,
            username: true,
          },
        },
      },
      orderBy: {
        performedAt: 'desc',
      },
    });
    
    return logs.map(log => this.formatAuditEntry(log));
  }
  
  /**
   * Get audit trail for a user
   */
  async getUserAuditTrail(
    userId: string,
    limit: number = 100
  ): Promise<IdentityAuditEntry[]> {
    const logs = await prisma.identityAuditLog.findMany({
      where: {
        performedBy: userId,
      },
      include: {
        performer: {
          select: {
            id: true,
            displayName: true,
            email: true,
            username: true,
          },
        },
      },
      orderBy: {
        performedAt: 'desc',
      },
      take: limit,
    });
    
    return logs.map(log => this.formatAuditEntry(log));
  }
  
  /**
   * Get recent audit activity for a league
   */
  async getLeagueAuditTrail(
    leagueId: string,
    limit: number = 100
  ): Promise<IdentityAuditEntry[]> {
    // Get all team identities for the league
    const teamIdentities = await prisma.teamIdentity.findMany({
      where: { leagueId },
      select: { id: true },
    });
    
    const teamIds = teamIdentities.map(t => t.id);
    
    // Get audit logs for team entities
    const teamLogs = await prisma.identityAuditLog.findMany({
      where: {
        entityType: 'TEAM',
        entityId: { in: teamIds },
      },
      include: {
        performer: {
          select: {
            id: true,
            displayName: true,
            email: true,
            username: true,
          },
        },
      },
      orderBy: {
        performedAt: 'desc',
      },
      take: limit,
    });
    
    // Note: Player identities are not league-scoped, so we only return team logs
    return teamLogs.map(log => this.formatAuditEntry(log));
  }
  
  /**
   * Rollback a change based on audit log
   */
  async rollbackChange(auditLogId: string): Promise<void> {
    const log = await prisma.identityAuditLog.findUnique({
      where: { id: auditLogId },
    });
    
    if (!log) {
      throw new Error('Audit log entry not found');
    }
    
    // Determine rollback action based on original action
    switch (log.action) {
      case 'CREATE':
        await this.rollbackCreate(log);
        break;
      case 'MERGE':
        await this.rollbackMerge(log);
        break;
      case 'SPLIT':
        await this.rollbackSplit(log);
        break;
      case 'UPDATE':
        await this.rollbackUpdate(log);
        break;
      case 'DELETE':
        await this.rollbackDelete(log);
        break;
      case 'ROLLBACK':
        throw new Error('Cannot rollback a rollback action');
      default:
        throw new Error(`Unknown action type: ${log.action}`);
    }
    
    // Log the rollback action
    await this.logAction({
      entityType: log.entityType,
      entityId: log.entityId,
      action: 'ROLLBACK',
      beforeState: log.afterState,
      afterState: log.beforeState,
      reason: `Rollback of action ${log.id}`,
      metadata: {
        originalAction: log.action,
        originalLogId: log.id,
        timestamp: new Date().toISOString(),
      },
    }, log.performedBy || 'system');
  }
  
  /**
   * Rollback a CREATE action (delete the created entity)
   */
  private async rollbackCreate(log: any): Promise<void> {
    if (log.entityType === 'PLAYER') {
      await prisma.playerIdentity.delete({
        where: { id: log.entityId },
      });
    } else if (log.entityType === 'TEAM') {
      await prisma.teamIdentity.delete({
        where: { id: log.entityId },
      });
    }
  }
  
  /**
   * Rollback a MERGE action (split back into original entities)
   */
  private async rollbackMerge(log: any): Promise<void> {
    const beforeState = log.beforeState as any;
    
    if (!beforeState?.primary || !beforeState?.secondary) {
      throw new Error('Cannot rollback merge: missing original state');
    }
    
    if (log.entityType === 'PLAYER') {
      // Recreate secondary identity
      const secondary = await prisma.playerIdentity.create({
        data: {
          masterPlayerId: beforeState.secondary.masterPlayerId,
          canonicalName: beforeState.secondary.canonicalName,
          confidenceScore: beforeState.secondary.confidenceScore,
          verified: beforeState.secondary.verified,
          metadata: beforeState.secondary.metadata,
        },
      });
      
      // Restore mappings to secondary
      if (beforeState.secondary.mappings) {
        for (const mapping of beforeState.secondary.mappings) {
          await prisma.playerIdentityMapping.update({
            where: { id: mapping.id },
            data: { masterPlayerId: secondary.masterPlayerId },
          });
        }
      }
      
      // Restore primary metadata
      await prisma.playerIdentity.update({
        where: { id: log.entityId },
        data: {
          metadata: beforeState.primary.metadata,
        },
      });
    } else if (log.entityType === 'TEAM') {
      // Similar logic for team entities
      const secondary = await prisma.teamIdentity.create({
        data: {
          masterTeamId: beforeState.secondary.masterTeamId,
          leagueId: beforeState.secondary.leagueId,
          canonicalName: beforeState.secondary.canonicalName,
          ownerHistory: beforeState.secondary.ownerHistory,
        },
      });
      
      // Restore mappings
      if (beforeState.secondary.mappings) {
        for (const mapping of beforeState.secondary.mappings) {
          await prisma.teamIdentityMapping.update({
            where: { id: mapping.id },
            data: { masterTeamId: secondary.masterTeamId },
          });
        }
      }
    }
  }
  
  /**
   * Rollback a SPLIT action (merge back into single entity)
   */
  private async rollbackSplit(log: any): Promise<void> {
    const afterState = log.afterState as any;
    
    if (!afterState?.split || !afterState?.mappingsSplit) {
      throw new Error('Cannot rollback split: missing split information');
    }
    
    if (log.entityType === 'PLAYER') {
      // Move mappings back to original identity
      await prisma.playerIdentityMapping.updateMany({
        where: { id: { in: afterState.mappingsSplit } },
        data: { masterPlayerId: log.entityId },
      });
      
      // Delete the split identity
      await prisma.playerIdentity.delete({
        where: { id: afterState.split },
      });
    } else if (log.entityType === 'TEAM') {
      // Similar logic for teams
      await prisma.teamIdentityMapping.updateMany({
        where: { id: { in: afterState.mappingsSplit } },
        data: { masterTeamId: log.entityId },
      });
      
      await prisma.teamIdentity.delete({
        where: { id: afterState.split },
      });
    }
  }
  
  /**
   * Rollback an UPDATE action (restore previous values)
   */
  private async rollbackUpdate(log: any): Promise<void> {
    const beforeState = log.beforeState as any;
    
    if (!beforeState) {
      throw new Error('Cannot rollback update: missing original state');
    }
    
    if (log.entityType === 'PLAYER') {
      await prisma.playerIdentity.update({
        where: { id: log.entityId },
        data: beforeState,
      });
    } else if (log.entityType === 'TEAM') {
      await prisma.teamIdentity.update({
        where: { id: log.entityId },
        data: beforeState,
      });
    }
  }
  
  /**
   * Rollback a DELETE action (recreate the entity)
   */
  private async rollbackDelete(log: any): Promise<void> {
    const beforeState = log.beforeState as any;
    
    if (!beforeState) {
      throw new Error('Cannot rollback delete: missing original state');
    }
    
    if (log.entityType === 'PLAYER') {
      await prisma.playerIdentity.create({
        data: beforeState,
      });
    } else if (log.entityType === 'TEAM') {
      await prisma.teamIdentity.create({
        data: beforeState,
      });
    }
  }
  
  /**
   * Format audit entry for response
   */
  private formatAuditEntry(log: any): IdentityAuditEntry {
    return {
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      beforeState: log.beforeState,
      afterState: log.afterState,
      reason: log.reason,
      metadata: {
        confidence: log.beforeState?.confidence || log.afterState?.confidence,
        method: log.beforeState?.method || log.afterState?.method,
        timestamp: log.performedAt.toISOString(),
        performer: log.performer ? {
          id: log.performer.id,
          name: log.performer.displayName || log.performer.username,
          email: log.performer.email,
        } : undefined,
      },
      performedBy: log.performedBy,
      performedAt: log.performedAt,
    };
  }
  
  /**
   * Emit audit event via WebSocket
   */
  private async emitAuditEvent(entry: IdentityAuditEntry): Promise<void> {
    if (!this.wsServer) return;
    
    try {
      // Emit to admin room for monitoring
      this.wsServer.emit('admin', 'audit:identity', {
        type: 'identity_audit',
        data: entry,
        timestamp: new Date().toISOString(),
      });
      
      // Emit to specific entity room
      const roomName = `${entry.entityType.toLowerCase()}_${entry.entityId}`;
      this.wsServer.emit(roomName, 'audit:update', {
        type: 'audit_update',
        data: entry,
      });
    } catch (error) {
      console.error('Failed to emit audit event:', error);
    }
  }
  
  /**
   * Get audit statistics for reporting
   */
  async getAuditStatistics(
    options: {
      entityType?: EntityType;
      startDate?: Date;
      endDate?: Date;
      userId?: string;
    } = {}
  ): Promise<{
    totalActions: number;
    actionBreakdown: Record<string, number>;
    userActivity: Array<{ userId: string; actions: number }>;
    recentActivity: Array<{ date: string; count: number }>;
  }> {
    const where: any = {};
    
    if (options.entityType) {
      where.entityType = options.entityType;
    }
    
    if (options.userId) {
      where.performedBy = options.userId;
    }
    
    if (options.startDate || options.endDate) {
      where.performedAt = {};
      if (options.startDate) {
        where.performedAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.performedAt.lte = options.endDate;
      }
    }
    
    // Get all matching logs
    const logs = await prisma.identityAuditLog.findMany({
      where,
      select: {
        action: true,
        performedBy: true,
        performedAt: true,
      },
    });
    
    // Calculate statistics
    const actionBreakdown: Record<string, number> = {};
    const userActivityMap = new Map<string, number>();
    const dailyActivity = new Map<string, number>();
    
    for (const log of logs) {
      // Action breakdown
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
      
      // User activity
      if (log.performedBy) {
        const count = userActivityMap.get(log.performedBy) || 0;
        userActivityMap.set(log.performedBy, count + 1);
      }
      
      // Daily activity
      const date = log.performedAt.toISOString().split('T')[0];
      const dayCount = dailyActivity.get(date) || 0;
      dailyActivity.set(date, dayCount + 1);
    }
    
    // Format results
    const userActivity = Array.from(userActivityMap.entries())
      .map(([userId, actions]) => ({ userId, actions }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 10); // Top 10 users
    
    const recentActivity = Array.from(dailyActivity.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30); // Last 30 days
    
    return {
      totalActions: logs.length,
      actionBreakdown,
      userActivity,
      recentActivity,
    };
  }
}