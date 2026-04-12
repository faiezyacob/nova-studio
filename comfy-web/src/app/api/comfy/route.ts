import { NextRequest, NextResponse } from 'next/server';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

interface ComfyWorkflow {
  [nodeId: string]: WorkflowNode;
}

function buildWorkflow(promptText: string, prefix: string): ComfyWorkflow {
  const prompt = `A breathtaking photograph of ${promptText}`;
  
  return {
    "32": {
      "class_type": "CLIPLoaderGGUF",
      "inputs": {
        "clip_name": "Qwen3-4B-Q4_K_S.gguf",
        "type": "lumina2"
      }
    },
    "16": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": "z-image-turbo-fp8-e4m3fn.safetensors",
        "weight_dtype": "fp8_e4m3fn"
      }
    },
    "17": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "ae.safetensors"
      }
    },
    "29": {
      "class_type": "FluxResolutionNode",
      "inputs": {
        "scale": "1.0",
        "aspect_ratio": "3:4 (Golden Ratio)",
        "max_shortest_side": "64",
        "verbose": false,
        "divisible_by": "8",
        "custom_ratio": false,
        "megapixel": "1.0"
      }
    },
    "28": {
      "class_type": "PathchSageAttentionKJ",
      "inputs": {
        "model": ["16", 0],
        "sage_attention": "auto"
      }
    },
    "11": {
      "class_type": "ModelSamplingAuraFlow",
      "inputs": {
        "model": ["28", 0],
        "shift": 3
      }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["32", 0],
        "text": prompt
      }
    },
    "7": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["32", 0],
        "text": ""
      }
    },
    "13": {
      "class_type": "EmptySD3LatentImage",
      "inputs": {
        "width": 1024,
        "height": 1024,
        "batch_size": 1
      }
    },
    "3": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["11", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["13", 0],
        "seed": 641656615969061,
        "steps": 8,
        "cfg": 1.0,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1.0
      }
    },
    "8": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["3", 0],
        "vae": ["17", 0]
      }
    },
    "9": {
      "class_type": "SaveImage",
      "inputs": {
        "images": ["8", 0],
        "filename_prefix": prefix
      }
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, style } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const styleDescriptions: Record<string, string> = {
      casual: 'iphone snapshot, grainy, noisy, natural lighting, candid',
      professional: 'dslr portrait, high definition, professional studio lighting, centered composition, sharp',
      cinematic: 'cinematic film, movie scene, dramatic lighting, anamorphic lens, film grain, moody',
      anime: 'anime style, manga artwork, japanese animation, vibrant colors, clean lines',
      cgi: '3d render, cgi, computer generated, unreal engine, photorealistic, detailed'
    };

    const stylePrefix = styleDescriptions[style] || '';
    const fullPrompt = stylePrefix ? `${stylePrefix}, ${prompt}` : prompt;
    const prefix = `gen_${Math.floor(Date.now() / 1000)}`;
    const workflow = buildWorkflow(fullPrompt, prefix);
    
    const response = await fetch(`${COMFYUI_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        extra_data: { extra_pnginfo: {} }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect to ComfyUI' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const response = await fetch(`${COMFYUI_URL}/history`, {
      method: 'GET'
    });
    const history = await response.json();
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect to ComfyUI' },
      { status: 500 }
    );
  }
}