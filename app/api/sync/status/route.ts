import { NextRequest, NextResponse } from 'next/server';
import { syncManager } from '@/lib/sync/sync-manager';
import { queueManager, QueueName } from '@/lib/queue/queue';

export async function GET(request: NextRequest) {
  try {
    // Get overall health status
    const health = await syncManager.healthCheck();
    
    // Get active syncs
    const activeSyncs = await syncManager.getActiveSyncs();
    
    // Get queue counts for all queues
    const queueCounts = await Promise.all(
      Object.values(QueueName).map(async (queueName) => {
        const counts = await queueManager.getJobCounts(queueName);
        return {
          name: queueName,
          ...counts,
        };
      })
    );
    
    // Get recent jobs
    const recentJobs = await queueManager.getJobs(
      QueueName.LEAGUE_SYNC,
      ['completed', 'failed'],
      0,
      10
    );
    
    const recentJobsFormatted = recentJobs.map(job => ({
      id: job.id,
      leagueId: job.data.leagueId,
      status: job.finishedOn ? 'completed' : job.failedReason ? 'failed' : 'unknown',
      createdAt: new Date(job.timestamp),
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
      attempts: job.attemptsMade,
      failedReason: job.failedReason,
    }));
    
    return NextResponse.json({
      health: {
        overall: health.healthy,
        queues: health.queues,
        cache: health.cache,
        websocket: health.websocket,
      },
      activeSyncs,
      queueCounts,
      recentJobs: recentJobsFormatted,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Sync status API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    switch (action) {
      case 'clearStaleJobs':
        await syncManager.clearStaleJobs();
        return NextResponse.json({
          success: true,
          message: 'Stale jobs cleared',
        });
        
      case 'pauseQueue':
        const { queueName } = await request.json();
        if (queueName && Object.values(QueueName).includes(queueName)) {
          await queueManager.pauseQueue(queueName as QueueName);
          return NextResponse.json({
            success: true,
            message: `Queue ${queueName} paused`,
          });
        } else {
          return NextResponse.json(
            { error: 'Invalid queue name' },
            { status: 400 }
          );
        }
        
      case 'resumeQueue':
        const { queueName: resumeQueueName } = await request.json();
        if (resumeQueueName && Object.values(QueueName).includes(resumeQueueName)) {
          await queueManager.resumeQueue(resumeQueueName as QueueName);
          return NextResponse.json({
            success: true,
            message: `Queue ${resumeQueueName} resumed`,
          });
        } else {
          return NextResponse.json(
            { error: 'Invalid queue name' },
            { status: 400 }
          );
        }
        
      case 'emptyQueue':
        const { queueName: emptyQueueName } = await request.json();
        if (emptyQueueName && Object.values(QueueName).includes(emptyQueueName)) {
          await queueManager.emptyQueue(emptyQueueName as QueueName);
          return NextResponse.json({
            success: true,
            message: `Queue ${emptyQueueName} emptied`,
          });
        } else {
          return NextResponse.json(
            { error: 'Invalid queue name' },
            { status: 400 }
          );
        }
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Sync status action API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}