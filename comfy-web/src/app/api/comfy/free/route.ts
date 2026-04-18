import { NextRequest, NextResponse } from 'next/server';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

export async function POST(req: NextRequest) {
  try {
    const res = await fetch(`${COMFYUI_URL}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unload_models: true,
        free_memory: true
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to clear ComfyUI memory' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to connect to ComfyUI' }, { status: 500 });
  }
}
