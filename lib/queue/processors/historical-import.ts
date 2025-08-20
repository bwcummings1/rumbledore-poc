import Bull from 'bull';
import { historicalImportManager, ImportConfig } from '@/lib/import/historical-import';
import { importProgressTracker } from '@/lib/import/progress-tracker';
import { dataIntegrityChecker } from '@/lib/import/integrity-checker';
import { storageOptimizer } from '@/lib/storage/optimization';
import { WebSocketServer } from '@/lib/websocket/server';
import { prisma } from '@/lib/prisma';

export interface HistoricalImportJob {
  importId: string;
  config: ImportConfig;
  options?: {
    validateAfterImport?: boolean;
    optimizeStorage?: boolean;
    skipExistingSeasons?: boolean;
  };
}

/**
 * Process historical data import job
 */
export async function processHistoricalImport(job: Bull.Job<HistoricalImportJob>): Promise<void> {
  const { importId, config, options = {} } = job.data;
  const wsServer = WebSocketServer.getInstance();
  
  console.log(`Processing historical import job ${importId}`);
  console.log(`League: ${config.leagueId}, Years: ${config.startYear}-${config.endYear}`);
  
  try {
    // Check if we should resume from checkpoint
    const existingProgress = await importProgressTracker.resumeFromCheckpoint(importId);
    
    if (existingProgress) {
      console.log(`Resuming import from checkpoint: ${existingProgress.processedItems}/${existingProgress.totalItems} items`);
      
      // Emit resume event
      await wsServer.emitToLeague(config.leagueId, 'import:resumed', {
        importId,
        processedItems: existingProgress.processedItems,
        totalItems: existingProgress.totalItems,
      });
    } else {
      // Start new tracking
      const totalSeasons = config.endYear - config.startYear + 1;
      importProgressTracker.startTracking(importId, config.leagueId, totalSeasons);
    }
    
    // Update job progress
    await job.progress(10);
    
    // Check for existing seasons if skip option is enabled
    if (options.skipExistingSeasons) {
      const existingSeasons = await prisma.leagueHistoricalData.findMany({
        where: {
          leagueId: config.leagueId,
          season: {
            gte: config.startYear,
            lte: config.endYear,
          },
        },
        select: { season: true },
        distinct: ['season'],
      });
      
      const existingYears = new Set(existingSeasons.map(s => s.season));
      const yearsToImport = [];
      
      for (let year = config.startYear; year <= config.endYear; year++) {
        if (!existingYears.has(year)) {
          yearsToImport.push(year);
        }
      }
      
      if (yearsToImport.length === 0) {
        console.log('All seasons already imported, skipping');
        await importProgressTracker.completeImport(importId);
        await job.progress(100);
        return;
      }
      
      // Update config to only import missing years
      if (yearsToImport.length < config.endYear - config.startYear + 1) {
        config.startYear = Math.min(...yearsToImport);
        config.endYear = Math.max(...yearsToImport);
        console.log(`Adjusted import range to missing years: ${config.startYear}-${config.endYear}`);
      }
    }
    
    // Process the import
    await job.progress(20);
    await historicalImportManager.processImport(importId, config);
    
    // Import completed
    await job.progress(80);
    
    // Run data validation if requested
    if (options.validateAfterImport) {
      console.log('Running data integrity check...');
      
      const integrityResult = await dataIntegrityChecker.validateImport(config.leagueId);
      
      if (!integrityResult.valid) {
        console.warn(`Data integrity issues found: ${integrityResult.issues.length} issues`);
        
        // Emit validation results
        await wsServer.emitToLeague(config.leagueId, 'import:validation', {
          importId,
          valid: integrityResult.valid,
          issues: integrityResult.issues,
          recommendations: integrityResult.recommendations,
        });
        
        // Auto-fix common issues
        if (integrityResult.issues.some(i => i.category === 'duplicates')) {
          console.log('Attempting to fix duplicate records...');
          const fixes = await dataIntegrityChecker.fixCommonIssues(config.leagueId);
          console.log(`Fixed: ${fixes.duplicatesRemoved} duplicates, ${fixes.orphansRemoved} orphans`);
        }
      } else {
        console.log('Data integrity check passed');
      }
      
      await job.progress(90);
    }
    
    // Optimize storage if requested
    if (options.optimizeStorage) {
      console.log('Optimizing storage...');
      
      // Create indexes
      await storageOptimizer.createIndexes();
      
      // Archive old seasons
      const archiveResults = await storageOptimizer.archiveHistoricalData(
        config.leagueId,
        5 // Archive seasons older than 5 years
      );
      
      if (archiveResults.length > 0) {
        console.log(`Archived ${archiveResults.length} seasons`);
        
        const totalSaved = archiveResults.reduce(
          (sum, r) => sum + (r.originalSize - r.compressedSize),
          0
        );
        
        console.log(`Storage saved: ${storageOptimizer.formatBytes(totalSaved)}`);
        
        // Emit optimization results
        await wsServer.emitToLeague(config.leagueId, 'import:optimized', {
          importId,
          seasonsArchived: archiveResults.length,
          storageSaved: totalSaved,
        });
      }
      
      // Run vacuum analyze
      await storageOptimizer.optimizeTables();
      
      await job.progress(95);
    }
    
    // Mark import as completed
    await importProgressTracker.completeImport(importId);
    
    // Get final statistics
    const stats = await prisma.syncMetadata.findUnique({
      where: { leagueId: config.leagueId },
    });
    
    // Emit completion event
    await wsServer.emitToLeague(config.leagueId, 'import:completed', {
      importId,
      totalSeasons: stats?.totalSeasons || 0,
      totalMatchups: stats?.totalMatchups || 0,
      totalPlayers: stats?.totalPlayers || 0,
    });
    
    await job.progress(100);
    
    console.log(`Historical import ${importId} completed successfully`);
    
  } catch (error: any) {
    console.error(`Historical import ${importId} failed:`, error);
    
    // Mark import as failed
    await importProgressTracker.failImport(importId, error);
    
    // Emit failure event
    await wsServer.emitToLeague(config.leagueId, 'import:failed', {
      importId,
      error: error.message,
    });
    
    throw error;
  }
}

/**
 * Cancel a running import
 */
export async function cancelHistoricalImport(importId: string): Promise<void> {
  console.log(`Cancelling import ${importId}`);
  
  // Mark as paused in tracker
  await importProgressTracker.pauseImport(importId);
  
  // Cancel in import manager
  await historicalImportManager.cancelImport(importId);
  
  // Get import details for websocket emission
  const checkpoint = await prisma.importCheckpoint.findFirst({
    where: { importId },
    select: { leagueId: true },
  });
  
  if (checkpoint) {
    const wsServer = WebSocketServer.getInstance();
    await wsServer.emitToLeague(checkpoint.leagueId, 'import:cancelled', {
      importId,
    });
  }
}

/**
 * Get import status
 */
export async function getImportStatus(importId: string): Promise<any> {
  // Check in-memory progress first
  const progress = importProgressTracker.getProgress(importId);
  
  if (progress) {
    const stats = importProgressTracker.calculateStats(importId);
    return {
      ...progress,
      stats,
      source: 'memory',
    };
  }
  
  // Check database checkpoint
  const checkpoint = await prisma.importCheckpoint.findFirst({
    where: { importId },
    orderBy: { createdAt: 'desc' },
  });
  
  if (checkpoint) {
    return {
      id: checkpoint.importId,
      leagueId: checkpoint.leagueId,
      status: checkpoint.status,
      processedItems: checkpoint.processedItems,
      totalItems: checkpoint.totalItems,
      currentSeason: checkpoint.currentSeason,
      metadata: checkpoint.metadata,
      createdAt: checkpoint.createdAt,
      source: 'database',
    };
  }
  
  return null;
}

/**
 * Clean up old import jobs
 */
export async function cleanupOldImports(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  // Clean up checkpoints
  const checkpointsDeleted = await importProgressTracker.cleanupOldCheckpoints(daysToKeep);
  
  // Clean up database records
  const dbDeleted = await prisma.importCheckpoint.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
      status: {
        in: ['COMPLETED', 'FAILED'],
      },
    },
  });
  
  console.log(`Cleaned up ${checkpointsDeleted + dbDeleted.count} old import records`);
  
  return checkpointsDeleted + dbDeleted.count;
}