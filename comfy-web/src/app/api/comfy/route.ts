import { NextRequest, NextResponse } from 'next/server';
import { generateWithSDK } from '@/lib/comfy-sdk';

interface Lora {
  name: string;
  strength_model: number;
  strength_clip: number;
}

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, width, height, loras, seed } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const finalWidth = Math.max(256, Math.min(4096, width || 1024));
    const finalHeight = Math.max(256, Math.min(4096, height || 1024));

    const lora = loras && loras.length > 0 ? loras[0] : null;
    
    const result = await generateWithSDK(prompt, finalWidth, finalHeight, lora, seed);
    
    return NextResponse.json({ 
      prompt_id: result.prompt_id,
      images: result.images,
      seed: result.seed
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate image' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const res = await fetch(`${COMFYUI_URL}/history?max_items=200`);
    if (!res.ok) throw new Error(`ComfyUI history returned ${res.status}`);
    const history = await res.json();
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect to ComfyUI' },
      { status: 500 }
    );
  }
}