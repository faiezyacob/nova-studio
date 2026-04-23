import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";
import path from 'path';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const COMFY_OUTPUT_DIR = path.join(process.cwd(), '..', 'ComfyUI', 'output');

const api = new ComfyApi(COMFYUI_URL);

interface UpscaleOptions {
  filename: string;
  subfolder?: string;
  upscale_model: string;
}

async function upscaleImage(options: UpscaleOptions): Promise<{ prompt_id: string; image_path: string; subfolder: string }> {
  const { filename, subfolder, upscale_model } = options;

  const imagePath = subfolder
    ? path.join(COMFY_OUTPUT_DIR, subfolder, filename)
    : path.join(COMFY_OUTPUT_DIR, filename);

  const prefix = `upscale_${Math.floor(Date.now() / 1000)}`;

  const nodes: Record<string, any> = {};

  nodes["1"] = {
    class_type: "LoadImage",
    inputs: {
      image: imagePath,
    }
  };

  nodes["2"] = {
    class_type: "UpscaleModelLoader",
    inputs: {
      model_name: upscale_model,
    }
  };

  nodes["3"] = {
    class_type: "ImageUpscaleWithModel",
    inputs: {
      upscale_model: ["2", 0],
      image: ["1", 0],
    }
  };

  nodes["4"] = {
    class_type: "SaveImage",
    inputs: {
      images: ["3", 0],
      filename_prefix: prefix,
    }
  };

  return new Promise((resolve, reject) => {
    let resolved = false;

    const builder = new PromptBuilder(nodes as any, [], ["image"]);
    builder.setOutputNode("image", "4");

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished(async (data: any) => {
      if (resolved) return;
      resolved = true;

      const outputNode = data?.["4"];
      const imageData = outputNode?.images?.[0] || outputNode?.filenames?.[0];

      const imageFilename = imageData?.filename || `${prefix}_00001_.png`;
      const imageFile = imageFilename.split(/[/\\]/).pop() || imageFilename;

      resolve({
        prompt_id: prefix,
        image_path: imageFile,
        subfolder: '',
      });
    });

    wrapper.onFailed((err: any) => {
      if (resolved) return;
      resolved = true;
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.run();
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, subfolder, upscale_model } = body;

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    await api.init(5, 2000).waitForReady();

    const result = await upscaleImage({
      filename,
      subfolder,
      upscale_model: upscale_model || 'RealESRGAN_x2plus.pth',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[UPSCALE IMAGE API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upscale image' },
      { status: 500 }
    );
  }
}