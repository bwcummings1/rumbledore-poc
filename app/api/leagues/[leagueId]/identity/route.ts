import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler, ApiError, parseRequestBody, validateRequest } from '@/lib/api/handler';
import { PlayerIdentityResolver } from '@/lib/identity/player-resolver';
import { TeamIdentityResolver } from '@/lib/identity/team-resolver';
import { IdentityAuditLogger } from '@/lib/identity/audit-logger';
import { prisma } from '@/lib/prisma';

// Request schemas
const resolveSchema = z.object({
  entityType: z.enum(['player', 'team']),
  options: z.object({
    seasons: z.array(z.number()).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    autoApprove: z.boolean().optional(),
    skipExisting: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
});

const mergeSchema = z.object({
  entityType: z.enum(['player', 'team']),
  primaryId: z.string(),
  secondaryId: z.string(),
  reason: z.string().optional(),
});

const splitSchema = z.object({
  entityType: z.enum(['player', 'team']),
  identityId: z.string(),
  mappingIds: z.array(z.string()),
  reason: z.string().optional(),
});

/**
 * POST /api/leagues/[leagueId]/identity
 * Perform identity resolution actions
 */
export const POST = createApiHandler(async (request, context) => {
  const { leagueId } = context.params as { leagueId: string };
  const body = await parseRequestBody(request);
  
  // Mock user ID for now (should come from auth)
  const userId = 'mock-user-id';
  
  if (!body?.action) {
    throw new ApiError('Action is required', 400);
  }
  
  const auditLogger = new IdentityAuditLogger();
  
  switch (body.action) {
    case 'resolve': {
      const data = validateRequest(resolveSchema, body);
      
      if (data.entityType === 'player') {
        const resolver = new PlayerIdentityResolver();
        const result = await resolver.resolveIdentities(leagueId, data.options);
        
        // Log resolution action
        await auditLogger.logAction({
          entityType: 'PLAYER',
          entityId: leagueId,
          action: 'CREATE',
          afterState: {
            resolved: result.autoMatched,
            pending: result.manualReviewRequired,
            options: data.options,
          },
          reason: 'Automatic identity resolution',
        }, userId);
        
        return NextResponse.json(result);
      } else {
        const resolver = new TeamIdentityResolver();
        const result = await resolver.resolveTeamIdentities(leagueId, {
          seasons: data.options?.seasons,
          autoResolve: data.options?.autoApprove,
        });
        
        // Log resolution action
        await auditLogger.logAction({
          entityType: 'TEAM',
          entityId: leagueId,
          action: 'CREATE',
          afterState: {
            resolved: result.resolved,
            options: data.options,
          },
          reason: 'Automatic team identity resolution',
        }, userId);
        
        return NextResponse.json(result);
      }
    }
    
    case 'merge': {
      const data = validateRequest(mergeSchema, body);
      
      if (data.entityType === 'player') {
        const resolver = new PlayerIdentityResolver();
        await resolver.mergeIdentities({
          entityType: 'PLAYER',
          primaryId: data.primaryId,
          secondaryId: data.secondaryId,
          reason: data.reason,
        });
      } else {
        const resolver = new TeamIdentityResolver();
        await resolver.mergeTeamIdentities(
          data.primaryId,
          data.secondaryId,
          data.reason
        );
      }
      
      return NextResponse.json({ success: true });
    }
    
    case 'split': {
      const data = validateRequest(splitSchema, body);
      
      if (data.entityType === 'player') {
        const resolver = new PlayerIdentityResolver();
        await resolver.splitIdentity({
          entityType: 'PLAYER',
          identityId: data.identityId,
          mappingIds: data.mappingIds,
          reason: data.reason,
        });
      } else {
        // Team split not implemented yet
        throw new ApiError('Team split not yet implemented', 501);
      }
      
      return NextResponse.json({ success: true });
    }
    
    default:
      throw new ApiError('Invalid action', 400);
  }
});

/**
 * GET /api/leagues/[leagueId]/identity
 * Get identity information
 */
export const GET = createApiHandler(async (request, context) => {
  const { leagueId } = context.params as { leagueId: string };
  const { searchParams } = new URL(request.url);
  
  const type = searchParams.get('type') || 'summary';
  const entityType = searchParams.get('entityType') as 'player' | 'team' | null;
  
  switch (type) {
    case 'summary': {
      // Get summary of identity resolution status
      const playerIdentities = await prisma.playerIdentity.count();
      const playerMappings = await prisma.playerIdentityMapping.count();
      
      const teamIdentities = await prisma.teamIdentity.count({
        where: { leagueId },
      });
      const teamMappings = await prisma.teamIdentityMapping.count({
        where: { leagueId },
      });
      
      return NextResponse.json({
        players: {
          identities: playerIdentities,
          mappings: playerMappings,
          averageMappingsPerIdentity: playerMappings / Math.max(playerIdentities, 1),
        },
        teams: {
          identities: teamIdentities,
          mappings: teamMappings,
          averageMappingsPerIdentity: teamMappings / Math.max(teamIdentities, 1),
        },
      });
    }
    
    case 'identities': {
      // Get list of identities
      if (entityType === 'player') {
        const identities = await prisma.playerIdentity.findMany({
          include: {
            mappings: {
              orderBy: { season: 'asc' },
            },
          },
          take: 100,
        });
        
        return NextResponse.json(identities);
      } else if (entityType === 'team') {
        const identities = await prisma.teamIdentity.findMany({
          where: { leagueId },
          include: {
            mappings: {
              orderBy: { season: 'asc' },
            },
          },
        });
        
        return NextResponse.json(identities);
      } else {
        throw new ApiError('Entity type required', 400);
      }
    }
    
    case 'audit': {
      // Get audit trail
      const auditLogger = new IdentityAuditLogger();
      const trail = await auditLogger.getLeagueAuditTrail(leagueId, 50);
      
      return NextResponse.json(trail);
    }
    
    case 'stats': {
      // Get audit statistics
      const auditLogger = new IdentityAuditLogger();
      const stats = await auditLogger.getAuditStatistics({
        entityType: entityType === 'player' ? 'PLAYER' : entityType === 'team' ? 'TEAM' : undefined,
      });
      
      return NextResponse.json(stats);
    }
    
    default:
      throw new ApiError('Invalid type parameter', 400);
  }
});

/**
 * DELETE /api/leagues/[leagueId]/identity
 * Delete identity mappings
 */
export const DELETE = createApiHandler(async (request, context) => {
  const { leagueId } = context.params as { leagueId: string };
  const { searchParams } = new URL(request.url);
  
  const entityType = searchParams.get('entityType') as 'player' | 'team';
  const identityId = searchParams.get('identityId');
  
  if (!entityType || !identityId) {
    throw new ApiError('Entity type and identity ID required', 400);
  }
  
  // Mock user ID for now
  const userId = 'mock-user-id';
  const auditLogger = new IdentityAuditLogger();
  
  if (entityType === 'player') {
    // Get identity before deletion for audit
    const identity = await prisma.playerIdentity.findUnique({
      where: { id: identityId },
      include: { mappings: true },
    });
    
    if (!identity) {
      throw new ApiError('Player identity not found', 404);
    }
    
    // Delete all mappings first
    await prisma.playerIdentityMapping.deleteMany({
      where: { masterPlayerId: identity.masterPlayerId },
    });
    
    // Delete the identity
    await prisma.playerIdentity.delete({
      where: { id: identityId },
    });
    
    // Log deletion
    await auditLogger.logAction({
      entityType: 'PLAYER',
      entityId: identityId,
      action: 'DELETE',
      beforeState: identity,
      reason: 'Manual deletion',
    }, userId);
  } else {
    // Get team identity
    const identity = await prisma.teamIdentity.findUnique({
      where: { id: identityId },
      include: { mappings: true },
    });
    
    if (!identity) {
      throw new ApiError('Team identity not found', 404);
    }
    
    // Verify it belongs to this league
    if (identity.leagueId !== leagueId) {
      throw new ApiError('Team identity does not belong to this league', 403);
    }
    
    // Delete all mappings
    await prisma.teamIdentityMapping.deleteMany({
      where: { masterTeamId: identity.masterTeamId },
    });
    
    // Delete the identity
    await prisma.teamIdentity.delete({
      where: { id: identityId },
    });
    
    // Log deletion
    await auditLogger.logAction({
      entityType: 'TEAM',
      entityId: identityId,
      action: 'DELETE',
      beforeState: identity,
      reason: 'Manual deletion',
    }, userId);
  }
  
  return NextResponse.json({ success: true });
});