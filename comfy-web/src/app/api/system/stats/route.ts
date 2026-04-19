import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

async function getNvidiaStats() {
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.total,memory.used,memory.free,name --format=csv,noheader,nounits');
    const [total, used, free, name] = stdout.trim().split(',').map(s => s.trim());
    
    if (!total || !used || !free) return null;

    const totalNum = parseInt(total);
    const usedNum = parseInt(used);
    const freeNum = parseInt(free);

    return {
      total: totalNum * 1024 * 1024, // MiB to Bytes
      used: usedNum * 1024 * 1024,
      free: freeNum * 1024 * 1024,
      percent: Math.round((usedNum / totalNum) * 100),
      device_name: name
    };
  } catch (e) {
    return null;
  }
}

export async function GET() {
  // Try nvidia-smi first for global stats (includes LM Studio etc)
  const nvidiaStats = await getNvidiaStats();
  if (nvidiaStats) {
    return NextResponse.json(nvidiaStats);
  }

  // Fallback to ComfyUI if nvidia-smi fails
  try {
    const res = await fetch(`${COMFYUI_URL}/system_stats`, {
      method: 'GET',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed' }, { status: res.status });
    }

    const data = await res.json();
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
    return NextResponse.json({ error: 'Failed to connect' }, { status: 500 });
  }
}

