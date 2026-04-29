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

  // =========================
  // IMAGE UPLOAD
  // Exactly matching WAN pattern
  // =========================

  let imageFilename = "";

  if (typeof image === "string" && !image.startsWith("data:") && !image.includes(",")) {
    // Already a ComfyUI filename
    imageFilename = image;
    console.log("Using existing ComfyUI image filename:", imageFilename);
  } else if (typeof image === "string" && image.startsWith("data:")) {
    // Parse mime type from data URI for correct extension
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
    console.log("Uploaded LTX image as:", imageFilename);
  } else {
    throw new Error("Invalid image format - must be filename or base64 data URI");
  }

  // =========================
  // MODEL LOADING
  // =========================

  // Node 1 - Dual CLIP Loader (Gemma 3 + LTX text projection)
  nodes["1"] = {
    class_type: "DualCLIPLoader",
    inputs: {
      clip_name1: "gemma_3_12B_it_fp4_mixed.safetensors",
      clip_name2: "ltx-2.3_text_projection_bf16.safetensors",
      type: "ltxv",
      dtype: "default",
    },
  };

  // Node 2 - GGUF Diffusion Model
  nodes["2"] = {
    class_type: "UnetLoaderGGUF",
    inputs: { unet_name: "ltx-2-3-22b-dev-Q4_K_M.gguf" },
  };

  // SageAttention Patch (from KJNodes)
  nodes["8"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: ["2", 0],
      sage_attention: "auto",
    },
  };

  // Torch Settings Patch
  nodes["9"] = {
    class_type: "ModelPatchTorchSettings",
    inputs: {
      model: ["8", 0],
      enable_fp16_accumulation: true,
    },
  };

  // Node 3 - Distilled LoRA Stage 1 (strength 0.6)
  nodes["3"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["9", 0],
      lora_name: "ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors",
      strength_model: 0.6,
    },
  };

  // Node 4 - Video VAE
  nodes["4"] = {
    class_type: "VAELoader",
    inputs: { vae_name: "LTX23_video_vae_bf16.safetensors" },
  };

  // Node 5 - Audio VAE (KJNodes)
  nodes["5"] = {
    class_type: "VAELoaderKJ",
    inputs: {
      vae_name: "LTX23_audio_vae_bf16.safetensors",
      device: "main_device",
      dtype: "bf16",
      weight_dtype: "bf16",
    },
  };

  // Node 6 - Spatial Upscaler Model
  nodes["6"] = {
    class_type: "LatentUpscaleModelLoader",
    inputs: { model_name: "ltx-2.3-spatial-upscaler-x2-1.1.safetensors" },
  };

  // Node 7 - TAE VAE (for preview override)
  nodes["7"] = {
    class_type: "VAELoader",
    inputs: { vae_name: "taeltx2_3.safetensors" },
  };

  // =========================
  // PROMPTS + CONDITIONING
  // =========================

  // Node 10 - Positive prompt
  nodes["10"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 0],
      text: prompt,
    },
  };

  // Node 11 - Negative prompt
  nodes["11"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 0],
      text:
        negative_prompt ||
        "blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles",
    },
  };

  // Node 12 - LTXVConditioning (attaches frame_rate to conditioning)
  nodes["12"] = {
    class_type: "LTXVConditioning",
    inputs: {
      positive: ["10", 0],
      negative: ["11", 0],
      frame_rate: Math.floor(fps),
    },
  };

  // =========================
  // IMAGE PROCESSING
  // =========================

  // Node 20 - Load Image
  nodes["20"] = {
    class_type: "LoadImage",
    inputs: {
      image: imageFilename,
      upload: "image",
    },
  };

  // Node 21 - Resize to longer edge 1024 (matches workflow node 151)
  nodes["21"] = {
    class_type: "ResizeImagesByLongerEdge",
    inputs: {
      images: ["20", 0],
      longer_edge: 1024,
    },
  };

  // Node 22 - LTXVPreprocess
  nodes["22"] = {
    class_type: "LTXVPreprocess",
    inputs: {
      image: ["21", 0],
      mode: 0,
      img_compression: 0,
    },
  };

  // =========================
  // LATENT SETUP
  // =========================

  // Node 32 - Empty video latent
  nodes["32"] = {
    class_type: "EmptyLTXVLatentVideo",
    inputs: {
      width: width,
      height: height,
      length: frames,
      batch_size: 1,
    },
  };

  // Node 33 - Empty audio latent
  nodes["33"] = {
    class_type: "LTXVEmptyLatentAudio",
    inputs: {
      audio_vae: ["5", 0],
      frames_number: frames,
      frame_rate: Math.floor(fps),
      batch_size: 1,
    },
  };

  // =========================
  // MODEL PATCHING - STAGE 1
  // =========================

  // Node 40 - Chunk Feed Forward Stage 1
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

  // Node 41 - Preview Override Stage 1
  nodes["41"] = {
    class_type: "LTX2SamplingPreviewOverride",
    inputs: {
      model: ["40", 0],
      vae: ["7", 0],
      preview_rate: 8,
    },
  };

  // =========================
  // MODEL PATCHING - STAGE 2
  // =========================

  // Node 42 - Optional LoRA strength 1.0 for stage 2
  nodes["42"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["3", 0],
      lora_name: "ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors",
      strength_model: 1.0,
    },
  };

  // Node 43 - Chunk Feed Forward Stage 2
  nodes["43"] = {
    class_type: "LTXVChunkFeedForward",
    inputs: {
      model: ["42", 0],
      chunk_size: 2,
      overlap: 2048,
      chunks: 4,
      dim_threshold: 2048,
    },
  };

  // Node 44 - Preview Override Stage 2
  nodes["44"] = {
    class_type: "LTX2SamplingPreviewOverride",
    inputs: {
      model: ["43", 0],
      vae: ["7", 0],
      preview_rate: 8,
    },
  };

  // =========================
  // STAGE 1 SAMPLING
  // =========================

  // Node 50 - Random noise stage 1
  nodes["50"] = {
    class_type: "RandomNoise",
    inputs: {
      noise_seed: seed,
    },
  };

  // Node 51 - Manual sigmas stage 1
  nodes["51"] = {
    class_type: "ManualSigmas",
    inputs: {
      sigmas: "1., 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0",
    },
  };

  // Node 52 - KSampler select euler_ancestral for stage 1
  nodes["52"] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "euler_ancestral" },
  };

  // Node 53 - CFG Guider stage 1
  nodes["53"] = {
    class_type: "CFGGuider",
    inputs: {
      model: ["41", 0],
      positive: ["12", 0],
      negative: ["12", 1],
      cfg: 1,
    },
  };

  // Node 54 - Img to video inplace (inject start frame into low-res latent)
  nodes["54"] = {
    class_type: "LTXVImgToVideoInplace",
    inputs: {
      vae: ["4", 0],
      image: ["22", 0],
      latent: ["32", 0],
      strength: 0.8,
      interpolate: false,
      bypass: false,
    },
  };

  // Node 55 - Concat video + audio latents for stage 1
  nodes["55"] = {
    class_type: "LTXVConcatAVLatent",
    inputs: {
      video_latent: ["54", 0],
      audio_latent: ["33", 0],
    },
  };

  // Node 56 - Stage 1 sampler
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

  // =========================
  // STAGE 1 -> STAGE 2 BRIDGE
  // =========================

  // Node 57 - Separate AV latent from stage 1 output
  nodes["57"] = {
    class_type: "LTXVSeparateAVLatent",
    inputs: { av_latent: ["56", 0] },
  };

  // Node 58 - Spatial upscale 2x on video latent
  nodes["58"] = {
    class_type: "LTXVLatentUpsampler",
    inputs: {
      samples: ["57", 0],
      upscale_model: ["6", 0],
      vae: ["4", 0],
    },
  };

  // Node 59 - Re-inject image guide into upscaled latent
  nodes["59"] = {
    class_type: "LTXVImgToVideoInplace",
    inputs: {
      vae: ["4", 0],
      image: ["22", 0],
      latent: ["58", 0],
      strength: 0.8,
      interpolate: false,
      bypass: false,
    },
  };

  // Node 60 - Concat upscaled video + audio latent for stage 2
  nodes["60"] = {
    class_type: "LTXVConcatAVLatent",
    inputs: {
      video_latent: ["59", 0],
      audio_latent: ["57", 1],
    },
  };

  // =========================
  // STAGE 2 SAMPLING
  // =========================

  // Node 61 - Manual sigmas stage 2
  nodes["61"] = {
    class_type: "ManualSigmas",
    inputs: {
      sigmas: "0.8025, 0.6332, 0.4525, 0.2425, 0.0",
    },
  };

  // Node 65 - Random noise stage 2 (Fixed seed 42)
  nodes["65"] = {
    class_type: "RandomNoise",
    inputs: {
      noise_seed: 42,
    },
  };

  // Node 62 - KSampler select euler for stage 2
  nodes["62"] = {
    class_type: "KSamplerSelect",
    inputs: { sampler_name: "euler" },
  };

  // Node 63 - CFG Guider stage 2
  nodes["63"] = {
    class_type: "CFGGuider",
    inputs: {
      model: ["44", 0],
      positive: ["12", 0],
      negative: ["12", 1],
      cfg: 1,
    },
  };

  // Node 64 - Stage 2 sampler
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

  // =========================
  // DECODE + OUTPUT
  // =========================

  // Node 70 - Separate final AV latent
  nodes["70"] = {
    class_type: "LTXVSeparateAVLatent",
    inputs: { av_latent: ["64", 0] },
  };

  // Node 71 - Tiled VAE decode video
  nodes["71"] = {
    class_type: "VAEDecodeTiled",
    inputs: {
      samples: ["70", 0],
      vae: ["4", 0],
      tile_size: 512,
      overlap: 64,
      temporal_size: 2048,
      temporal_overlap: 8,
    },
  };

  // Node 72 - Audio VAE decode
  nodes["72"] = {
    class_type: "LTXVAudioVAEDecode",
    inputs: {
      samples: ["70", 1],
      audio_vae: ["5", 0],
    },
  };

  // Node 73 - Create video from frames + audio
  nodes["73"] = {
    class_type: "CreateVideo",
    inputs: {
      images: ["71", 0],
      audio: ["72", 0],
      fps: fps,
    },
  };

  // Node 74 - Save video
  nodes["74"] = {
    class_type: "SaveVideo",
    inputs: {
      video: ["73", 0],
      filename_prefix: `video/${prefix}`,
      format: "mp4",
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

    builder.setInputNode("prompt", "10.inputs.text");
    builder.setInputNode("negative_prompt", "11.inputs.text");
    builder.setInputNode("width", "32.inputs.width");
    builder.setInputNode("height", "32.inputs.height");
    builder.setInputNode("frames", "32.inputs.length");
    builder.setInputNode("seed", "50.inputs.noise_seed");
    builder.setOutputNode("video_path", "74");

    console.log("[LTX API] Mapping prompt to node 10 inputs.text:", prompt);

    builder
      .input("prompt", prompt)
      .input(
        "negative_prompt",
        negative_prompt ||
        "blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles"
      )
      .input("width", width)
      .input("height", height)
      .input("frames", frames)
      .input("seed", seed);

    console.log("Submitting LTX workflow with seed:", seed);
    console.log("LTX Nodes:", JSON.stringify(nodes, null, 2));

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any) => {
      if (resolved) return;
      resolved = true;
      console.log("LTX Generation SUCCESS:", data);

      const outputNode = data?.["74"] || data?.["73"];
      const videoData = outputNode?.videos?.[0] || outputNode?.gifs?.[0];

      const videoFile = videoData?.filename || `${prefix}_00001_.mp4`;
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
      console.error("LTX Generation FAILED:", err);
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.onProgress((progress: any) => {
      console.log(`LTX Progress: step ${progress?.value} / ${progress?.max}`);
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