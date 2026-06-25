import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";
import { emitProgress, emitComplete, emitError } from '@/lib/progress-events';

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const api = new ComfyApi(COMFYUI_URL, undefined, { wsTimeout: 300000 });

export interface ComfyClient {
  init(): Promise<void>;
  generateImage(options: {
    prompt: string;
    width: number;
    height: number;
    lora?: {
      name: string;
      strength_model: number;
      strength_clip: number;
    };
  }): Promise<{ prompt_id: string; images: string[] }>;
}

export async function initComfyApi(): Promise<ComfyApi> {
  await api.init(5, 2000).waitForReady();
  return api;
}

interface Lora {
  name: string;
  strength_model: number;
  strength_clip: number;
}

export async function generateWithSDK(
  prompt: string,
  width: number,
  height: number,
  lora: Lora | null = null,
  seed?: number,
  generationId?: string
): Promise<{ prompt_id: string; images: string[]; seed: number }> {
  await api.init(5, 2000).waitForReady();

  const prefix = `gen_${Math.floor(Date.now() / 1000)}`;
  const fullPrompt = `A breathtaking photograph of ${prompt}`;
  const generationSeed = seed ?? Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, object> = {};

  nodes["16"] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: "z_image_turbo_bf16.safetensors",
      weight_dtype: "fp8_e4m3fn",
    },
  };
  nodes["32"] = {
    class_type: "CLIPLoaderGGUF",
    inputs: {
      clip_name: "Qwen3-4B-Q4_K_S.gguf",
      type: "lumina2",
    },
  };

  let modelNodeId = "16";
  let clipNodeId = "32";

  if (lora?.name) {
    nodes["100"] = {
      class_type: "LoraLoader",
      inputs: {
        model: ["16", 0],
        clip: ["32", 0],
        lora_name: lora.name,
        strength_model: lora.strength_model,
        strength_clip: lora.strength_clip,
      },
    };
    modelNodeId = "100";
    clipNodeId = "100";
  }

  nodes["17"] = {
    class_type: "VAELoader",
    inputs: {
      vae_name: "ae.safetensors",
    },
  };
  nodes["28"] = {
    class_type: "PathchSageAttentionKJ",
    inputs: {
      model: [modelNodeId, 0],
      sage_attention: "auto",
    },
  };
  nodes["11"] = {
    class_type: "ModelSamplingAuraFlow",
    inputs: {
      model: ["28", 0],
      shift: 3,
    },
  };
  nodes["6"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: [clipNodeId, lora ? 1 : 0],
      text: fullPrompt,
    },
  };
  nodes["7"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: [clipNodeId, lora ? 1 : 0],
      text: "",
    },
  };
  nodes["13"] = {
    class_type: "EmptySD3LatentImage",
    inputs: {
      width,
      height,
      batch_size: 1,
    },
  };
  nodes["3"] = {
    class_type: "KSampler",
    inputs: {
      model: ["11", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["13", 0],
      seed: generationSeed,
      steps: 9,
      cfg: 1.0,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1.0,
    },
  };
  nodes["8"] = {
    class_type: "VAEDecode",
    inputs: {
      samples: ["3", 0],
      vae: ["17", 0],
    },
  };
  nodes["9"] = {
    class_type: "SaveImage",
    inputs: {
      images: ["8", 0],
      filename_prefix: prefix,
    },
  };

  return new Promise((resolve, reject) => {
    let resolved = false;

    const builder = new PromptBuilder(
      nodes as any,
      ["prompt", "width", "height", "seed"],
      ["images"]
    );
    
    builder.setInputNode("prompt", "6.inputs.text");
    builder.setInputNode("width", "13.inputs.width");
    builder.setInputNode("height", "13.inputs.height");
    builder.setInputNode("seed", "3.inputs.seed");
    builder.setOutputNode("images", "9");

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any, promptId?: string) => {
      if (resolved) return;
      resolved = true;
      try {
        const images = data.images?.images?.map((img: any) => {
          const url = api.getPathImage(img);
          const urlObj = new URL(url);
          return urlObj.searchParams.get('filename') || img.filename || `${prefix}_00001_.png`;
        }) || [];
        if (generationId) {
          emitComplete(generationId, {
            video_path: images[0] || '',
            subfolder: '',
            prompt_id: promptId || prefix,
          });
        }
        resolve({ prompt_id: promptId || prefix, images, seed: generationSeed });
      } catch (err) {
        reject(err);
      }
    });

    wrapper.onFailed((err: Error) => {
      if (resolved) return;
      resolved = true;
      if (generationId) {
        emitError(generationId, { error: err.message || String(err) });
      }
      reject(err);
    });

    wrapper.onProgress((progress: any) => {
      if (generationId && progress) {
        emitProgress(generationId, { value: progress.value, max: progress.max });
      }
    });

    wrapper.run();
  });
}

export async function generateWithIdeogramSDK(
  prompt: string,
  width: number,
  height: number,
  seed?: number,
  generationId?: string
): Promise<{ prompt_id: string; images: string[]; seed: number }> {
  await api.init(5, 2000).waitForReady();

  const prefix = `gen_${Math.floor(Date.now() / 1000)}`;
  const generationSeed = seed ?? Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, object> = {};

  nodes["23"] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: "ideogram4_fp8_scaled.safetensors",
      weight_dtype: "default",
    },
  };
  nodes["154"] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: "ideogram4_unconditional_fp8_scaled.safetensors",
      weight_dtype: "default",
    },
  };
  nodes["14"] = {
    class_type: "CLIPLoader",
    inputs: {
      clip_name: "qwen3vl_8b_fp8_scaled.safetensors",
      type: "ideogram4",
    },
  };
  nodes["9"] = {
    class_type: "VAELoader",
    inputs: {
      vae_name: "flux2-vae.safetensors",
    },
  };
  nodes["24"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["14", 0],
      text: prompt,
    },
  };
  nodes["10"] = {
    class_type: "ConditioningZeroOut",
    inputs: {
      conditioning: ["24", 0],
    },
  };
  nodes["157"] = {
    class_type: "CFGOverride",
    inputs: {
      model: ["23", 0],
      cfg: 3,
      scale: 0.9,
      start_percent: 0.0,
      end_percent: 1.0,
      block: 1,
    },
  };
  nodes["155"] = {
    class_type: "DualModelGuider",
    inputs: {
      model: ["157", 0],
      positive: ["24", 0],
      model_negative: ["154", 0],
      negative: ["10", 0],
      cfg: 7,
    },
  };
  nodes["16"] = {
    class_type: "KSamplerSelect",
    inputs: {
      sampler_name: "res_multistep",
    },
  };
  nodes["17"] = {
    class_type: "Ideogram4Scheduler",
    inputs: {
      steps: 12,
      width,
      height,
      mu: 0.5,
      std: 1.75,
    },
  };
  nodes["18"] = {
    class_type: "RandomNoise",
    inputs: {
      noise_seed: generationSeed,
    },
  };
  nodes["11"] = {
    class_type: "EmptyFlux2LatentImage",
    inputs: {
      width,
      height,
      batch_size: 1,
    },
  };
  nodes["12"] = {
    class_type: "SamplerCustomAdvanced",
    inputs: {
      noise: ["18", 0],
      guider: ["155", 0],
      sampler: ["16", 0],
      sigmas: ["17", 0],
      latent_image: ["11", 0],
    },
  };
  nodes["13"] = {
    class_type: "VAEDecode",
    inputs: {
      samples: ["12", 0],
      vae: ["9", 0],
    },
  };
  nodes["25"] = {
    class_type: "SaveImage",
    inputs: {
      images: ["13", 0],
      filename_prefix: prefix,
    },
  };

  return new Promise((resolve, reject) => {
    let resolved = false;

    const builder = new PromptBuilder(
      nodes as any,
      ["prompt", "width", "height", "seed"],
      ["images"]
    );

    builder.setInputNode("prompt", "24.inputs.text");
    builder.setInputNode("width", "11.inputs.width");
    builder.setInputNode("height", "11.inputs.height");
    builder.setInputNode("seed", "18.inputs.noise_seed");
    builder.setOutputNode("images", "25");

    const wrapper = new CallWrapper(api, builder);

    wrapper.onFinished((data: any, promptId?: string) => {
      if (resolved) return;
      resolved = true;
      try {
        const images = data.images?.images?.map((img: any) => {
          const url = api.getPathImage(img);
          const urlObj = new URL(url);
          return urlObj.searchParams.get('filename') || img.filename || `${prefix}_00001_.png`;
        }) || [];
        if (generationId) {
          emitComplete(generationId, {
            video_path: images[0] || '',
            subfolder: '',
            prompt_id: promptId || prefix,
          });
        }
        resolve({ prompt_id: promptId || prefix, images, seed: generationSeed });
      } catch (err) {
        reject(err);
      }
    });

    wrapper.onFailed((err: Error) => {
      if (resolved) return;
      resolved = true;
      if (generationId) {
        emitError(generationId, { error: err.message || String(err) });
      }
      reject(err);
    });

    wrapper.onProgress((progress: any) => {
      if (generationId && progress) {
        emitProgress(generationId, { value: progress.value, max: progress.max });
      }
    });

    wrapper.run();
  });
}

export { api };