import { NextRequest, NextResponse } from 'next/server';
import { generateWithSDK, api } from '@/lib/comfy-sdk';

interface Lora {
  name: string;
  strength_model: number;
  strength_clip: number;
}

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
    await api.init(5, 2000).waitForReady();
    const history = await api.getHistories();
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect to ComfyUI' },
      { status: 500 }
    );
  }
}