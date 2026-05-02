import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";
import path from 'path';
import { existsSync } from 'fs';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const COMFY_OUTPUT_DIR = path.join(process.cwd(), '..', 'ComfyUI', 'output');

const api = new ComfyApi(COMFYUI_URL);

interface UpscaleOptions {
  filename: string;
  subfolder?: string;
  upscale_model: string; // This will now represent the quality (ULTRA, HIGH, etc)
  width?: number;
  height?: number;
}

async function upscaleVideo(options: UpscaleOptions): Promise<{ prompt_id: string; video_path: string; subfolder: string }> {
  const { filename, subfolder, upscale_model, width, height } = options;

  // Construct absolute path for VHS_LoadVideo
  const videoPath = subfolder
    ? path.join(COMFY_OUTPUT_DIR, subfolder, filename)
    : path.join(COMFY_OUTPUT_DIR, filename);

  const prefix = `upscale_${Math.floor(Date.now() / 1000)}`;

  const nodes: Record<string, any> = {};

  // Node 1: Load Video
  nodes["1"] = {
    class_type: "VHS_LoadVideo",
    inputs: {
      video: videoPath,
      force_rate: 0,
      custom_width: 0,
      custom_height: 0,
      frame_load_cap: 0,
      skip_first_frames: 0,
      select_every_nth: 1,
    }
  };

  // Node 2: RTX Video Super Resolution
  // Based on @[workflows/RTX SR Upscaler Video.json]
  // We use "target dimensions" to allow precise 2x scaling from stored metadata
  nodes["2"] = {
    class_type: "RTXVideoSuperResolution",
    inputs: {
      images: ["1", 0],
      resize_type: "target dimensions",
      "resize_type.width": width ? width * 4 : 3840,
      "resize_type.height": height ? height * 4 : 2160,
      quality: upscale_model.toUpperCase(), // Map model ID to quality string
    }
  };

  // Node 3: Video Info (to get frame rate)
  nodes["3"] = {
    class_type: "VHS_VideoInfo",
    inputs: {
      video_info: ["1", 3],
    }
  };

  // Node 4: Video Combine
  nodes["4"] = {
    class_type: "VHS_VideoCombine",
    inputs: {
      images: ["2", 0],
      audio: ["1", 2], // Pass audio from loader
      frame_rate: ["3", 0], // Use original frame rate
      loop_count: 0,
      filename_prefix: `Upscale/RTX_SR_${prefix}`,
      format: "video/h264-mp4",
      pix_fmt: "yuv420p",
      crf: 19,
      save_metadata: true,
      trim_to_audio: false,
      pingpong: false,
      save_output: true,
    }
  };

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Output is from node 4
    const builder = new PromptBuilder(nodes as any, [], ["video_path"]);
    builder.setOutputNode("video_path", "4");

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished(async (data: any) => {
      if (resolved) return;

      console.log(`[UPSCALE API] ComfyUI reported finished for prefix ${prefix}. Waiting for file...`);

      // 1. Trust the SDK data if it has a filename (especially important for VHS nodes with audio)
      const outputNode = data?.["4"];
      const videoData = outputNode?.videos?.[0] ||
        outputNode?.gifs?.[0] ||
        (outputNode?.filenames ? { filename: outputNode.filenames[0] } : null);

      console.log(`[UPSCALE API] Output data from node 4:`, videoData);

      // Delay to ensure FFmpeg and file combine nodes are fully done
      // Increased from 10s to 12s for safer high-res muxing
      await new Promise(resolve => setTimeout(resolve, 12000));

      resolved = true;

      // Fix fallback to include the RTX_SR_ prefix that we defined in filename_prefix
      let fullFilename = videoData?.filename || `RTX_SR_${prefix}_00001.mp4`;

      // If the filename contains a subfolder (like "Upscale/RTX_SR..."), extract them
      let videoFile = fullFilename;
      let videoSubfolder = videoData?.subfolder || "Upscale";

      if (fullFilename.includes('/') || fullFilename.includes('\\')) {
        const parts = fullFilename.split(/[/\\]/);
        videoFile = parts.pop() || fullFilename;
        if (parts.length > 0) {
          videoSubfolder = parts.join('/');
        }
      }

      // VHS_VideoCombine with audio often appends '-audio' to the filename
      // Check if a version with '-audio' exists and use it instead
      const audioBasename = videoFile.replace(/\.(mp4|webm|mov)$/i, (match) => `-audio${match}`);
      const audioPath = path.join(COMFY_OUTPUT_DIR, videoSubfolder, audioBasename);

      console.log(`[UPSCALE API] Checking for audio version at: ${audioPath}`);
      if (existsSync(audioPath)) {
        console.log(`[UPSCALE API] Found audio version: ${audioBasename}`);
        videoFile = audioBasename;
      } else {
        console.log(`[UPSCALE API] Audio version not found, using: ${videoFile}`);
      }

      console.log(`[UPSCALE API] Final result for ${prefix}:`, { videoFile, videoSubfolder });

      resolve({
        prompt_id: prefix,
        video_path: videoFile,
        subfolder: videoSubfolder,
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
    let { filename, subfolder, upscale_model, width, height } = body;

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Fallback: If width/height are missing, try to get them using ffprobe
    if (!width || !height) {
      try {
        const videoPath = subfolder
          ? path.join(COMFY_OUTPUT_DIR, subfolder, filename)
          : path.join(COMFY_OUTPUT_DIR, filename);

        console.log(`[UPSCALE API] Dimensions missing, probing: ${videoPath}`);
        const { execSync } = require('child_process');
        // Added 5s timeout and better error handling to prevent blocking
        const ffprobeOutput = execSync(
          `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`,
          { timeout: 5000, encoding: 'utf8' }
        ).toString().trim();
        const [w, h] = ffprobeOutput.split('x').map(Number);

        if (w && h) {
          width = w;
          height = h;
          console.log(`[UPSCALE API] Probed dimensions: ${width}x${height}`);
        }
      } catch (probeError) {
        console.warn('[UPSCALE API] ffprobe failed or timed out:', probeError);
        // Fallback to 1080p if probe fails and no dimensions provided
        width = width || 1920;
        height = height || 1080;
      }
    }

    await api.init(5, 2000).waitForReady();

    const result = await upscaleVideo({
      filename,
      subfolder,
      upscale_model: upscale_model || 'ultra',
      width,
      height,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[UPSCALE API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upscale video' },
      { status: 500 }
    );
  }
}
