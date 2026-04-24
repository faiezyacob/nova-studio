import { ComfyApi, PromptBuilder, CallWrapper } from "@saintno/comfyui-sdk";

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const api = new ComfyApi(COMFYUI_URL);

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
  seed?: number
): Promise<{ prompt_id: string; images: string[]; seed: number }> {
  await api.init(5, 2000).waitForReady();

  const prefix = `gen_${Math.floor(Date.now() / 1000)}`;
  const fullPrompt = `A breathtaking photograph of ${prompt}`;
  const generationSeed = seed ?? Math.floor(Math.random() * 10000000000000);

  const nodes: Record<string, object> = {};

  nodes["16"] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: "z-image-turbo-fp8-e4m3fn.safetensors",
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

    wrapper.onFinished(async (data: any) => {
      if (resolved) return;
      resolved = true;
      
      const images = data.images?.images?.map((img: any) => {
        // getPathImage returns URL like: http://host/view?filename=xxx&type=output&subfolder=
        // We need just the filename
        const url = api.getPathImage(img);
        const urlObj = new URL(url);
        return urlObj.searchParams.get('filename') || img.filename || `${prefix}_00001_.png`;
      }) || [];
      resolve({ prompt_id: prefix, images, seed: generationSeed });
    });

    wrapper.onFailed((err: Error) => {
      if (resolved) return;
      resolved = true;
      reject(err);
    });

    wrapper.run();
  });
}

export { api };