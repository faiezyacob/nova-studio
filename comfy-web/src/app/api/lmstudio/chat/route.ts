import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stream, ...rest } = body;

    const lmRes = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rest, stream: stream === true }),
    });

    if (!lmRes.ok) {
      const errText = await lmRes.text();
      return Response.json({ error: errText || 'Failed to get completion' }, { status: lmRes.status });
    }

    if (stream === true) {
      return new Response(lmRes.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const data = await lmRes.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Failed to connect to LMStudio' }, { status: 500 });
  }
}