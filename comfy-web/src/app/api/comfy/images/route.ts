import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, unlink, readdir, lstat, stat } from 'fs/promises';
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

async function waitForFileToBeReady(filePath: string, maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  let lastSize = 0;
  let stableCount = 0;
  const MIN_VIDEO_SIZE = 100000;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const stats = await stat(filePath);
      if (stats.isFile() && stats.size > 0) {
        if (stats.size === lastSize && stats.size > MIN_VIDEO_SIZE) {
          stableCount++;
          if (stableCount >= 3) {
            return true;
          }
        } else {
          stableCount = 0;
        }
        lastSize = stats.size;
      }
    } catch {
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return lastSize > MIN_VIDEO_SIZE;
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
      // For videos, wait for the file to be fully written
      if (isVideo) {
        await waitForFileToBeReady(comfyLocalPath);
      }

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
  const type = searchParams.get('type'); // 'image' or 'video'

  const videoExts = ['.mp4', '.webm', '.mov'];
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];

  try {
    if (!filename) {
      let deletedFromLocal = 0;
      let deletedFromComfy = 0;

      if (existsSync(LOCAL_IMAGES_DIR)) {
        const localFiles = await readdir(LOCAL_IMAGES_DIR);
        const results = await Promise.all(
          localFiles.map(async file => {
            const ext = path.extname(file).toLowerCase();
            if (type === 'video' && !videoExts.includes(ext)) return false;
            if (type === 'image' && !imageExts.includes(ext)) return false;
            
            try {
              const fullPath = path.join(LOCAL_IMAGES_DIR, file);
              const stats = await lstat(fullPath);
              if (stats.isDirectory()) return false;
              await unlink(fullPath);
              return true;
            } catch {
              return false;
            }
          })
        );
        deletedFromLocal = results.filter(Boolean).length;
      }

      // Handle ComfyUI output directories
      if (type === 'video') {
        const videoOutputDir = path.join(COMFY_OUTPUT_DIR, 'video');
        if (existsSync(videoOutputDir)) {
          const comfyFiles = await readdir(videoOutputDir);
          const results = await Promise.all(
            comfyFiles.map(async file => {
              try {
                const fullPath = path.join(videoOutputDir, file);
                const stats = await lstat(fullPath);
                if (stats.isDirectory()) return false;
                await unlink(fullPath);
                return true;
              } catch {
                return false;
              }
            })
          );
          deletedFromComfy = results.filter(Boolean).length;
        }
      } else {
        // Image or generic library clear
        if (existsSync(COMFY_OUTPUT_DIR)) {
          const comfyFiles = await readdir(COMFY_OUTPUT_DIR);
          const results = await Promise.all(
            comfyFiles.map(async file => {
              const ext = path.extname(file).toLowerCase();
              if (type === 'image' && !imageExts.includes(ext)) return false;
              
              try {
                const fullPath = path.join(COMFY_OUTPUT_DIR, file);
                const stats = await lstat(fullPath);
                if (stats.isDirectory()) return false;
                await unlink(fullPath);
                return true;
              } catch {
                return false;
              }
            })
          );
          deletedFromComfy = results.filter(Boolean).length;
        }
      }

      return NextResponse.json({ 
        message: `Cleared ${type || 'library'}`,
        details: {
          local: deletedFromLocal,
          comfy: deletedFromComfy
        }
      });
    }

    const imageName = extractFilename(filename);
    const subfolderParam = searchParams.get('subfolder');
    const isVideo = /\.(mp4|webm|mov)$/i.test(filename);
    const subfolder = subfolderParam || (isVideo ? 'video' : '');
    const localPath = path.join(LOCAL_IMAGES_DIR, imageName);
    const comfyPath = subfolder
      ? path.join(COMFY_OUTPUT_DIR, subfolder, imageName)
      : path.join(COMFY_OUTPUT_DIR, imageName);

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

    if (isVideo) {
      const pngFilename = imageName.replace(/\.(mp4|webm|mov)$/i, '.png');
      const comfyPngPath = subfolder
        ? path.join(COMFY_OUTPUT_DIR, subfolder, pngFilename)
        : path.join(COMFY_OUTPUT_DIR, pngFilename);
      if (existsSync(comfyPngPath)) {
        await unlink(comfyPngPath);
        deletedFromComfy++;
      }
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