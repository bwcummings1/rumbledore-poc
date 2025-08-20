import { EventEmitter } from 'events';
import { prisma } from '@/lib/prisma';
import { ImportStatus } from '@prisma/client';

export interface ImportProgressData {
  id: string;
  leagueId: string;
  totalItems: number;
  processedItems: number;
  status: ImportStatus;
  startTime: number;
  endTime?: number;
  duration?: number;
  checkpoints: ProgressCheckpoint[];
  errors: ProgressError[];
  currentOperation?: string;
  estimatedTimeRemaining?: number;
}

export interface ProgressCheckpoint {
  timestamp: number;
  processedItems: number;
  operation: string;
  metadata?: any;
}

export interface ProgressError {
  message: string;
  stack?: string;
  timestamp: number;
  context?: any;
}

export interface ProgressEvent {
  importId: string;
  percentage: number;
  processedItems: number;
  totalItems: number;
  currentOperation?: string;
  estimatedTimeRemaining?: number;
}

export class ImportProgressTracker extends EventEmitter {
  private progress: Map<string, ImportProgressData> = new Map();
  private checkpointInterval = 100; // Save checkpoint every 100 records
  private recordCount = 0;
  private lastCheckpointTime = 0;

  /**
   * Start tracking an import
   */
  startTracking(importId: string, leagueId: string, totalItems: number): void {
    const progress: ImportProgressData = {
      id: importId,
      leagueId,
      totalItems,
      processedItems: 0,
      status: ImportStatus.RUNNING,
      startTime: Date.now(),
      checkpoints: [],
      errors: [],
    };
    
    this.progress.set(importId, progress);
    this.emit('started', { importId, totalItems });
  }

  /**
   * Update progress
   */
  updateProgress(
    importId: string,
    increment: number = 1,
    operation?: string,
    metadata?: any
  ): void {
    const progress = this.progress.get(importId);
    if (!progress) return;
    
    progress.processedItems += increment;
    this.recordCount += increment;
    
    if (operation) {
      progress.currentOperation = operation;
    }
    
    // Calculate percentage
    const percentage = Math.round(
      (progress.processedItems / progress.totalItems) * 100
    );
    
    // Calculate estimated time remaining
    const elapsedTime = Date.now() - progress.startTime;
    const itemsPerMs = progress.processedItems / elapsedTime;
    const remainingItems = progress.totalItems - progress.processedItems;
    progress.estimatedTimeRemaining = Math.round(remainingItems / itemsPerMs);
    
    // Emit progress event
    const event: ProgressEvent = {
      importId,
      percentage,
      processedItems: progress.processedItems,
      totalItems: progress.totalItems,
      currentOperation: progress.currentOperation,
      estimatedTimeRemaining: progress.estimatedTimeRemaining,
    };
    
    this.emit('progress', event);
    
    // Save checkpoint if needed
    const shouldCheckpoint = 
      this.recordCount >= this.checkpointInterval ||
      Date.now() - this.lastCheckpointTime > 30000; // Also checkpoint every 30 seconds
    
    if (shouldCheckpoint) {
      this.saveCheckpoint(importId, operation, metadata);
      this.recordCount = 0;
      this.lastCheckpointTime = Date.now();
    }
  }

  /**
   * Save checkpoint for resumability
   */
  async saveCheckpoint(importId: string, operation?: string, metadata?: any): Promise<void> {
    const progress = this.progress.get(importId);
    if (!progress) return;
    
    const checkpoint: ProgressCheckpoint = {
      timestamp: Date.now(),
      processedItems: progress.processedItems,
      operation: operation || 'checkpoint',
      metadata,
    };
    
    progress.checkpoints.push(checkpoint);
    
    // Keep only last 10 checkpoints in memory
    if (progress.checkpoints.length > 10) {
      progress.checkpoints = progress.checkpoints.slice(-10);
    }
    
    // Persist to database
    try {
      await prisma.importCheckpoint.upsert({
        where: { importId },
        update: {
          processedItems: progress.processedItems,
          totalItems: progress.totalItems,
          currentSeason: metadata?.season,
          currentWeek: metadata?.week,
          status: progress.status,
          metadata: {
            checkpoints: progress.checkpoints,
            errors: progress.errors,
            currentOperation: progress.currentOperation,
            estimatedTimeRemaining: progress.estimatedTimeRemaining,
          },
        },
        create: {
          importId,
          leagueId: progress.leagueId,
          processedItems: progress.processedItems,
          totalItems: progress.totalItems,
          currentSeason: metadata?.season,
          currentWeek: metadata?.week,
          status: progress.status,
          metadata: {
            checkpoints: progress.checkpoints,
            errors: progress.errors,
            currentOperation: progress.currentOperation,
            estimatedTimeRemaining: progress.estimatedTimeRemaining,
          },
        },
      });
      
      console.log(`Checkpoint saved for ${importId}: ${progress.processedItems}/${progress.totalItems} items`);
    } catch (error: any) {
      console.error(`Failed to save checkpoint for ${importId}:`, error);
      // Don't throw - checkpointing failure shouldn't stop the import
    }
  }

  /**
   * Resume from checkpoint
   */
  async resumeFromCheckpoint(importId: string): Promise<ImportProgressData | null> {
    const lastCheckpoint = await prisma.importCheckpoint.findFirst({
      where: { importId },
      orderBy: { createdAt: 'desc' },
    });
    
    if (!lastCheckpoint) {
      return null;
    }
    
    const metadata = lastCheckpoint.metadata as any;
    const progress: ImportProgressData = {
      id: importId,
      leagueId: lastCheckpoint.leagueId,
      totalItems: lastCheckpoint.totalItems,
      processedItems: lastCheckpoint.processedItems,
      status: ImportStatus.RUNNING, // Reset to running when resuming
      startTime: Date.now(), // Reset start time for accurate time estimates
      checkpoints: metadata?.checkpoints || [],
      errors: metadata?.errors || [],
      currentOperation: metadata?.currentOperation,
    };
    
    this.progress.set(importId, progress);
    
    console.log(`Resuming ${importId} from checkpoint: ${progress.processedItems}/${progress.totalItems} items`);
    
    this.emit('resumed', {
      importId,
      processedItems: progress.processedItems,
      totalItems: progress.totalItems,
    });
    
    return progress;
  }

  /**
   * Mark import as completed
   */
  async completeImport(importId: string): Promise<void> {
    const progress = this.progress.get(importId);
    if (!progress) return;
    
    progress.status = ImportStatus.COMPLETED;
    progress.endTime = Date.now();
    progress.duration = progress.endTime - progress.startTime;
    
    // Save final state
    await this.saveCheckpoint(importId, 'completed');
    
    // Update database status
    await prisma.importCheckpoint.update({
      where: { importId },
      data: {
        status: ImportStatus.COMPLETED,
        metadata: {
          ...((await prisma.importCheckpoint.findUnique({
            where: { importId },
            select: { metadata: true },
          }))?.metadata as any || {}),
          completedAt: new Date(),
          duration: progress.duration,
        },
      },
    });
    
    this.emit('completed', {
      importId,
      duration: progress.duration,
      totalItems: progress.totalItems,
    });
    
    // Clean up from memory after a delay
    setTimeout(() => {
      this.progress.delete(importId);
    }, 60000); // Keep in memory for 1 minute after completion
  }

  /**
   * Mark import as failed
   */
  async failImport(importId: string, error: Error): Promise<void> {
    const progress = this.progress.get(importId);
    if (!progress) return;
    
    progress.status = ImportStatus.FAILED;
    progress.endTime = Date.now();
    progress.duration = progress.endTime - progress.startTime;
    
    const progressError: ProgressError = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
    };
    
    progress.errors.push(progressError);
    
    // Save final state
    await this.saveCheckpoint(importId, 'failed', { error: error.message });
    
    // Update database status
    await prisma.importCheckpoint.update({
      where: { importId },
      data: {
        status: ImportStatus.FAILED,
        metadata: {
          ...((await prisma.importCheckpoint.findUnique({
            where: { importId },
            select: { metadata: true },
          }))?.metadata as any || {}),
          failedAt: new Date(),
          lastError: error.message,
        },
      },
    });
    
    this.emit('failed', {
      importId,
      error: error.message,
    });
  }

  /**
   * Pause import
   */
  async pauseImport(importId: string): Promise<void> {
    const progress = this.progress.get(importId);
    if (!progress) return;
    
    progress.status = ImportStatus.PAUSED;
    
    // Save current state
    await this.saveCheckpoint(importId, 'paused');
    
    // Update database status
    await prisma.importCheckpoint.update({
      where: { importId },
      data: {
        status: ImportStatus.PAUSED,
      },
    });
    
    this.emit('paused', { importId });
  }

  /**
   * Get current progress
   */
  getProgress(importId: string): ImportProgressData | undefined {
    return this.progress.get(importId);
  }

  /**
   * Get all active imports
   */
  getActiveImports(): ImportProgressData[] {
    return Array.from(this.progress.values()).filter(
      p => p.status === ImportStatus.RUNNING
    );
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await prisma.importCheckpoint.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        status: {
          in: [ImportStatus.COMPLETED, ImportStatus.FAILED],
        },
      },
    });
    
    console.log(`Cleaned up ${result.count} old checkpoints`);
    return result.count;
  }

  /**
   * Get import history for a league
   */
  async getImportHistory(leagueId: string, limit: number = 10): Promise<any[]> {
    const checkpoints = await prisma.importCheckpoint.findMany({
      where: { leagueId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    return checkpoints.map(checkpoint => ({
      importId: checkpoint.importId,
      status: checkpoint.status,
      processedItems: checkpoint.processedItems,
      totalItems: checkpoint.totalItems,
      createdAt: checkpoint.createdAt,
      metadata: checkpoint.metadata,
    }));
  }

  /**
   * Calculate import statistics
   */
  calculateStats(importId: string): {
    itemsPerSecond: number;
    percentComplete: number;
    estimatedTimeRemaining: string;
    elapsedTime: string;
  } | null {
    const progress = this.progress.get(importId);
    if (!progress) return null;
    
    const elapsedMs = Date.now() - progress.startTime;
    const elapsedSeconds = elapsedMs / 1000;
    const itemsPerSecond = progress.processedItems / elapsedSeconds;
    const percentComplete = (progress.processedItems / progress.totalItems) * 100;
    
    const remainingItems = progress.totalItems - progress.processedItems;
    const remainingSeconds = remainingItems / itemsPerSecond;
    
    return {
      itemsPerSecond: Math.round(itemsPerSecond * 10) / 10,
      percentComplete: Math.round(percentComplete * 10) / 10,
      estimatedTimeRemaining: this.formatDuration(remainingSeconds * 1000),
      elapsedTime: this.formatDuration(elapsedMs),
    };
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Export singleton instance
export const importProgressTracker = new ImportProgressTracker();