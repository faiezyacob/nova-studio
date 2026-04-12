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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  const subfolder = searchParams.get('subfolder') || '';

  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  }

  const imageName = extractFilename(filename);
  const subfolderParts = subfolder ? subfolder.split('/').map(s => extractFilename(s)) : [];
  const subfolderPath = subfolderParts.join(path.sep);
  const localPath = path.join(LOCAL_IMAGES_DIR, subfolderPath, imageName);

  try {
    if (existsSync(localPath)) {
      const imageBuffer = await readFile(localPath);
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
        },
      });
    }

    const comfyFilename = subfolder ? `${subfolder}/${filename}` : filename;
    const imageUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(comfyFilename)}`;
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const imageBuffer = await response.arrayBuffer();

    await ensureDirectory(path.dirname(localPath));
    await writeFile(localPath, Buffer.from(imageBuffer));

    console.log('[IMAGES] Cached image to:', localPath);

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    // If fetching failed, try to serve from cache
    if (existsSync(localPath)) {
      const imageBuffer = await readFile(localPath);
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }
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