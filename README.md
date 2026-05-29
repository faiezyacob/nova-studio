# Nova Studio (Comfy Web)

A premium web interface for high-end Image and Video generation using ComfyUI.

## 🚀 Getting Started

The easiest way to start both the Web UI and ComfyUI is to run the provided batch script:

### 1. Automatic Startup (Windows)
Double-click `start_all.bat` in the root directory. This will:
- Start ComfyUI using its virtual environment.
- Start the development server for the Web UI.

---

### 2. Manual Startup
If you prefer to start the services manually, follow these steps:

#### **A. Start ComfyUI**
Navigate to the `ComfyUI` folder and run the main script.
```bash
cd ComfyUI
# Using virtual environment (recommended)
.\venv\Scripts\python.exe main.py --allow-code-cs --enable-cors-header
```
*Note: Ensure you have the required custom nodes and models installed.*

#### **B. Start Web UI**
Navigate to the `comfy-web` folder and start the development server.
```bash
cd comfy-web
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## Enhance Prompt Guide

### Enhance prompt for image gen
- **Recommended:** `gemma-4-26b-a4b-it-heretic-ara`
- **For low VRAM:** `qwen3.5-9b-uncensored-hauhaucs-aggressive`

### Enhance prompt for video gen
- **Recommended:** `gemma-4-26b-a4b-it-heretic-ara`
- **For low VRAM:** `qwen3.5-9b-uncensored-hauhaucs-aggressive`
- **NOTE**: For video generation it is required to use model that supports vision

## 🖼️ Image Generation Guide

### 1. Generating Images
1. Navigate to the **Image Workspace**.
2. Enter a descriptive prompt for the image you want to create.
3. Click **Generate Image**.
4. Once generated, the image will appear in the gallery.

### 2. Using LoRAs for Style Transfer
Nova Studio supports LoRAs for applying different artistic styles to your images.

1. In the Image Workspace, locate the **LoRA** dropdown (this is hardcoded inside code you may need to update `src/components/ImageWorkspace.tsx` file to include new LoRAs) and LoRAs must be placed inside `ComfyUI/models/loras` folder.
2. Select one of the available LoRAs (e.g., `zimage_anadearmas`, etc.).
3. Adjust the LoRA weight if needed (default is typically 1.0).
4. Generate your image with the selected style applied.

### 3. Upscaling Images
To increase the resolution of your generated images:

1. Generate or select an image in the **Image Workspace**.
2. Click the **Upscale** button on the image.
3. Select the scale factor (x2 or x4).
4. Select upcale model RTX Video SR (Ultra), RTX Video SR (High) or RTX Video SR (Medium)
5. Click **Upscale** to process the image.

## 🎥 Video Generation Guide

### 1. Generating Video From Image
1. Generate or import an image in the **Image Workspace**.
2. Click the **"Use for Video"** button on the image.
3. Navigate to the **Video Workspace**
4. The image will appear as the input image.
5. Or you can upload an image manually
5. Add a descriptive prompt for the video and generate.

### 2. Generating Continuation Videos (First Frame to Next)
Nova Studio allows you to create seamless video continuations by using the last frame of a generated video as the starting point for the next one.

1.  Generate a video in the **Video Workspace**.
2.  In the **Video Gallery**, hover over the generated video and click the **"Use for Video"** icon (video camera icon).
3.  The application will automatically extract the **last frame** of that video and set it as the input image for your next generation.
4.  Modify your prompt to describe the next sequence of action and click **Generate Video**.

### 3. Combining Videos
Once you have generated multiple segments of a video, you can stitch them together directly in the app.

1.  Click the **"Combine Mode"** button in the Video Gallery.
2.  Select the videos you want to combine in the order you want them to appear.
3.  Click **"Combine Selected"**.
4.  The app will use FFmpeg to merge the videos into a single file without re-encoding (preserving quality).

> [!NOTE]
> **FFmpeg** must be installed and available in your system PATH for the combine feature to work.

### Upscaling Videos
To increase the resolution of your generated videos:

1. Generate or select an video in the **Video Workspace**.
2. Click the **Upscale** button on the video.
3. Select the scale factor (x2 or x4).
4. Select upcale model RTX Video SR (Ultra), RTX Video SR (High) or RTX Video SR (Medium)
5. Click **Upscale** to process the video.

## 📦 Model Requirements

To use all features, ensure the following models are downloaded and placed in your ComfyUI `models` directories.

### Image Generation (z-image-turbo)
| Model Type | Filename | Path in ComfyUI |
| :--- | :--- | :--- |
| **UNET** | `z-image-turbo-fp8-e4m3fn.safetensors` | `models/unet` |
| **CLIP** | `Qwen3-4B-Q4_K_S.gguf` | `models/clip` |
| **VAE** | `ae.safetensors` | `models/vae` |

### Video Generation (Wan 2.2)
| Model Type | Filename | Path in ComfyUI |
| :--- | :--- | :--- |
| **UNET (High Noise)** | `wan2.2_i2v_high_noise_14B_Q4_K_S.gguf` | `models/unet` |
| **UNET (Low Noise)** | `wan2.2_i2v_low_noise_14B_Q4_K_S.gguf` | `models/unet` |
| **VAE** | `wan_2.1_vae.safetensors` | `models/vae` |
| **CLIP** | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/clip` |
| **Distill LoRA** | `lightx2v_I2V_14B_480p_cfg_step_distill_rank32_bf16.safetensors` | `models/loras` |

### Video Generation (LTX)
| Model Type | Filename | Path in ComfyUI |
| :--- | :--- | :--- |
| **UNET** | `ltx-2-3-22b-dev-Q4_K_M.gguf` | `models/unet` |
| **CLIP** | `gemma_3_12B_it_fp4_mixed.safetensors` | `models/clip` |
| **CLIP** | `ltx-2.3_text_projection_bf16.safetensors` | `models/clip` |
| **VAE** | `LTX23_video_vae_bf16.safetensors` | `models/vae` |
| **VAE** | `LTX23_audio_vae_bf16.safetensors` | `models/vae` |
| **Distill LoRA** | `ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors` | `models/loras` |
| **Latent Upscale** | `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` | `models/latent_upscale_models` |

### Video Upscale 2x Frame Interpolation
| Model Type | Filename | Path in ComfyUI |
| **Frame interpolation** | `film_net_fp16.safetensors` | `models/frame_interpolation` |

### Recommended LoRAs (Image)
Place these in `models/loras` (Download from [malcolmrey/zimage](https://huggingface.co/malcolmrey/zimage/tree/main)):
- `pixel_art_style_z_image_turbo.safetensors`
- `zimage_anadearmas_v2_onetrainer.safetensors`
- `zimage_alexandradaddario_v2_onetrainer.safetensors`
- ... (and other `zimage_*` models)

## 🛠️ System Requirements
- **ComfyUI**: Running with `--allow-code-cs --enable-cors-header`.
- **FFmpeg**: Required for combining video segments.
- **LM Studio**: Required for prompt enhancement (vision models recommended for I2V).

