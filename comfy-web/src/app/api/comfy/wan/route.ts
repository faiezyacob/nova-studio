import { NextRequest, NextResponse } from 'next/server';
import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";

function generateSeed(): number {
  return Math.floor(Math.random() * 10000000000000);
}

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const api = new ComfyApi(COMFYUI_URL);

interface WanOptions {
  image: string; // base64 or filename
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  frames?: number;
}

async function generateWanVideo(options: WanOptions): Promise<{ prompt_id: string; video_path: string }> {
  const { image, prompt, negative_prompt, width, height, frames } = options;

  const videoWidth = width || 480;
  const videoHeight = height || 832;
  const videoFrames = frames || 81;

  const prefix = `wan_${Math.floor(Date.now() / 1000)}`;
  const seed = Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, any> = {};

  // =========================
  // LOAD MODELS
  // Node 21 in original = high_noise, Node 15 in original = low_noise
  // =========================

  // HIGH NOISE model (original node 21)
  nodes["1"] = {
    class_type: "UnetLoaderGGUF",
    inputs: { unet_name: "wan2.2_i2v_high_noise_14B_Q4_K_S.gguf" },
  };

  // LOW NOISE model (original node 15)
  nodes["2"] = {
    class_type: "UnetLoaderGGUF",
    inputs: { unet_name: "wan2.2_i2v_low_noise_14B_Q4_K_S.gguf" }, // ✅ FIXED: was high_noise twice
  };

  nodes["3"] = {
    class_type: "VAELoader",
    inputs: { vae_name: "wan_2.1_vae.safetensors" },
  };

  // ✅ FIXED: CLIPLoader - match original widget_values exactly
  // Original: ["umt5_xxl_fp8_e4m3fn_scaled.safetensors", "wan", "default"]
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
  // Original: node21 -> node9(sage) -> node11(torch) -> node14(lora 3.0) -> node7(SD3) -> KSampler23 (FIRST)
  // =========================

  nodes["10"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: ["1", 0], // high noise
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
      lora_name: "lightx2v_I2V_14B_480p_cfg_step_distill_rank32_bf16.safetensors",
      strength_model: 3.0, // ✅ HIGH noise gets 3.0 (original node14)
    },
  };

  nodes["13"] = {
    class_type: "ModelSamplingSD3",
    inputs: {
      model: ["12", 0],
      shift: 8, // ✅ original uses 8 for both
    },
  };

  // =========================
  // LOW NOISE MODEL PIPELINE
  // Original: node15 -> node10(sage) -> node12(torch) -> node13(lora 1.5) -> node8(SD3) -> KSampler16 (SECOND)
  // =========================

  nodes["20"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: ["2", 0], // low noise
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

  nodes["22"] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: ["21", 0],
      lora_name: "lightx2v_I2V_14B_480p_cfg_step_distill_rank32_bf16.safetensors",
      strength_model: 1.5, // ✅ LOW noise gets 1.5 (original node13)
    },
  };

  nodes["23"] = {
    class_type: "ModelSamplingSD3",
    inputs: {
      model: ["22", 0],
      shift: 8,
    },
  };

  // =========================
  // PROMPTS
  // =========================

  // Negative prompt (original node 3)
  nodes["30"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["4", 0],
      text: negative_prompt ||
        "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走",
    },
  };

  // Positive prompt (original node 17)
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
    // Already a ComfyUI filename
    imageFilename = image;
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
    const blob = new Blob([buffer], { type: mimeType }); // ✅ FIXED: use actual mime type
    uploadForm.append("image", blob, `input_image.${ext}`); // ✅ FIXED: correct extension
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

  // LoadImage (original node 18)
  nodes["40"] = {
    class_type: "LoadImage",
    inputs: {
      image: imageFilename,
      upload: "image", // ✅ match original widget_values: ["filename", "image"]
    },
  };

  // =========================
  // IMAGE RESIZE
  // Original node 20 widget_values:
  // [512, 512, "nearest-exact", "stretch", "0, 0, 0", "center", 2, "cpu", "nearest-exact", 8, true, "0, 0, 0", "center"]
  // Note: node 20 in original is mode:4 (bypassed/muted in original!) 
  // but we include it active here since we need resize
  // =========================

  nodes["41"] = {
    class_type: "ImageResizeKJv2",
    inputs: {
      image: ["40", 0],
      width: videoWidth,
      height: videoHeight,
      upscale_method: "nearest-exact",
      keep_proportion: "stretch",   // ✅ matches original widget "stretch"
      pad_color: "0, 0, 0",
      crop_position: "center",
      divisible_by: 8,
    },
  };

  // =========================
  // WAN IMAGE TO VIDEO
  // Original node 19 widget_values: [480, 832, 81, 1, 1, 81]
  // Maps to: width, height, length, batch_size, ?, ?
  // =========================

  nodes["50"] = {
    class_type: "WanImageToVideo",
    inputs: {
      positive: ["31", 0],
      negative: ["30", 0],
      vae: ["3", 0],
      start_image: ["41", 0],
      width: videoWidth,
      height: videoHeight,
      length: videoFrames,   // ✅ FIXED: "length" not "frames" - matches original
      batch_size: 1,
    },
  };

  // =========================
  // SAMPLERS
  // ✅ CRITICAL FIX: HIGH NOISE runs FIRST, LOW NOISE runs SECOND
  //
  // Original KSampler23 (first, high noise model node7):
  //   widget_values: ["enable", 230675135476310, 6, 1, "euler", "simple", 0, 3, "disable"]
  //   = add_noise=enable, seed=xxx, steps=6, cfg=1, sampler=euler, scheduler=simple,
  //     start_at_step=0, end_at_step=3, return_with_leftover_noise=disable
  //
  // Original KSampler16 (second, low noise model node8):
  //   widget_values: ["enable", 0, 6, 1, "euler", "simple", 0, 3, "disable"]
  //   = add_noise=enable, seed=0, steps=6, cfg=1, sampler=euler, scheduler=simple,
  //     start_at_step=0, end_at_step=3, return_with_leftover_noise=disable
  //
  // NOTE: second sampler takes latent from FIRST sampler output (link 15: node23->node16)
  // =========================

  // FIRST sampler - HIGH NOISE model (original KSampler node 23)
  nodes["60"] = {
    class_type: "KSamplerAdvanced",
    inputs: {
      model: ["13", 0],             // ✅ HIGH NOISE model pipeline
      positive: ["50", 0],
      negative: ["50", 1],
      latent_image: ["50", 2],      // ✅ takes latent from WanImageToVideo
      add_noise: "enable",          // ✅ matches original
      noise_seed: seed,             // ✅ random seed for first pass
      steps: 6,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      start_at_step: 0,
      end_at_step: 3,
      return_with_leftover_noise: "disable", // ✅ matches original exactly
    },
  };

  // SECOND sampler - LOW NOISE model (original KSampler node 16)
  nodes["61"] = {
    class_type: "KSamplerAdvanced",
    inputs: {
      model: ["23", 0],             // ✅ LOW NOISE model pipeline
      positive: ["50", 0],
      negative: ["50", 1],
      latent_image: ["60", 0],      // ✅ takes latent from FIRST sampler output
      add_noise: "enable",          // ✅ FIXED: original uses "enable" not "disable"
      noise_seed: 0,                // ✅ FIXED: original uses 0 for second sampler
      steps: 6,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      start_at_step: 0,             // ✅ matches original (both start at 0)
      end_at_step: 3,               // ✅ matches original (both end at 3)
      return_with_leftover_noise: "disable", // ✅ matches original
    },
  };

  // =========================
  // DECODE + OUTPUT
  // =========================

  // VAEDecode (original node 5)
  nodes["70"] = {
    class_type: "VAEDecode",
    inputs: {
      samples: ["61", 0],
      vae: ["3", 0],
    },
  };

  // CreateVideo (original node 24) - widget_values: [16]
  nodes["80"] = {
    class_type: "CreateVideo",
    inputs: {
      images: ["70", 0],
      fps: 16, // ✅ matches original
    },
  };

  // SaveVideo (original node 25)
  // widget_values: ["video/ComfyUI", "auto", "auto", "ComfyUI"]
  nodes["90"] = {
    class_type: "SaveVideo",
    inputs: {
      video: ["80", 0],
      filename_prefix: `video/${prefix}`, // ✅ FIXED: original uses "video/ComfyUI" prefix
      format: "auto",                      // ✅ FIXED: original uses "auto"
      codec: "auto",                       // ✅ FIXED: original uses "auto"
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
    builder.setInputNode("width", "41.inputs.width");
    builder.setInputNode("height", "41.inputs.height");
    builder.setInputNode("frames", "50.inputs.length"); // ✅ FIXED: "length" not "frames"
    builder.setInputNode("seed", "60.inputs.noise_seed");
    builder.setOutputNode("video_path", "90");

    // Set actual values
    console.log('[WAN API] Mapping prompt to node 31 inputs.text:', prompt);
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
    console.log("Nodes:", JSON.stringify(nodes, null, 2));

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any) => {
      if (resolved) return;
      resolved = true;
      console.log("Generation SUCCESS:", data);

      // Extract video filename and subfolder from output
      const outputNode = data?.["90"];
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
      console.error("Generation FAILED:", err);
      reject(new Error(typeof err === "string" ? err : JSON.stringify(err)));
    });

    wrapper.onProgress((progress: any) => {
      console.log(`Progress: step ${progress?.value} / ${progress?.max}`);
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
    const frames = body.get('frames') ? parseInt(body.get('frames') as string) : undefined;

    if (!imageFile || !prompt) {
      console.error('[WAN API] Missing required fields:', { hasImage: !!imageFile, hasPrompt: !!prompt });
      return NextResponse.json(
        { error: 'Image and prompt are required' },
        { status: 400 }
      );
    }
    console.log('[WAN API] Received prompt:', prompt);

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
      frames,
    });

    return NextResponse.json({
      prompt_id: result.prompt_id,
      video_path: result.video_path
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