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

## 🎥 Video Generation Guide

### 1. Generating Continuation Videos (First Frame to Next)
Nova Studio allows you to create seamless video continuations by using the last frame of a generated video as the starting point for the next one.

1.  Generate a video in the **Video Workspace**.
2.  In the **Video Gallery**, hover over the generated video and click the **"Use for Video"** icon (video camera icon).
3.  The application will automatically extract the **last frame** of that video and set it as the input image for your next generation.
4.  Modify your prompt to describe the next sequence of action and click **Generate Video**.

### 2. Combining Videos
Once you have generated multiple segments of a video, you can stitch them together directly in the app.

1.  Click the **"Combine Mode"** button in the Video Gallery.
2.  Select the videos you want to combine in the order you want them to appear.
3.  Click **"Combine Selected"**.
4.  The app will use FFmpeg to merge the videos into a single file without re-encoding (preserving quality).

> [!NOTE]
> **FFmpeg** must be installed and available in your system PATH for the combine feature to work.

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

### Video Upscaling
| Model Type | Filename | Path in ComfyUI |
| :--- | :--- | :--- |
| **Upscale Model** | `RealESRGAN_x2plus.pth` | `models/upscale_models` |
| **Upscale Model** | `RealESRGAN_x4plus.safetensors` | `models/upscale_models` |

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

