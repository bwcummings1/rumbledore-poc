// Content Worker - Background Processing
// Sprint 10: Content Pipeline

import { ContentScheduler } from '../ai/content/content-scheduler';

// Initialize scheduler
const scheduler = new ContentScheduler();

// Start the worker
async function start() {
  console.log('[ContentWorker] Starting content pipeline worker...');
  
  try {
    // Initialize scheduler (starts all active schedules)
    await scheduler.initialize();
    
    console.log('[ContentWorker] Content pipeline worker started successfully');
    
    // Keep the process alive
    process.stdin.resume();
    
    // Handle graceful shutdown
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    console.error('[ContentWorker] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('[ContentWorker] Shutting down...');
  
  try {
    await scheduler.shutdown();
    console.log('[ContentWorker] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[ContentWorker] Shutdown error:', error);
    process.exit(1);
  }
}

// Start the worker
start();