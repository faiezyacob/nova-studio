import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const LOCAL_IMAGES_DIR = path.join(process.cwd(), 'public', 'generated');

async function ensureDirectory(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoPath } = body;

    if (!videoPath || typeof videoPath !== 'string') {
      return NextResponse.json(
        { error: 'videoPath is required' },
        { status: 400 },
      );
    }

    await ensureDirectory(LOCAL_IMAGES_DIR);

    let resolvedPath: string | null = null;

    const candidates = [
      path.join(LOCAL_IMAGES_DIR, videoPath),
      path.join(process.cwd(), '..', 'ComfyUI', 'output', videoPath),
      path.join(process.cwd(), '..', 'ComfyUI', 'output', 'video', videoPath),
    ];

    for (const p of candidates) {
      if (existsSync(p)) {
        resolvedPath = p;
        break;
      }
    }

    if (!resolvedPath) {
      return NextResponse.json(
        { error: 'Video file not found', checkedPaths: candidates },
        { status: 404 },
      );
    }

    const frameFilename = videoPath.replace(/\.[^/.]+$/, '_frame.png');
    const outputPath = path.join(LOCAL_IMAGES_DIR, frameFilename);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);

    // const command = `ffmpeg -i "${resolvedPath}" -vf "select='eq(n,last)'" -vsync vfr -frames:v 1 "${outputPath}"`;
    const command = `ffmpeg -sseof -0.1 -i "${resolvedPath}" -update 1 -q:v 1 "${outputPath}"`;

    const { stdout, stderr } = await execPromise(command);
    console.log('[EXTRACT-FRAME] stdout:', stdout);
    console.log('[EXTRACT-FRAME] stderr:', stderr);

    if (!existsSync(outputPath)) {
      return NextResponse.json(
        { error: 'Failed to extract frame from video' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      frame_path: frameFilename,
    });
  } catch (error) {
    console.error('[EXTRACT-FRAME] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract frame' },
      { status: 500 },
    );
  }
}
