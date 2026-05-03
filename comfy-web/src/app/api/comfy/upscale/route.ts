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
  no_frames?: number;
}

async function upscaleVideo(options: UpscaleOptions): Promise<{ prompt_id: string; video_path: string; subfolder: string }> {
  const { filename, subfolder, upscale_model, no_frames } = options;

  const framesToProcess = no_frames || 81;

  // Construct absolute path for VHS_LoadVideo
  const videoPath = subfolder
    ? path.join(COMFY_OUTPUT_DIR, subfolder, filename)
    : path.join(COMFY_OUTPUT_DIR, filename);

  const prefix = `upscale_${Math.floor(Date.now() / 1000)}`;
  const FRAMES_PER_BATCH = 32;

  const nodes: Record<string, any> = {};

  // Node 1: Load Video
  nodes["1"] = {
    class_type: "VHS_LoadVideo",
    inputs: {
      video: videoPath,
      force_rate: 0,
      force_size: "Disabled",
      custom_width: 0,
      custom_height: 0,
      frame_load_cap: 0,
      skip_first_frames: 0,
      select_every_nth: 1,
      "choose video to upload": "image",
      meta_batch: ["2", 0],
    }
  };

  // Node 2: Batch Manager
  nodes["2"] = {
    class_type: "VHS_BatchManager",
    inputs: {
      frames_per_batch: FRAMES_PER_BATCH,
      count: 0,
    }
  };

  // Node 3: Image Upscale With Model
  nodes["3"] = {
    class_type: "ImageUpscaleWithModel",
    inputs: {
      upscale_model: ["4", 0],
      image: ["1", 0],
    }
  };

  // Node 4: Upscale Model Loader
  nodes["4"] = {
    class_type: "UpscaleModelLoader",
    inputs: {
      model_name: upscale_model,
    }
  };

  // Node 5: Video Info
  nodes["5"] = {
    class_type: "VHS_VideoInfo",
    inputs: {
      video_info: ["1", 3],
    }
  };

  // Node 6: Video Combine
  nodes["6"] = {
    class_type: "VHS_VideoCombine",
    inputs: {
      images: ["3", 0],
      frame_rate: ["5", 0],
      width: ["5", 1],
      height: ["5", 2],
      loop_count: 0,
      filename_prefix: `video/${prefix}`,
      format: "video/h264-mp4",
      pix_fmt: "yuv420p",
      crf: 19,
      save_metadata: true,
      trim_to_audio: false,
      pingpong: false,
      save_output: true,
      meta_batch: ["2", 0],
    }
  };

  return new Promise((resolve, reject) => {
    let resolved = false;

    // Output is from node 6
    const builder = new PromptBuilder(nodes as any, [], ["video_path"]);
    builder.setOutputNode("video_path", "6");

    const wrapper = new CallWrapper(api, builder);

    // Geet initial timer per batch
    let startTime = Date.now();

    wrapper.onFinished(async (data: any) => {
      if (resolved) return;

      console.log(`[UPSCALE API] ComfyUI reported finished for prefix ${prefix}. Waiting for file...`);

      let endTime = Date.now();
      let duration = endTime - startTime;
      console.log(`[UPSCALE API] ComfyUI finished first batch in ${duration}ms`);

      // Delay to ensure FFmpeg and file combine nodes are fully done
      // Increased to 10s for long videos (>100 frames)
      let noOfBatches = Math.ceil(framesToProcess / FRAMES_PER_BATCH);
      let durationToWait = noOfBatches * duration;

      await new Promise(resolve => setTimeout(resolve, durationToWait));

      resolved = true;

      const outputNode = data?.["6"];
      // VHS_VideoCombine can return filenames in various fields depending on version/format
      const videoData = outputNode?.videos?.[0] ||
        outputNode?.gifs?.[0] ||
        (outputNode?.filenames ? { filename: outputNode.filenames[0] } : null);

      const videoFilename = videoData?.filename || `${prefix}_00001.mp4`;
      const videoFile = videoFilename.split(/[/\\]/).pop() || videoFilename;
      const videoSubfolder = videoData?.subfolder || "video";

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
    const { filename, subfolder, upscale_model, no_frames } = body;

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    await api.init(5, 2000).waitForReady();

    const result = await upscaleVideo({
      filename,
      subfolder,
      upscale_model: upscale_model || 'RealESRGAN_x2plus.pth',
      no_frames,
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
