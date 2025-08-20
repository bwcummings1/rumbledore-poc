import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { historicalImportManager } from '@/lib/import/historical-import';
import { incrementalSyncManager } from '@/lib/import/incremental-sync';
import { dataIntegrityChecker } from '@/lib/import/integrity-checker';
import { getImportStatus, cancelHistoricalImport } from '@/lib/queue/processors/historical-import';
import { QueueManager, QueueName } from '@/lib/queue/queue';
import { createApiHandler } from '@/lib/api/handler';

// Request body schemas
const startImportSchema = z.object({
  startYear: z.number().min(2010).max(new Date().getFullYear()),
  endYear: z.number().min(2010).max(new Date().getFullYear()),
  options: z.object({
    validateAfterImport: z.boolean().optional(),
    optimizeStorage: z.boolean().optional(),
    skipExistingSeasons: z.boolean().optional(),
  }).optional(),
});

const incrementalSyncSchema = z.object({
  forceRefresh: z.boolean().optional(),
  maxSeasons: z.number().min(1).max(15).optional(),
  includeCurrentSeason: z.boolean().optional(),
});

/**
 * POST /api/import/[leagueId]
 * Start historical data import or incremental sync
 */
export const POST = createApiHandler(async (request: NextRequest, context: any) => {
  const { leagueId } = context.params;
  
  // TODO: Replace with actual auth when implemented
  const userId = 'mock-user-id';
  
  // Verify league exists and user has access
  const league = await prisma.league.findFirst({
    where: {
      id: leagueId,
      members: {
        some: {
          userId,
        },
      },
    },
  });
  
  if (!league) {
    return NextResponse.json(
      { error: 'League not found or access denied' },
      { status: 404 }
    );
  }
  
  const body = await request.json();
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'historical';
  
  if (mode === 'incremental') {
    // Handle incremental sync
    const params = incrementalSyncSchema.parse(body);
    
    // Get sync requirements
    const requirements = await incrementalSyncManager.getSyncRequirements(
      leagueId,
      Number(league.espnLeagueId),
      params
    );
    
    if (requirements.seasons.length === 0 && requirements.currentSeasonWeeks.length === 0) {
      return NextResponse.json({
        message: 'No missing data to sync',
        requirements,
      });
    }
    
    // Start incremental sync
    await incrementalSyncManager.syncIncremental(
      leagueId,
      Number(league.espnLeagueId),
      userId,
      requirements
    );
    
    return NextResponse.json({
      message: 'Incremental sync started',
      requirements,
    });
    
  } else {
    // Handle historical import
    const params = startImportSchema.parse(body);
    
    // Validate year range
    if (params.startYear > params.endYear) {
      return NextResponse.json(
        { error: 'Start year must be before or equal to end year' },
        { status: 400 }
      );
    }
    
    // Check if import already in progress
    const existingImport = await prisma.importCheckpoint.findFirst({
      where: {
        leagueId,
        status: {
          in: ['PENDING', 'RUNNING'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    if (existingImport) {
      return NextResponse.json(
        { 
          error: 'Import already in progress',
          importId: existingImport.importId,
        },
        { status: 409 }
      );
    }
    
    // Start historical import
    const importId = await historicalImportManager.startImport({
      leagueId,
      espnLeagueId: Number(league.espnLeagueId),
      startYear: params.startYear,
      endYear: params.endYear,
      userId,
    });
    
    // Queue the import job with options
    const queue = QueueManager.getInstance();
    await queue.addJob(
      QueueName.HISTORICAL_DATA_IMPORT,
      {
        importId,
        config: {
          leagueId,
          espnLeagueId: Number(league.espnLeagueId),
          startYear: params.startYear,
          endYear: params.endYear,
          userId,
        },
        options: params.options,
      },
      {
        attempts: 1,
        timeout: 3600000, // 1 hour
      }
    );
    
    return NextResponse.json({
      importId,
      message: 'Historical import started',
      yearsToImport: params.endYear - params.startYear + 1,
    });
  }
});

/**
 * GET /api/import/[leagueId]
 * Get import status or sync statistics
 */
export const GET = createApiHandler(async (request: NextRequest, context: any) => {
  const { leagueId } = context.params;
  const url = new URL(request.url);
  const importId = url.searchParams.get('importId');
  const type = url.searchParams.get('type') || 'status';
  
  // TODO: Replace with actual auth
  const userId = 'mock-user-id';
  
  // Verify league access
  const league = await prisma.league.findFirst({
    where: {
      id: leagueId,
      members: {
        some: {
          userId,
        },
      },
    },
  });
  
  if (!league) {
    return NextResponse.json(
      { error: 'League not found or access denied' },
      { status: 404 }
    );
  }
  
  if (type === 'stats') {
    // Get sync statistics
    const stats = await incrementalSyncManager.getSyncStats(leagueId);
    
    return NextResponse.json(stats);
    
  } else if (type === 'integrity') {
    // Run integrity check
    const result = await dataIntegrityChecker.validateImport(leagueId);
    
    return NextResponse.json(result);
    
  } else if (type === 'requirements') {
    // Get sync requirements
    const requirements = await incrementalSyncManager.getSyncRequirements(
      leagueId,
      Number(league.espnLeagueId)
    );
    
    return NextResponse.json(requirements);
    
  } else {
    // Get import status
    if (!importId) {
      // Get latest import for league
      const latestImport = await prisma.importCheckpoint.findFirst({
        where: { leagueId },
        orderBy: { createdAt: 'desc' },
      });
      
      if (!latestImport) {
        return NextResponse.json({
          message: 'No imports found for this league',
        });
      }
      
      const status = await getImportStatus(latestImport.importId);
      return NextResponse.json(status || { message: 'Import not found' });
    }
    
    // Get specific import status
    const status = await getImportStatus(importId);
    
    if (!status) {
      return NextResponse.json(
        { error: 'Import not found' },
        { status: 404 }
      );
    }
    
    // Verify import belongs to league
    if (status.leagueId !== leagueId) {
      return NextResponse.json(
        { error: 'Import does not belong to this league' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(status);
  }
});

/**
 * DELETE /api/import/[leagueId]
 * Cancel running import or clear historical data
 */
export const DELETE = createApiHandler(async (request: NextRequest, context: any) => {
  const { leagueId } = context.params;
  const url = new URL(request.url);
  const importId = url.searchParams.get('importId');
  const action = url.searchParams.get('action') || 'cancel';
  
  // TODO: Replace with actual auth
  const userId = 'mock-user-id';
  
  // Verify league access (admin only for delete operations)
  const member = await prisma.leagueMember.findFirst({
    where: {
      leagueId,
      userId,
      role: {
        in: ['OWNER', 'ADMIN'],
      },
    },
  });
  
  if (!member) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }
  
  if (action === 'clear') {
    // Clear all historical data
    await incrementalSyncManager.clearHistoricalData(leagueId);
    
    return NextResponse.json({
      message: 'Historical data cleared successfully',
    });
    
  } else {
    // Cancel import
    if (!importId) {
      // Find running import
      const runningImport = await prisma.importCheckpoint.findFirst({
        where: {
          leagueId,
          status: 'RUNNING',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      
      if (!runningImport) {
        return NextResponse.json(
          { error: 'No running import found' },
          { status: 404 }
        );
      }
      
      await cancelHistoricalImport(runningImport.importId);
      
      return NextResponse.json({
        message: 'Import cancelled',
        importId: runningImport.importId,
      });
    }
    
    // Cancel specific import
    const importCheckpoint = await prisma.importCheckpoint.findFirst({
      where: {
        importId,
        leagueId,
      },
    });
    
    if (!importCheckpoint) {
      return NextResponse.json(
        { error: 'Import not found or does not belong to this league' },
        { status: 404 }
      );
    }
    
    if (importCheckpoint.status !== 'RUNNING') {
      return NextResponse.json(
        { error: 'Import is not running' },
        { status: 400 }
      );
    }
    
    await cancelHistoricalImport(importId);
    
    return NextResponse.json({
      message: 'Import cancelled',
      importId,
    });
  }
});

/**
 * PATCH /api/import/[leagueId]
 * Resume paused import or fix integrity issues
 */
export const PATCH = createApiHandler(async (request: NextRequest, context: any) => {
  const { leagueId } = context.params;
  const body = await request.json();
  const action = body.action || 'resume';
  
  // TODO: Replace with actual auth
  const userId = 'mock-user-id';
  
  // Verify league access
  const member = await prisma.leagueMember.findFirst({
    where: {
      leagueId,
      userId,
    },
  });
  
  if (!member) {
    return NextResponse.json(
      { error: 'League access denied' },
      { status: 403 }
    );
  }
  
  if (action === 'fix-integrity') {
    // Fix common integrity issues
    const fixes = await dataIntegrityChecker.fixCommonIssues(leagueId);
    
    return NextResponse.json({
      message: 'Integrity issues fixed',
      ...fixes,
    });
    
  } else if (action === 'resume') {
    // Resume paused import
    const importId = body.importId;
    
    if (!importId) {
      // Find paused import
      const pausedImport = await prisma.importCheckpoint.findFirst({
        where: {
          leagueId,
          status: 'PAUSED',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      
      if (!pausedImport) {
        return NextResponse.json(
          { error: 'No paused import found' },
          { status: 404 }
        );
      }
      
      // Re-queue the import
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
      });
      
      if (!league) {
        return NextResponse.json(
          { error: 'League not found' },
          { status: 404 }
        );
      }
      
      const queue = QueueManager.getInstance();
      await queue.addJob(
        QueueName.HISTORICAL_DATA_IMPORT,
        {
          importId: pausedImport.importId,
          config: {
            leagueId,
            espnLeagueId: Number(league.espnLeagueId),
            startYear: pausedImport.currentSeason || new Date().getFullYear() - 10,
            endYear: new Date().getFullYear(),
            userId,
          },
        },
        {
          attempts: 1,
          timeout: 3600000,
        }
      );
      
      return NextResponse.json({
        message: 'Import resumed',
        importId: pausedImport.importId,
      });
    }
    
    // Resume specific import
    const importCheckpoint = await prisma.importCheckpoint.findFirst({
      where: {
        importId,
        leagueId,
        status: 'PAUSED',
      },
    });
    
    if (!importCheckpoint) {
      return NextResponse.json(
        { error: 'Paused import not found' },
        { status: 404 }
      );
    }
    
    // Re-queue the import
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });
    
    if (!league) {
      return NextResponse.json(
        { error: 'League not found' },
        { status: 404 }
      );
    }
    
    const queue = QueueManager.getInstance();
    await queue.addJob(
      QueueName.HISTORICAL_DATA_IMPORT,
      {
        importId,
        config: {
          leagueId,
          espnLeagueId: Number(league.espnLeagueId),
          startYear: importCheckpoint.currentSeason || new Date().getFullYear() - 10,
          endYear: new Date().getFullYear(),
          userId,
        },
      },
      {
        attempts: 1,
        timeout: 3600000,
      }
    );
    
    return NextResponse.json({
      message: 'Import resumed',
      importId,
    });
  }
  
  return NextResponse.json(
    { error: 'Invalid action' },
    { status: 400 }
  );
});