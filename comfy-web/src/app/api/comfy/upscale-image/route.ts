import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { copyFile, unlink } from 'fs/promises';
import { emitProgress, emitComplete, emitError } from '@/lib/progress-events';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const COMFY_OUTPUT_DIR = path.join(process.cwd(), '..', 'ComfyUI', 'output');
const LOCAL_GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');

const api = new ComfyApi(COMFYUI_URL, undefined, { wsTimeout: 300000 });

interface UpscaleOptions {
  filename: string;
  subfolder?: string;
  upscale_model: string;
  width?: number;
  height?: number;
  scale?: number;
  generationId?: string;
}

async function upscaleImage(options: UpscaleOptions): Promise<{ prompt_id: string; image_path: string; subfolder: string }> {
  const { filename, subfolder, upscale_model, width, height, scale = 2, generationId } = options;

  // Construct absolute path for LoadImage from public/generated
  const imagePath = path.join(LOCAL_GENERATED_DIR, filename);

  const prefix = `upscale_${Math.floor(Date.now() / 1000)}`;

  const nodes: Record<string, any> = {};

  // Node 1: Load Image
  nodes["1"] = {
    class_type: "LoadImage",
    inputs: {
      image: imagePath,
    }
  };

  // Node 2: RTX Video Super Resolution
  nodes["2"] = {
    class_type: "RTXVideoSuperResolution",
    inputs: {
      images: ["1", 0],
      resize_type: "target dimensions",
      "resize_type.width": width ? width * scale : 3840,
      "resize_type.height": height ? height * scale : 2160,
      quality: upscale_model.toUpperCase(),
    }
  };

  // Node 3: Save Image
  nodes["3"] = {
    class_type: "SaveImage",
    inputs: {
      images: ["2", 0],
      filename_prefix: prefix,
    }
  };

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Output is from node 3
    const builder = new PromptBuilder(nodes as any, [], ["image"]);
    builder.setOutputNode("image", "3");

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished(async (data: any) => {
      if (resolved) return;

      console.log(`[UPSCALE IMAGE API] ComfyUI reported finished for prefix ${prefix}. Waiting for file...`);

      const outputNode = data?.["3"];
      const imageData = outputNode?.images?.[0] || (outputNode?.filenames ? { filename: outputNode.filenames[0] } : null);

      console.log(`[UPSCALE IMAGE API] Output data from node 3:`, imageData);

      // Short delay for image file saving
      await new Promise(resolve => setTimeout(resolve, 2000));

      resolved = true;

      if (generationId) {
        emitProgress(generationId, { value: 100, max: 100, text: 'Finalizing...' });
      }

      let fullFilename = imageData?.filename || `${prefix}_00001_.png`;

      let imageFile = fullFilename;
      let imageSubfolder = imageData?.subfolder || "";

      if (fullFilename.includes('/') || fullFilename.includes('\\')) {
        const parts = fullFilename.split(/[/\\]/);
        imageFile = parts.pop() || fullFilename;
        if (parts.length > 0) {
          imageSubfolder = parts.join('/');
        }
      }

      console.log(`[UPSCALE IMAGE API] Final result for ${prefix}:`, { imageFile, imageSubfolder });

      if (generationId) {
        emitComplete(generationId, {
          video_path: imageFile,
          subfolder: imageSubfolder,
          prompt_id: prefix,
        });
      }

      let sourcePath = path.join(COMFY_OUTPUT_DIR, imageSubfolder, imageFile);
      if (!existsSync(sourcePath)) {
        sourcePath = path.join(COMFY_OUTPUT_DIR, imageFile);
      }
      const destPath = path.join(LOCAL_GENERATED_DIR, imageFile);

      try {
        if (existsSync(sourcePath)) {
          if (!existsSync(LOCAL_GENERATED_DIR)) {
            mkdirSync(LOCAL_GENERATED_DIR, { recursive: true });
          }
          await copyFile(sourcePath, destPath);
          console.log(`[UPSCALE IMAGE API] Copied to public/generated: ${destPath}`);

          await unlink(sourcePath);
          console.log(`[UPSCALE IMAGE API] Deleted from ComfyUI: ${sourcePath}`);
        } else {
          console.log(`[UPSCALE IMAGE API] Source file not found: ${sourcePath}`);
        }
      } catch (copyError) {
        console.warn('[UPSCALE IMAGE API] Failed to copy/delete:', copyError);
      }

      resolve({
        prompt_id: prefix,
        image_path: imageFile,
        subfolder: imageSubfolder,
      });
    });

    wrapper.onFailed((err: any) => {
      if (resolved) return;
      resolved = true;
      if (generationId) {
        emitError(generationId, { error: typeof err === "string" ? err : JSON.stringify(err) });
      }
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.onProgress((progress: any) => {
      console.log(`[UPSCALE IMAGE] Progress: ${progress?.value} / ${progress?.max}`);
      if (generationId && progress) {
        emitProgress(generationId, { value: progress.value, max: progress.max });
      }
    });

    wrapper.run();
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { filename, subfolder, upscale_model, width, height, scale } = body;
    const generationId = request.headers.get('x-generation-id') || undefined;

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    if (!width || !height) {
      try {
        const imagePath = path.join(LOCAL_GENERATED_DIR, filename);

        console.log(`[UPSCALE IMAGE API] Dimensions missing, probing: ${imagePath}`);
        const { execSync } = require('child_process');
        const ffprobeOutput = execSync(
          `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${imagePath}"`,
          { timeout: 5000, encoding: 'utf8' }
        ).toString().trim();
        const [w, h] = ffprobeOutput.split('x').map(Number);

        if (w && h) {
          width = w;
          height = h;
          console.log(`[UPSCALE IMAGE API] Probed dimensions: ${width}x${height}`);
        }
      } catch (probeError) {
        console.warn('[UPSCALE IMAGE API] ffprobe failed or timed out:', probeError);
        width = width || 1920;
        height = height || 1080;
      }
    }

    await api.init(5, 2000).waitForReady();

    const result = await upscaleImage({
      filename,
      subfolder,
      upscale_model: upscale_model || 'ultra',
      width,
      height,
      scale,
      generationId,
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