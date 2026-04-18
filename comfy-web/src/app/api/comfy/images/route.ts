import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, unlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
const LOCAL_IMAGES_DIR = path.join(process.cwd(), 'public', 'generated');
const COMFY_OUTPUT_DIR = path.join(process.cwd(), '..', 'ComfyUI', 'output');

async function ensureDirectory(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function extractFilename(filename: string): string {
  return filename.replace(/[\/\\]/g, '_');
}

function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'mp4' || ext === 'webm' || ext === 'mov') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  return 'image/png';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  const subfolder = searchParams.get('subfolder') || '';

  console.log('[IMAGES] Request:', { filename, subfolder, url: request.url });

  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  }

  const imageName = extractFilename(filename);
  const contentType = getContentType(imageName);
  const isVideo = contentType.startsWith('video/');
  
  console.log('[IMAGES] Detected:', { imageName, contentType, isVideo, subfolder });
  
  // Videos from Wan2.2 are saved in "video/" subfolder in ComfyUI
  // For local storage, we store them directly in public/generated without subfolder
  let effectiveSubfolder = subfolder;
  
  if (isVideo && subfolder === 'video') {
    // Convert "video" subfolder to empty for local storage
    // But still fetch from ComfyUI's video/ subfolder
    effectiveSubfolder = '';
  }
  
  const subfolderParts = effectiveSubfolder ? effectiveSubfolder.split('/').map(s => extractFilename(s)) : [];
  const subfolderPath = subfolderParts.join(path.sep);
  const localPath = path.join(LOCAL_IMAGES_DIR, subfolderPath, imageName);

  console.log('[IMAGES] Paths:', { localPath, subfolder, effectiveSubfolder });

  try {
    // 1. Check if already in cache
    if (existsSync(localPath)) {
      console.log('[IMAGES] Serving from cache:', localPath);
      const imageBuffer = await readFile(localPath);
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        },
      });
    }

    // 2. Try to read directly from ComfyUI output directory (if local)
    // This is much faster and more reliable than fetching via HTTP
    const comfyLocalDir = subfolder ? path.join(COMFY_OUTPUT_DIR, subfolder) : COMFY_OUTPUT_DIR;
    const comfyLocalPath = path.join(comfyLocalDir, filename);

    console.log('[IMAGES] Checking local ComfyUI path:', comfyLocalPath);
    if (existsSync(comfyLocalPath)) {
      console.log('[IMAGES] Found file locally, copying...');
      const imageBuffer = await readFile(comfyLocalPath);
      
      await ensureDirectory(path.dirname(localPath));
      await writeFile(localPath, imageBuffer);
      
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': isVideo ? 'no-store' : 'public, max-age=31536000',
        },
      });
    }

    // 3. Fallback: Fetch from ComfyUI API
    const comfyUrl = new URL(`${COMFYUI_URL}/view`);
    comfyUrl.searchParams.append('filename', filename);
    if (subfolder) {
      comfyUrl.searchParams.append('subfolder', subfolder);
    }
    
    console.log('[IMAGES] Fetching from ComfyUI:', comfyUrl.toString());
    const response = await fetch(comfyUrl.toString());

    if (!response.ok) {
      console.log('[IMAGES] ComfyUI response not ok:', response.status, response.statusText);
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const imageBuffer = await response.arrayBuffer();
    console.log('[IMAGES] Fetched buffer size:', imageBuffer.byteLength);

    await ensureDirectory(path.dirname(localPath));
    await writeFile(localPath, Buffer.from(imageBuffer));

    console.log('[IMAGES] Cached file to:', localPath);

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': isVideo ? 'no-store' : 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('[IMAGES] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch image' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  try {
    if (!filename) {
      let deletedFromLocal = 0;
      let deletedFromComfy = 0;

      if (existsSync(LOCAL_IMAGES_DIR)) {
        const localFiles = await readdir(LOCAL_IMAGES_DIR);
        await Promise.all(
          localFiles.map(file => unlink(path.join(LOCAL_IMAGES_DIR, file)).catch(() => {}))
        );
        deletedFromLocal = localFiles.length;
      }

      if (existsSync(COMFY_OUTPUT_DIR)) {
        const comfyFiles = await readdir(COMFY_OUTPUT_DIR);
        await Promise.all(
          comfyFiles.map(file => unlink(path.join(COMFY_OUTPUT_DIR, file)).catch(() => {}))
        );
        deletedFromComfy = comfyFiles.length;
      }

      return NextResponse.json({ 
        message: `Cleared library`,
        details: {
          local: deletedFromLocal,
          comfy: deletedFromComfy
        }
      });
    }

    const imageName = extractFilename(filename);
    const localPath = path.join(LOCAL_IMAGES_DIR, imageName);
    const comfyPath = path.join(COMFY_OUTPUT_DIR, imageName);

    let deletedFromLocal = 0;
    let deletedFromComfy = 0;

    if (existsSync(localPath)) {
      await unlink(localPath);
      deletedFromLocal = 1;
    }

    if (existsSync(comfyPath)) {
      await unlink(comfyPath);
      deletedFromComfy = 1;
    }

    return NextResponse.json({ 
      message: `Deleted image`,
      details: {
        local: deletedFromLocal,
        comfy: deletedFromComfy
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete image' },
      { status: 500 }
    );
  }
}