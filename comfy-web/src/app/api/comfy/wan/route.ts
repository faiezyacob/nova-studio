import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";
import { emitProgress, emitComplete, emitError } from '@/lib/progress-events';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const api = new ComfyApi(COMFYUI_URL, undefined, { wsTimeout: 300000 });

interface WanOptions {
  image: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  imgWidth?: number;
  imgHeight?: number;
  duration?: number;
  fps?: number;
  turbo?: boolean;
  generationId?: string;
}

async function generateWanVideo(options: WanOptions): Promise<{ prompt_id: string; video_path: string; subfolder: string; frame_path?: string; frame_subfolder?: string }> {
  const { image, prompt, negative_prompt, width, height, imgWidth, imgHeight, duration, fps, turbo, generationId } = options;

  const videoWidth = width || 640;
  const videoHeight = height || 640;
  const videoFps = fps || 16;
  const videoDuration = duration || 5;
  const videoFrames = Math.floor(videoDuration * videoFps + 1);
  const origWidth = imgWidth || videoWidth;
  const origHeight = imgHeight || videoHeight;

  const prefix = `wan_${Math.floor(Date.now() / 1000)}`;
  const seed = Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, any> = {};

  // HIGH NOISE model (fp8 scaled)
  nodes["1"] = {
    class_type: "UNETLoader",
    inputs: { unet_name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", weight_dtype: "default" },
  };

  // LOW NOISE model (fp8 scaled)
  nodes["2"] = {
    class_type: "UNETLoader",
    inputs: { unet_name: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", weight_dtype: "default" },
  };

  nodes["3"] = {
    class_type: "VAELoader",
    inputs: { vae_name: "wan_2.1_vae.safetensors" },
  };

  nodes["4"] = {
    class_type: "CLIPLoader",
    inputs: {
      clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      type: "wan",
      dtype: "default",
    },
  };

  // HIGH NOISE pipeline
  // Turbo: node1 -> lora (high noise, strength 1.0) -> sd3(shift:5)
  // Non-turbo: node1 -> sd3(shift:5)
  const turb = turbo === true;

  nodes["10"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["1", 0],
      lora_name: "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
      strength_model: turb ? 1.0 : 0,
    },
  };

  nodes["11"] = {
    class_type: "ModelSamplingSD3",
    inputs: {
      model: ["10", 0],
      shift: 5,
    },
  };

  // LOW NOISE pipeline
  // Turbo: node2 -> lora (low noise, strength 1.0) -> sd3(shift:5)
  // Non-turbo: node2 -> sd3(shift:5)
  nodes["20"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["2", 0],
      lora_name: "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
      strength_model: turb ? 1.0 : 0,
    },
  };

  nodes["21"] = {
    class_type: "ModelSamplingSD3",
    inputs: {
      model: ["20", 0],
      shift: 5,
    },
  };

  // Negative prompt
  nodes["30"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["4", 0],
      text: negative_prompt ||
        "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走",
    },
  };

  // Positive prompt
  nodes["31"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["4", 0],
      text: prompt,
    },
  };

  // =========================
  // IMAGE UPLOAD
  // =========================

  let imageFilename = "";

  if (typeof image === "string" && !image.startsWith("data:") && !image.includes(",")) {
    imageFilename = image;
  } else if (typeof image === "string" && image.startsWith("data:")) {
    const mimeMatch = image.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    const ext =
      mimeType === "image/jpeg" ? "jpg" :
        mimeType === "image/webp" ? "webp" :
          "png";

    const base64Data = image.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    const uploadForm = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    uploadForm.append("image", blob, `input_image.${ext}`);
    uploadForm.append("overwrite", "true");

    const uploadResponse = await fetch(`${COMFYUI_URL}/upload/image`, {
      method: "POST",
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Failed to upload image to ComfyUI: ${errText}`);
    }

    const uploadResult = await uploadResponse.json();
    imageFilename = uploadResult.name;
    console.log("Uploaded image as:", imageFilename);
  } else {
    throw new Error("Invalid image format - must be filename or base64 data URI");
  }

  // LoadImage
  nodes["40"] = {
    class_type: "LoadImage",
    inputs: {
      image: imageFilename,
      upload: "image",
    },
  };

  // =========================
  // WAN IMAGE TO VIDEO
  // =========================

  nodes["50"] = {
    class_type: "WanImageToVideo",
    inputs: {
      positive: ["31", 0],
      negative: ["30", 0],
      vae: ["3", 0],
      start_image: ["40", 0],
      width: videoWidth,
      height: videoHeight,
      length: videoFrames,
      batch_size: 1,
    },
  };

  // =========================
  // SAMPLERS
  //
  // When turbo mode is ON:  steps=4,  cfg=1,   split_step=2  (4-step LoRA)
  // When turbo mode is OFF: steps=20, cfg=3.5, split_step=10 (standard)
  //
  // FIRST sampler (high noise): er_sde, end_at_step=split_step, return_with_leftover_noise=enable
  // SECOND sampler (low noise): euler,  start_at_step=split_step, end_at_step=10000
  // =========================

  const steps = turb ? 4 : 20;
  const cfg = turb ? 1 : 3.5;
  const splitStep = turb ? 2 : 10;

  // FIRST sampler - high noise model
  nodes["60"] = {
    class_type: "KSamplerAdvanced",
    inputs: {
      model: ["11", 0],
      positive: ["50", 0],
      negative: ["50", 1],
      latent_image: ["50", 2],
      add_noise: "enable",
      noise_seed: seed,
      steps: steps,
      cfg: cfg,
      sampler_name: "er_sde",
      scheduler: "simple",
      start_at_step: 0,
      end_at_step: splitStep,
      return_with_leftover_noise: "enable",
    },
  };

  // SECOND sampler - low noise model
  nodes["61"] = {
    class_type: "KSamplerAdvanced",
    inputs: {
      model: ["21", 0],
      positive: ["50", 0],
      negative: ["50", 1],
      latent_image: ["60", 0],
      add_noise: "disable",
      noise_seed: seed,
      steps: steps,
      cfg: cfg,
      sampler_name: "euler",
      scheduler: "simple",
      start_at_step: splitStep,
      end_at_step: 10000,
      return_with_leftover_noise: "disable",
    },
  };

  // =========================
  // DECODE + OUTPUT
  // =========================

  // VAEDecode
  nodes["70"] = {
    class_type: "VAEDecode",
    inputs: {
      samples: ["61", 0],
      vae: ["3", 0],
    },
  };

  // Frame upscale to original image dimensions
  nodes["71"] = {
    class_type: "ImageResizeKJv2",
    inputs: {
      image: ["70", 0],
      width: origWidth,
      height: origHeight,
      upscale_method: "bicubic",
      keep_proportion: "stretch",
      pad_color: "0, 0, 0",
      crop_position: "center",
      divisible_by: 8,
    },
  };

  // Save frame
  nodes["72"] = {
    class_type: "SaveImage",
    inputs: {
      images: ["71", 0],
      filename_prefix: `frame/${prefix}`,
    },
  };

  // CreateVideo
  nodes["80"] = {
    class_type: "CreateVideo",
    inputs: {
      images: ["70", 0],
      fps: videoFps,
    },
  };

  // SaveVideo
  nodes["90"] = {
    class_type: "SaveVideo",
    inputs: {
      video: ["80", 0],
      filename_prefix: `video/${prefix}`,
      format: "auto",
      codec: "auto",
    },
  };

  // =========================
  // PROMPT BUILDER + EXECUTION
  // =========================

  return new Promise((resolve, reject) => {
    let resolved = false;

    const builder = new PromptBuilder(
      nodes as any,
      ["prompt", "negative_prompt", "width", "height", "frames", "seed"],
      ["video_path", "frame_path"]
    );

    builder.setInputNode("prompt", "31.inputs.text");
    builder.setInputNode("negative_prompt", "30.inputs.text");
    builder.setInputNode("width", "50.inputs.width");
    builder.setInputNode("height", "50.inputs.height");
    builder.setInputNode("frames", "50.inputs.length");
    builder.setInputNode("seed", "60.inputs.noise_seed");
    builder.setOutputNode("video_path", "90");
    builder.setOutputNode("frame_path", "72");

    builder
      .input("prompt", prompt)
      .input("negative_prompt", negative_prompt ||
        "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
      )
      .input("width", videoWidth)
      .input("height", videoHeight)
      .input("frames", videoFrames)
      .input("seed", seed);

    console.log("Submitting workflow with seed:", seed);

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any) => {
      if (resolved) return;
      resolved = true;
      console.log("Generation SUCCESS:", data);

      const outputNode = data?.["90"];
      const videoData = outputNode?.videos?.[0] || outputNode?.gifs?.[0];

      const videoFile = videoData?.filename || `${prefix}_00001_.mp4`;
      const videoSubfolder = videoData?.subfolder || "video";

      const frameNode = data?.["72"];
      const frameData = frameNode?.images?.[0];
      const frameFile = frameData?.filename || "";
      const frameSubfolder = frameData?.subfolder || "";

      if (generationId) {
        emitComplete(generationId, {
          video_path: videoFile,
          subfolder: videoSubfolder,
          frame_path: frameFile,
          frame_subfolder: frameSubfolder,
          prompt_id: prefix,
        });
      }

      resolve({
        prompt_id: prefix,
        video_path: videoFile,
        subfolder: videoSubfolder,
        frame_path: frameFile,
        frame_subfolder: frameSubfolder,
      });
    });

    wrapper.onFailed((err: any) => {
      if (resolved) return;
      resolved = true;
      console.error("Generation FAILED:", err);
      if (generationId) {
        emitError(generationId, { error: typeof err === "string" ? err : JSON.stringify(err) });
      }
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.onProgress((progress: any) => {
      console.log(`Progress: step ${progress?.value} / ${progress?.max}`);
      if (generationId && progress) {
        emitProgress(generationId, { value: progress.value, max: progress.max });
      }
    });

    wrapper.run();
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const imageFile = body.get('image') as File | null;
    const prompt = body.get('prompt') as string;
    const negative_prompt = body.get('negative_prompt') as string | null;
    const width = body.get('width') ? parseInt(body.get('width') as string) : undefined;
    const height = body.get('height') ? parseInt(body.get('height') as string) : undefined;
    const imgWidth = body.get('imgWidth') ? parseInt(body.get('imgWidth') as string) : undefined;
    const imgHeight = body.get('imgHeight') ? parseInt(body.get('imgHeight') as string) : undefined;
    const duration = body.get('duration') ? parseFloat(body.get('duration') as string) : undefined;
    const fps = body.get('fps') ? parseFloat(body.get('fps') as string) : undefined;
    const turbo = body.get('turbo') === 'true';
    const generationId = request.headers.get('x-generation-id') || undefined;

    if (!imageFile || !prompt) {
      console.error('[WAN API] Missing required fields:', { hasImage: !!imageFile, hasPrompt: !!prompt });
      return NextResponse.json(
        { error: 'Image and prompt are required' },
        { status: 400 }
      );
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageFile.type || 'image/png';
    const imageData = `data:${mimeType};base64,${base64}`;

    await api.init(5, 2000).waitForReady();

    const result = await generateWanVideo({
      image: imageData,
      prompt,
      negative_prompt: negative_prompt || undefined,
      width,
      height,
      imgWidth,
      imgHeight,
      duration,
      fps,
      turbo,
      generationId,
    });

    return NextResponse.json({
      prompt_id: result.prompt_id,
      video_path: result.video_path,
      subfolder: result.subfolder,
      frame_path: result.frame_path,
      frame_subfolder: result.frame_subfolder,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate video' },
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
