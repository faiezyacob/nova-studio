import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const api = new ComfyApi(COMFYUI_URL);

async function generateLtxVideo(options: {
  image: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  frames?: number;
  fps?: number;
}): Promise<{ prompt_id: string; video_path: string; subfolder: string }> {
  const {
    image,
    prompt,
    negative_prompt,
    width = 768,
    height = 512,
    frames = 81,
    fps = 24,
  } = options;

  const prefix = `ltx_${Math.floor(Date.now() / 1000)}`;
  const seed = Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, any> = {};

  // ── IMAGE UPLOAD (unchanged) ──────────────────────────────────────────────

  let imageFilename = "";

  if (
    typeof image === "string" &&
    !image.startsWith("data:") &&
    !image.includes(",")
  ) {
    imageFilename = image;
    console.log("Using existing ComfyUI image filename:", imageFilename);
  } else if (typeof image === "string" && image.startsWith("data:")) {
    const mimeMatch = image.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    const ext =
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/webp"
          ? "webp"
          : "png";

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
    console.log("Uploaded LTX image as:", imageFilename);
  } else {
    throw new Error(
      "Invalid image format - must be filename or base64 data URI"
    );
  }

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
    inputs: { unet_name: "ltx-2-3-22b-dev-Q4_K_M.gguf" },
  };

  // SageAttention - unchanged, this is good
  nodes["8"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: ["2", 0],
      sage_attention: "auto",
    },
  };

  // Torch settings - unchanged, this is good
  nodes["9"] = {
    class_type: "ModelPatchTorchSettings",
    inputs: {
      model: ["8", 0],
      enable_fp16_accumulation: true,
    },
  };

  // FIX: Single LoRA application at correct strength.
  // Node 42 was loading the same LoRA again at 1.0 on top of this 0.6,
  // creating an effective strength of ~1.6 which over-sharpens and
  // causes ringing artifacts especially on edges and text.
  // The distilled LoRA is designed to run at 1.0 as a single application.
  nodes["3"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["9", 0],
      lora_name:
        "ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors",
      strength_model: 1.0,
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

  // ── IMAGE PROCESSING ──────────────────────────────────────────────────────

  nodes["20"] = {
    class_type: "LoadImage",
    inputs: {
      image: imageFilename,
      upload: "image",
    },
  };

  // FIX: Match resize to actual latent resolution instead of 1024.
  // At 1024 the image is larger than the 768x512 latent which means
  // LTXVPreprocess has to downsample, discarding detail that was never
  // recoverable in stage 1. Stage 2 spatial upscaler handles the 2x
  // enlargement so stage 1 input should match stage 1 latent size.
  nodes["21"] = {
    class_type: "ResizeImagesByLongerEdge",
    inputs: {
      images: ["20", 0],
      longer_edge: Math.max(width, height),
    },
  };

  // mode and img_compression unchanged - these are fine as-is
  nodes["22"] = {
    class_type: "LTXVPreprocess",
    inputs: {
      image: ["21", 0],
      mode: 0,
      img_compression: 0,
    },
  };

  // ── LATENT SETUP ──────────────────────────────────────────────────────────

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

  // Chunk settings unchanged - these were fine and fast
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

  // FIX: preview_rate 8 -> 60.
  // Every preview decodes the TAE VAE mid-step which causes a VRAM spike.
  // With SageAttention already reducing attention memory, the bottleneck
  // shifts to these frequent preview decodes. 60 = max allowed = fewest
  // possible previews without disabling the node entirely.
  nodes["41"] = {
    class_type: "LTX2SamplingPreviewOverride",
    inputs: {
      model: ["40", 0],
      vae: ["7", 0],
      preview_rate: 60,
    },
  };

  // ── MODEL PATCHING - STAGE 2 ──────────────────────────────────────────────

  // FIX: Removed node 42 (duplicate LoRA).
  // Node 43 now references node 3 directly since LoRA is already
  // correctly applied there at 1.0.
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
      // Stage 2 operates on 2x upscaled latent - even more reason
      // to avoid frequent TAE decodes on 16GB VRAM
      preview_rate: 60,
    },
  };

  // ── STAGE 1 SAMPLING ──────────────────────────────────────────────────────

  nodes["50"] = {
    class_type: "RandomNoise",
    inputs: { noise_seed: seed },
  };

  // Sigmas unchanged - these are correct for the distilled model
  nodes["51"] = {
    class_type: "ManualSigmas",
    inputs: {
      sigmas:
        "1., 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0",
    },
  };

  // Sampler unchanged
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
      // cfg 1 is intentional for distilled LTX - do not raise this,
      // the distilled model bakes guidance in during training
      cfg: 1,
    },
  };

  // FIX: strength 0.8 -> 0.65, interpolate false -> true.
  // strength 0.8 clamps the first frame so rigidly that the model
  // cannot smoothly transition to frame 1, causing a visible
  // color/brightness pop on the first frame of every generation.
  // interpolate: true tells LTXVImgToVideoInplace to blend the
  // image conditioning across nearby frames rather than hard-clamping
  // only frame 0, which eliminates the discontinuity.
  nodes["54"] = {
    class_type: "LTXVImgToVideoInplace",
    inputs: {
      vae: ["4", 0],
      image: ["22", 0],
      latent: ["32", 0],
      strength: 0.65,
      interpolate: true,
      bypass: false,
    },
  };

  nodes["55"] = {
    class_type: "LTXVConcatAVLatent",
    inputs: {
      video_latent: ["54", 0],
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

  // FIX: strength 0.8 -> 0.5, interpolate false -> true.
  // The upscaled latent from node 58 already has good structure from
  // stage 1. Re-injecting at 0.8 partially overwrites that structure
  // with the raw encoded image, fighting the stage 1 result and causing
  // frame 0 to look different from all other frames in the final video.
  // 0.5 lets stage 1's motion structure survive into stage 2.
  nodes["59"] = {
    class_type: "LTXVImgToVideoInplace",
    inputs: {
      vae: ["4", 0],
      image: ["22", 0],
      latent: ["58", 0],
      strength: 0.5,
      interpolate: true,
      bypass: false,
    },
  };

  nodes["60"] = {
    class_type: "LTXVConcatAVLatent",
    inputs: {
      video_latent: ["59", 0],
      audio_latent: ["57", 1],
    },
  };

  // ── STAGE 2 SAMPLING ──────────────────────────────────────────────────────

  // Sigmas unchanged - correct for stage 2 refinement pass
  nodes["61"] = {
    class_type: "ManualSigmas",
    inputs: {
      sigmas: "0.8025, 0.6332, 0.4525, 0.2425, 0.0",
    },
  };

  // FIX: Fixed seed 42 -> random seed derived from stage 1 seed.
  // Using the hardcoded seed 42 for every single generation means
  // the stage 2 noise pattern is always identical regardless of what
  // stage 1 produced. When stage 1 generates varied motion, stage 2
  // always applies the same noise on top, creating a consistent
  // "fingerprint" artifact pattern visible across all outputs.
  // Deriving from stage 1 seed keeps it deterministic per-generation
  // while being unique to each run.
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

  // temporal_overlap 8 -> 16: slightly more blending at tile boundaries
  // reduces the faint horizontal banding sometimes visible in motion
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

    console.log("Submitting LTX workflow | seed:", seed, "| prefix:", prefix);
    console.log("LTX Nodes:", JSON.stringify(nodes, null, 2));

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any) => {
      if (resolved) return;
      resolved = true;
      console.log("LTX Generation SUCCESS:", data);

      const outputNode = data?.["74"] || data?.["73"];
      const videoData = outputNode?.videos?.[0] || outputNode?.gifs?.[0];

      resolve({
        prompt_id: prefix,
        video_path: videoData?.filename ?? `${prefix}_00001_.mp4`,
        subfolder: videoData?.subfolder ?? "video",
      });
    });

    wrapper.onFailed((err: any) => {
      if (resolved) return;
      resolved = true;
      console.error("LTX Generation FAILED:", err);
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.onProgress((progress: any) => {
      console.log(`LTX Progress: ${progress?.value} / ${progress?.max}`);
    });

    wrapper.run();
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const imageFile = body.get('image') as File | null;
    const prompt = (body.get('prompt') as string) || "";
    const negative_prompt = (body.get('negative_prompt') as string) || "blurry, low quality, still frame, watermark";
    const width = body.get('width') ? parseInt(body.get('width') as string) : undefined;
    const height = body.get('height') ? parseInt(body.get('height') as string) : undefined;
    const frames = body.get('frames') ? parseInt(body.get('frames') as string) : undefined;
    const fps = body.get('fps') ? parseInt(body.get('fps') as string) : 24;

    if (!imageFile) {
      return NextResponse.json({ error: 'Image required' }, { status: 400 });
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageFile.type || 'image/png';
    const imageData = `data:${mimeType};base64,${base64}`;

    await api.init(5, 2000).waitForReady();

    const result = await generateLtxVideo({
      image: imageData,
      prompt,
      negative_prompt,
      width,
      height,
      frames,
      fps
    });

    return NextResponse.json({ prompt_id: result.prompt_id, video_path: result.video_path, subfolder: result.subfolder });
  } catch (error) {
    console.error("LTX API error:", error);
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