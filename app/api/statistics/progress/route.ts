// Statistics Calculation Progress API
// Sprint 6: Statistics Engine

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { StatisticsEngine } from '@/lib/stats/statistics-engine';
import { StatisticsApiResponse } from '@/types/statistics';

const statsEngine = new StatisticsEngine();

const ProgressQuerySchema = z.object({
  jobId: z.string(),
});

// GET /api/statistics/progress - Check calculation job status
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  
  try {
    const query = ProgressQuerySchema.parse({
      jobId: searchParams.get('jobId'),
    });

    const progress = await statsEngine.getProgress(query.jobId);

    if (!progress) {
      return NextResponse.json<StatisticsApiResponse>(
        {
          success: false,
          error: 'Job not found',
          metadata: {
            executionTime: Date.now() - startTime,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json<StatisticsApiResponse>({
      success: true,
      data: {
        jobId: progress.id,
        state: progress.state,
        progress: progress.progress,
        data: progress.data,
        result: progress.returnvalue,
        failedReason: progress.failedReason,
      },
      metadata: {
        executionTime: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[Progress API] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json<StatisticsApiResponse>(
        {
          success: false,
          error: 'Invalid request parameters',
          metadata: {
            executionTime: Date.now() - startTime,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json<StatisticsApiResponse>(
      {
        success: false,
        error: 'Failed to fetch job progress',
        metadata: {
          executionTime: Date.now() - startTime,
        },
      },
      { status: 500 }
    );
  }
}