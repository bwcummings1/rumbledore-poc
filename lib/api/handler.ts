import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export interface ApiContext {
  params?: Record<string, string>;
  user?: { id: string; email: string; username: string };
  league?: { id: string; sandboxNamespace: string };
}

export type ApiHandler<T = any> = (
  request: NextRequest,
  context: ApiContext
) => Promise<NextResponse<T>>;

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiHandler<T>(
  handler: ApiHandler<T>
): ApiHandler<T> {
  return async (request, context) => {
    try {
      // Log incoming request in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${request.method} ${request.url}`);
      }

      // Add timing in development
      const startTime = Date.now();
      
      const response = await handler(request, context);
      
      if (process.env.NODE_ENV === 'development') {
        const duration = Date.now() - startTime;
        console.log(`[API] ${request.method} ${request.url} - ${duration}ms`);
      }
      
      return response;
    } catch (error) {
      console.error('[API Error]:', error);
      
      if (error instanceof ApiError) {
        return NextResponse.json(
          { 
            error: error.message, 
            code: error.code 
          },
          { status: error.statusCode }
        );
      }
      
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Validation Error', 
            details: error.errors 
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }
  };
}

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  return schema.parse(data);
}

export async function parseRequestBody(request: NextRequest): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function createErrorResponse(
  message: string,
  status: number = 400,
  code?: string
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status }
  );
}