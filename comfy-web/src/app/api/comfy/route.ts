import { NextRequest, NextResponse } from 'next/server';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

interface ComfyWorkflow {
  [nodeId: string]: WorkflowNode;
}

interface Lora {
  name: string;
  strength_model: number;
  strength_clip: number;
}

function buildWorkflow(promptText: string, prefix: string, ratio: string, lora: Lora | null = null): ComfyWorkflow {
  const prompt = `A breathtaking photograph of ${promptText}`;
  
  const ratioMap: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "9:16": { width: 576, height: 1024 },
    "16:9": { width: 1024, height: 576 },
  };
  
  const { width, height } = ratioMap[ratio] || ratioMap["1:1"];
  
  const nodes: ComfyWorkflow = {};
  
  nodes["16"] = {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "z-image-turbo-fp8-e4m3fn.safetensors",
      "weight_dtype": "fp8_e4m3fn"
    }
  };
  nodes["32"] = {
    "class_type": "CLIPLoaderGGUF",
    "inputs": {
      "clip_name": "Qwen3-4B-Q4_K_S.gguf",
      "type": "lumina2"
    }
  };
  
  let modelNodeId = "16";
  let clipNodeId = "32";
  
  if (lora && lora.name) {
    nodes["100"] = {
      "class_type": "LoraLoader",
      "inputs": {
        "model": ["16", 0],
        "clip": ["32", 0],
        "lora_name": lora.name,
        "strength_model": lora.strength_model,
        "strength_clip": lora.strength_clip
      }
    };
    modelNodeId = "100";
    clipNodeId = "100";
  }
  
  nodes["17"] = {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "ae.safetensors"
    }
  };
  nodes["28"] = {
    "class_type": "PathchSageAttentionKJ",
    "inputs": {
      "model": [modelNodeId, 0],
      "sage_attention": "auto"
    }
  };
  nodes["11"] = {
    "class_type": "ModelSamplingAuraFlow",
    "inputs": {
      "model": ["28", 0],
      "shift": 3
    }
  };
  nodes["6"] = {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "clip": [clipNodeId, 1],
      "text": prompt
    }
  };
  nodes["7"] = {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "clip": [clipNodeId, 1],
      "text": ""
    }
  };
  nodes["13"] = {
    "class_type": "EmptySD3LatentImage",
    "inputs": {
      "width": width,
      "height": height,
      "batch_size": 1
    }
  };
  nodes["3"] = {
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
  };
  nodes["8"] = {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": ["3", 0],
      "vae": ["17", 0]
    }
  };
  nodes["9"] = {
    "class_type": "SaveImage",
    "inputs": {
      "images": ["8", 0],
      "filename_prefix": prefix
    }
  };
  
  return nodes;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, ratio, loras } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const prefix = `gen_${Math.floor(Date.now() / 1000)}`;
    const lora = loras && loras.length > 0 ? loras[0] : null;
    const workflow = buildWorkflow(prompt, prefix, ratio || "1:1", lora);
    
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
