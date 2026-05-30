import { NextRequest } from 'next/server';
import { onProgress, onComplete, onError, removeAllListeners } from '@/lib/progress-events';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const generationId = request.nextUrl.searchParams.get('generationId');
  if (!generationId) {
    return new Response('Missing generationId parameter', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const cleanup: (() => void)[] = [];

      cleanup.push(
        onProgress(generationId, (data) => {
          const msg = `data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`;
          controller.enqueue(encoder.encode(msg));
        })
      );

      cleanup.push(
        onComplete(generationId, (data) => {
          const msg = `data: ${JSON.stringify({ type: 'complete', ...data })}\n\n`;
          controller.enqueue(encoder.encode(msg));
          controller.close();
        })
      );

      cleanup.push(
        onError(generationId, (data) => {
          const msg = `data: ${JSON.stringify({ type: 'error', ...data })}\n\n`;
          controller.enqueue(encoder.encode(msg));
          controller.close();
        })
      );

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(interval);
        }
      }, 15000);

      (controller as any)._cleanup = () => {
        cleanup.forEach(fn => fn());
        clearInterval(interval);
        removeAllListeners(generationId);
      };
    },
    cancel(controller: any) {
      if (controller._cleanup) controller._cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
