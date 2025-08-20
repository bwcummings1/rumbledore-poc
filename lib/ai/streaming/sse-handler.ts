/**
 * Server-Sent Events (SSE) Handler for Streaming AI Responses
 * 
 * Enables real-time streaming of AI agent responses to improve UX
 * by showing text as it's generated rather than waiting for completion.
 */

import { BaseAgent } from '../base-agent';

export interface StreamingOptions {
  onToken?: (token: string) => void;
  onToolStart?: (toolName: string) => void;
  onToolEnd?: (toolName: string, result: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export class SSEHandler {
  private encoder = new TextEncoder();

  /**
   * Create a streaming response for Server-Sent Events
   */
  createStreamResponse(stream: ReadableStream): Response {
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  }

  /**
   * Create a transform stream for SSE formatting
   */
  createSSETransformStream(): TransformStream<string, Uint8Array> {
    return new TransformStream({
      transform: (chunk: string, controller) => {
        // Format as SSE
        const sseFormatted = `data: ${JSON.stringify({ 
          type: 'token', 
          content: chunk,
          timestamp: Date.now()
        })}\n\n`;
        
        controller.enqueue(this.encoder.encode(sseFormatted));
      },
    });
  }

  /**
   * Stream a message from an agent
   */
  async streamAgentResponse(
    agent: BaseAgent,
    message: string,
    sessionId: string,
    options?: StreamingOptions
  ): Promise<ReadableStream> {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Process in background
    this.processStreamingResponse(agent, message, sessionId, writer, options);

    return readable;
  }

  /**
   * Process the streaming response
   */
  private async processStreamingResponse(
    agent: BaseAgent,
    message: string,
    sessionId: string,
    writer: WritableStreamDefaultWriter,
    options?: StreamingOptions
  ): Promise<void> {
    try {
      // Send initial event
      await this.sendEvent(writer, {
        type: 'start',
        agentType: agent.config.type,
        sessionId,
      });

      // Initialize agent if needed
      if (!agent.isInitialized) {
        await this.sendEvent(writer, { type: 'status', message: 'Initializing agent...' });
        await agent.initialize();
      }

      // Get streaming response from agent
      const streamingResponse = await agent.processMessageStreaming(message, sessionId);
      
      // Stream tokens
      for await (const chunk of streamingResponse) {
        if (typeof chunk === 'string') {
          await this.sendEvent(writer, {
            type: 'token',
            content: chunk,
          });
          options?.onToken?.(chunk);
        } else if (chunk.type === 'tool_start') {
          await this.sendEvent(writer, {
            type: 'tool_start',
            tool: chunk.tool,
          });
          options?.onToolStart?.(chunk.tool);
        } else if (chunk.type === 'tool_end') {
          await this.sendEvent(writer, {
            type: 'tool_end',
            tool: chunk.tool,
            result: chunk.result,
          });
          options?.onToolEnd?.(chunk.tool, chunk.result);
        }
      }

      // Send completion event
      await this.sendEvent(writer, {
        type: 'complete',
        timestamp: Date.now(),
      });
      
      options?.onComplete?.();
    } catch (error) {
      // Send error event
      await this.sendEvent(writer, {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      options?.onError?.(error as Error);
    } finally {
      await writer.close();
    }
  }

  /**
   * Send an SSE event
   */
  private async sendEvent(
    writer: WritableStreamDefaultWriter,
    data: any
  ): Promise<void> {
    const event = `data: ${JSON.stringify(data)}\n\n`;
    await writer.write(this.encoder.encode(event));
  }

  /**
   * Parse SSE data on the client side
   */
  static parseSSEData(data: string): any {
    try {
      return JSON.parse(data);
    } catch {
      return { type: 'raw', content: data };
    }
  }
}

/**
 * Client-side SSE consumer
 */
export class SSEClient {
  private eventSource?: EventSource;
  private abortController?: AbortController;

  /**
   * Connect to SSE endpoint
   */
  connect(
    url: string,
    options: {
      onMessage: (data: any) => void;
      onError?: (error: Event) => void;
      onOpen?: () => void;
      onComplete?: () => void;
    }
  ): void {
    // For POST requests, use fetch with ReadableStream
    this.abortController = new AbortController();
    
    this.fetchSSE(url, options);
  }

  /**
   * Fetch with SSE support for POST requests
   */
  private async fetchSSE(
    url: string,
    options: {
      onMessage: (data: any) => void;
      onError?: (error: Event) => void;
      onOpen?: () => void;
      onComplete?: () => void;
    },
    body?: any
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      options.onOpen?.();

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          options.onComplete?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            const parsed = SSEHandler.parseSSEData(data);
            options.onMessage(parsed);
            
            if (parsed.type === 'complete') {
              options.onComplete?.();
              return;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        options.onError?.(new Event('error'));
      }
    }
  }

  /**
   * Disconnect from SSE
   */
  disconnect(): void {
    this.eventSource?.close();
    this.abortController?.abort();
  }
}

/**
 * React hook for SSE streaming (for use in components)
 */
export function useSSEStream(url: string) {
  const [messages, setMessages] = React.useState<any[]>([]);
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const clientRef = React.useRef<SSEClient>();

  React.useEffect(() => {
    const client = new SSEClient();
    clientRef.current = client;

    client.connect(url, {
      onOpen: () => setIsConnected(true),
      onMessage: (data) => {
        setMessages(prev => [...prev, data]);
      },
      onError: (err) => {
        setError(new Error('SSE connection error'));
        setIsConnected(false);
      },
      onComplete: () => {
        setIsConnected(false);
      },
    });

    return () => {
      client.disconnect();
    };
  }, [url]);

  const sendMessage = React.useCallback(async (message: any) => {
    // For POST requests with SSE
    const client = new SSEClient();
    setMessages([]);
    setError(null);
    
    client.connect(url, {
      onOpen: () => setIsConnected(true),
      onMessage: (data) => {
        setMessages(prev => [...prev, data]);
      },
      onError: (err) => {
        setError(new Error('SSE connection error'));
        setIsConnected(false);
      },
      onComplete: () => {
        setIsConnected(false);
      },
    });
  }, [url]);

  return {
    messages,
    isConnected,
    error,
    sendMessage,
    disconnect: () => clientRef.current?.disconnect(),
  };
}

// React import for the hook
import * as React from 'react';