import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";
import { emitProgress, emitComplete, emitError } from '@/lib/progress-events';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const api = new ComfyApi(COMFYUI_URL, undefined, { wsTimeout: 300000 });

interface WanT2VOptions {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  frames?: number;
  generationId?: string;
}

async function generateWanT2VVideo(options: WanT2VOptions): Promise<{ prompt_id: string; video_path: string; subfolder: string }> {
  const { prompt, negative_prompt, width, height, frames, generationId } = options;

  const videoWidth = width || 480;
  const videoHeight = height || 832;
  const videoFrames = frames || 81;

  const prefix = `wan_t2v_${Math.floor(Date.now() / 1000)}`;
  const seed = Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, any> = {};

  // =========================
  // LOAD MODELS
  // =========================

  nodes["1"] = {
    class_type: "UnetLoaderGGUF",
    inputs: { unet_name: "wan2.2_i2v_high_noise_14B_Q4_K_M.gguf" },
  };

  nodes["2"] = {
    class_type: "UnetLoaderGGUF",
    inputs: { unet_name: "wan2.2_i2v_low_noise_14B_Q4_K_M.gguf" },
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

  // =========================
  // HIGH NOISE MODEL PIPELINE
  // =========================

  nodes["10"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: ["1", 0],
      sage_attention: "auto",
    },
  };

  nodes["11"] = {
    class_type: "ModelPatchTorchSettings",
    inputs: {
      model: ["10", 0],
      enable_fp16_accumulation: true,
    },
  };

  nodes["12"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["11", 0],
      lora_name: "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
      strength_model: 4.0,
    },
  };

  nodes["13"] = {
    class_type: "ModelSamplingSD3",
    inputs: {
      model: ["12", 0],
      shift: 4,
    },
  };

  // =========================
  // LOW NOISE MODEL PIPELINE
  // =========================

  nodes["20"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: ["2", 0],
      sage_attention: "auto",
    },
  };

  nodes["21"] = {
    class_type: "ModelPatchTorchSettings",
    inputs: {
      model: ["20", 0],
      enable_fp16_accumulation: true,
    },
  };

  nodes["23"] = {
    class_type: "ModelSamplingSD3",
    inputs: {
      model: ["21", 0],
      shift: 4,
    },
  };

  // =========================
  // PROMPTS
  // =========================

  nodes["30"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["4", 0],
      text: negative_prompt ||
        "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走",
    },
  };

  nodes["31"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["4", 0],
      text: prompt,
    },
  };

  // =========================
  // EMPTY LATENT (replaces WanImageToVideo + image loading)
  // =========================

  nodes["50"] = {
    class_type: "EmptyWanLatentVideo",
    inputs: {
      width: videoWidth,
      height: videoHeight,
      length: videoFrames,
      batch_size: 1,
    },
  };

  // =========================
  // SAMPLERS
  // EmptyWanLatentVideo output is at index 0
  // =========================

  nodes["60"] = {
    class_type: "KSamplerAdvanced",
    inputs: {
      model: ["13", 0],
      positive: ["31", 0],
      negative: ["30", 0],
      latent_image: ["50", 0],
      add_noise: "enable",
      noise_seed: seed,
      steps: 10,
      cfg: 1,
      sampler_name: "er_sde",
      scheduler: "simple",
      start_at_step: 0,
      end_at_step: 4,
      return_with_leftover_noise: "enable",
    },
  };

  nodes["61"] = {
    class_type: "KSamplerAdvanced",
    inputs: {
      model: ["23", 0],
      positive: ["31", 0],
      negative: ["30", 0],
      latent_image: ["60", 0],
      add_noise: "disable",
      noise_seed: 0,
      steps: 10,
      cfg: 1,
      sampler_name: "er_sde",
      scheduler: "simple",
      start_at_step: 4,
      end_at_step: 10000,
      return_with_leftover_noise: "disable",
    },
  };

  // =========================
  // DECODE + OUTPUT
  // =========================

  nodes["70"] = {
    class_type: "VAEDecode",
    inputs: {
      samples: ["61", 0],
      vae: ["3", 0],
    },
  };

  nodes["80"] = {
    class_type: "CreateVideo",
    inputs: {
      images: ["70", 0],
      fps: 16,
    },
  };

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
      ["video_path"]
    );

    builder.setInputNode("prompt", "31.inputs.text");
    builder.setInputNode("negative_prompt", "30.inputs.text");
    builder.setInputNode("width", "50.inputs.width");
    builder.setInputNode("height", "50.inputs.height");
    builder.setInputNode("frames", "50.inputs.length");
    builder.setInputNode("seed", "60.inputs.noise_seed");
    builder.setOutputNode("video_path", "90");

    builder
      .input("prompt", prompt)
      .input("negative_prompt", negative_prompt ||
        "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
      )
      .input("width", videoWidth)
      .input("height", videoHeight)
      .input("frames", videoFrames)
      .input("seed", seed);

    console.log("[WAN T2V] Submitting workflow | seed:", seed, "| prefix:", prefix);
    console.log("[WAN T2V] Nodes:", JSON.stringify(nodes, null, 2));

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any) => {
      if (resolved) return;
      resolved = true;
      console.log("[WAN T2V] Generation SUCCESS:", data);

      const outputNode = data?.["90"];
      const videoData = outputNode?.videos?.[0] || outputNode?.gifs?.[0];

      const videoFile = videoData?.filename || `${prefix}_00001_.mp4`;
      const videoSubfolder = videoData?.subfolder || "video";

      if (generationId) {
        emitComplete(generationId, {
          video_path: videoFile,
          subfolder: videoSubfolder,
          prompt_id: prefix,
        });
      }

      resolve({
        prompt_id: prefix,
        video_path: videoFile,
        subfolder: videoSubfolder,
      });
    });

    wrapper.onFailed((err: any) => {
      if (resolved) return;
      resolved = true;
      console.error("[WAN T2V] Generation FAILED:", err);
      if (generationId) {
        emitError(generationId, { error: typeof err === "string" ? err : JSON.stringify(err) });
      }
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.onProgress((progress: any) => {
      console.log(`[WAN T2V] Progress: step ${progress?.value} / ${progress?.max}`);
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
    const { prompt, negative_prompt, width, height, frames } = body;
    const generationId = request.headers.get('x-generation-id') || undefined;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    await api.init(5, 2000).waitForReady();

    const result = await generateWanT2VVideo({
      prompt,
      negative_prompt,
      width,
      height,
      frames,
      generationId,
    });

    return NextResponse.json({
      prompt_id: result.prompt_id,
      video_path: result.video_path,
      subfolder: result.subfolder,
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
