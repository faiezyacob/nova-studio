import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const instanceId = body.model;

    if (!instanceId) {
      return NextResponse.json({ error: 'Model identifier required' }, { status: 400 });
    }

    const res = await fetch('http://127.0.0.1:1234/api/v1/models/unload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: instanceId }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to unload model' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to connect to LMStudio' }, { status: 500 });
  }
}