import { NextRequest, NextResponse } from 'next/server';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

export async function GET() {
  try {
    const res = await fetch(`${COMFYUI_URL}/system_stats`, {
      method: 'GET',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch ComfyUI stats' }, { status: res.status });
    }

    const data = await res.json();
    
    // Extract first CUDA device info
    const gpu = data.devices?.find((d: any) => d.type === 'cuda');
    
    if (!gpu) {
      return NextResponse.json({ error: 'No GPU found' }, { status: 404 });
    }

    const total = gpu.vram_total;
    const free = gpu.vram_free;
    const used = total - free;
    const percent = Math.round((used / total) * 100);

    return NextResponse.json({
      total,
      free,
      used,
      percent,
      device_name: gpu.name
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to connect to ComfyUI' }, { status: 500 });
  }
}
