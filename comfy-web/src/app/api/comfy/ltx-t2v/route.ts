import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";
import { emitProgress, emitComplete, emitError } from '@/lib/progress-events';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const api = new ComfyApi(COMFYUI_URL, undefined, { wsTimeout: 300000 });

async function generateLtxT2VVideo(options: {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  frames?: number;
  fps?: number;
  generationId?: string;
}): Promise<{ prompt_id: string; video_path: string; subfolder: string }> {
  const {
    prompt,
    negative_prompt,
    width = 768,
    height = 512,
    frames = 81,
    fps = 24,
    generationId,
  } = options;

  const prefix = `ltx_t2v_${Math.floor(Date.now() / 1000)}`;
  const seed = Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, any> = {};

  // ── MODEL LOADING ─────────────────────────────────────────────────────────

  nodes["1"] = {
    class_type: "DualCLIPLoader",
    inputs: {
      clip_name1: "gemma_3_12B_it_fp4_mixed.safetensors",
      clip_name2: "ltx-2.3_text_projection_bf16.safetensors",
      type: "ltxv",
      dtype: "default",
    },
  };

  nodes["2"] = {
    class_type: "UnetLoaderGGUF",
    inputs: { unet_name: "ltx-2.3-22b-dev-Q5_K_M.gguf" },
  };

  nodes["8"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: ["2", 0],
      sage_attention: "auto",
    },
  };

  nodes["9"] = {
    class_type: "ModelPatchTorchSettings",
    inputs: {
      model: ["8", 0],
      enable_fp16_accumulation: true,
    },
  };

  nodes["3"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["9", 0],
      lora_name:
        "ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors",
      strength_model: 0.75,
    },
  };

  nodes["4"] = {
    class_type: "VAELoader",
    inputs: { vae_name: "LTX23_video_vae_bf16.safetensors" },
  };

  nodes["5"] = {
    class_type: "VAELoaderKJ",
    inputs: {
      vae_name: "LTX23_audio_vae_bf16.safetensors",
      device: "main_device",
      dtype: "bf16",
      weight_dtype: "bf16",
    },
  };

  nodes["6"] = {
    class_type: "LatentUpscaleModelLoader",
    inputs: { model_name: "ltx-2.3-spatial-upscaler-x2-1.1.safetensors" },
  };

  nodes["7"] = {
    class_type: "VAELoader",
    inputs: { vae_name: "taeltx2_3.safetensors" },
  };

  // ── PROMPTS + CONDITIONING ────────────────────────────────────────────────

  nodes["10"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 0],
      text: prompt,
    },
  };

  nodes["11"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 0],
      text:
        negative_prompt ||
        "blurry, low quality, still frame, watermark, overlay, titles, subtitles, flickering, distorted",
    },
  };

  nodes["12"] = {
    class_type: "LTXVConditioning",
    inputs: {
      positive: ["10", 0],
      negative: ["11", 0],
      frame_rate: Math.floor(fps),
    },
  };

  // ── EMPTY LATENT (replaces image processing + LTXVImgToVideoInplace) ──────

  nodes["32"] = {
    class_type: "EmptyLTXVLatentVideo",
    inputs: {
      width: width,
      height: height,
      length: frames,
      batch_size: 1,
    },
  };

  nodes["33"] = {
    class_type: "LTXVEmptyLatentAudio",
    inputs: {
      audio_vae: ["5", 0],
      frames_number: frames,
      frame_rate: Math.floor(fps),
      batch_size: 1,
    },
  };

  // ── MODEL PATCHING - STAGE 1 ──────────────────────────────────────────────

  nodes["40"] = {
    class_type: "LTXVChunkFeedForward",
    inputs: {
      model: ["3", 0],
      chunk_size: 2,
      overlap: 2048,
      chunks: 4,
      dim_threshold: 2048,
    },
  };

  nodes["41"] = {
    class_type: "LTX2SamplingPreviewOverride",
    inputs: {
      model: ["40", 0],
      vae: ["7", 0],
      preview_rate: 60,
    },
  };

  // ── MODEL PATCHING - STAGE 2 ──────────────────────────────────────────────

  nodes["43"] = {
    class_type: "LTXVChunkFeedForward",
    inputs: {
      model: ["3", 0],
      chunk_size: 2,
      overlap: 2048,
      chunks: 4,
      dim_threshold: 2048,
    },
  };

  nodes["44"] = {
    class_type: "LTX2SamplingPreviewOverride",
    inputs: {
      model: ["43", 0],
      vae: ["7", 0],
      preview_rate: 60,
    },
  };

  // ── STAGE 1 SAMPLING ──────────────────────────────────────────────────────

  nodes["50"] = {
    class_type: "RandomNoise",
    inputs: { noise_seed: seed },
  };

  nodes["51"] = {
    class_type: "ManualSigmas",
    inputs: {
      sigmas:
        "1., 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0",
    },
  };

  nodes["52"] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "euler_ancestral" },
  };

  nodes["53"] = {
    class_type: "CFGGuider",
    inputs: {
      model: ["41", 0],
      positive: ["12", 0],
      negative: ["12", 1],
      cfg: 1,
    },
  };

  // Use empty latent directly — no LTXVImgToVideoInplace needed for T2V
  nodes["55"] = {
    class_type: "LTXVConcatAVLatent",
    inputs: {
      video_latent: ["32", 0],
      audio_latent: ["33", 0],
    },
  };

  nodes["56"] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: ["50", 0],
      guider: ["53", 0],
      sampler: ["52", 0],
      sigmas: ["51", 0],
      latent_image: ["55", 0],
    },
  };

  // ── STAGE 1 -> STAGE 2 BRIDGE ─────────────────────────────────────────────

  nodes["57"] = {
    class_type: "LTXVSeparateAVLatent",
    inputs: { av_latent: ["56", 0] },
  };

  nodes["58"] = {
    class_type: "LTXVLatentUpsampler",
    inputs: {
      samples: ["57", 0],
      upscale_model: ["6", 0],
      vae: ["4", 0],
    },
  };

  nodes["60"] = {
    class_type: "LTXVConcatAVLatent",
    inputs: {
      video_latent: ["58", 0],
      audio_latent: ["57", 1],
    },
  };

  // ── STAGE 2 SAMPLING ──────────────────────────────────────────────────────

  nodes["61"] = {
    class_type: "ManualSigmas",
    inputs: {
      sigmas: "0.8025, 0.6332, 0.4525, 0.2425, 0.0",
    },
  };

  nodes["65"] = {
    class_type: "RandomNoise",
    inputs: {
      noise_seed: (seed + 1) % 10000000000000,
    },
  };

  nodes["62"] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "euler" },
  };

  nodes["63"] = {
    class_type: "CFGGuider",
    inputs: {
      model: ["44", 0],
      positive: ["12", 0],
      negative: ["12", 1],
      cfg: 1,
    },
  };

  nodes["64"] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: ["65", 0],
      guider: ["63", 0],
      sampler: ["62", 0],
      sigmas: ["61", 0],
      latent_image: ["60", 0],
    },
  };

  // ── DECODE + OUTPUT ───────────────────────────────────────────────────────

  nodes["70"] = {
    class_type: "LTXVSeparateAVLatent",
    inputs: { av_latent: ["64", 0] },
  };

  nodes["71"] = {
    class_type: "VAEDecodeTiled",
    inputs: {
      samples: ["70", 0],
      vae: ["4", 0],
      tile_size: 512,
      overlap: 64,
      temporal_size: 2048,
      temporal_overlap: 16,
    },
  };

  nodes["72"] = {
    class_type: "LTXVAudioVAEDecode",
    inputs: {
      samples: ["70", 1],
      audio_vae: ["5", 0],
    },
  };

  nodes["73"] = {
    class_type: "CreateVideo",
    inputs: {
      images: ["71", 0],
      audio: ["72", 0],
      fps: fps,
    },
  };

  nodes["74"] = {
    class_type: "SaveVideo",
    inputs: {
      video: ["73", 0],
      filename_prefix: `video/${prefix}`,
      format: "mp4",
      codec: "auto",
    },
  };

  // ── EXECUTION ─────────────────────────────────────────────────────────────

  return new Promise((resolve, reject) => {
    let resolved = false;

    const builder = new PromptBuilder(
      nodes as any,
      ["prompt", "negative_prompt", "width", "height", "frames", "seed"],
      ["video_path"]
    );

    builder.setInputNode("prompt", "10.inputs.text");
    builder.setInputNode("negative_prompt", "11.inputs.text");
    builder.setInputNode("width", "32.inputs.width");
    builder.setInputNode("height", "32.inputs.height");
    builder.setInputNode("frames", "32.inputs.length");
    builder.setInputNode("seed", "50.inputs.noise_seed");
    builder.setOutputNode("video_path", "74");

    builder
      .input("prompt", prompt)
      .input(
        "negative_prompt",
        negative_prompt ||
        "blurry, low quality, still frame, watermark, overlay, titles, subtitles, flickering, distorted"
      )
      .input("width", width)
      .input("height", height)
      .input("frames", frames)
      .input("seed", seed);

    console.log("[LTX T2V] Submitting workflow | seed:", seed, "| prefix:", prefix);
    console.log("[LTX T2V] Nodes:", JSON.stringify(nodes, null, 2));

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any) => {
      if (resolved) return;
      resolved = true;
      console.log("[LTX T2V] Generation SUCCESS:", data);

      const outputNode = data?.["74"] || data?.["73"];
      const videoData = outputNode?.videos?.[0] || outputNode?.gifs?.[0];

      const videoFile = videoData?.filename ?? `${prefix}_00001_.mp4`;
      const videoSubfolder = videoData?.subfolder ?? "video";

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
      console.error("[LTX T2V] Generation FAILED:", err);
      if (generationId) {
        emitError(generationId, { error: typeof err === "string" ? err : JSON.stringify(err) });
      }
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.onProgress((progress: any) => {
      console.log(`[LTX T2V] Progress: ${progress?.value} / ${progress?.max}`);
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
    const { prompt, negative_prompt, width, height, frames, fps } = body;
    const generationId = request.headers.get('x-generation-id') || undefined;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    await api.init(5, 2000).waitForReady();

    const result = await generateLtxT2VVideo({
      prompt,
      negative_prompt,
      width,
      height,
      frames,
      fps,
      generationId,
    });

    return NextResponse.json({ prompt_id: result.prompt_id, video_path: result.video_path, subfolder: result.subfolder });
  } catch (error) {
    console.error("[LTX T2V] API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await api.init(5, 2000).waitForReady();
    return NextResponse.json(await api.getHistories());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to connect' }, { status: 500 });
  }
}
