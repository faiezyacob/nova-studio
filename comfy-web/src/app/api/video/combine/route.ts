import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
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
    const { videos } = body;

    if (!videos || !Array.isArray(videos) || videos.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 videos are required' },
        { status: 400 }
      );
    }

    const outputFilename = `combined_${Date.now()}.mp4`;
    const outputPath = path.join(LOCAL_IMAGES_DIR, outputFilename);

    const videoPaths = videos.map((v: { filename: string; subfolder?: string }) => {
      const subfolder = v.subfolder || 'video';
      const comfyOutputDir = path.join(process.cwd(), '..', 'ComfyUI', 'output', subfolder);
      return path.join(comfyOutputDir, v.filename);
    });

    const validPaths = [];
    for (const vp of videoPaths) {
      if (existsSync(vp)) {
        validPaths.push(vp);
      }
    }

    if (validPaths.length !== videos.length) {
      return NextResponse.json(
        { error: 'Some videos not found on server' },
        { status: 404 }
      );
    }

    const tempListFile = path.join(process.cwd(), 'temp_concat list.txt');
    let listContent = '';
    for (const vp of validPaths) {
      listContent += `file '${vp}'\n`;
    }

    const { writeFile: wf } = await import('fs/promises');
    await wf(tempListFile, listContent);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);

    const ffmpegPath = 'ffmpeg';
    const command = `${ffmpegPath} -f concat -safe 0 -i "${tempListFile}" -c copy "${outputPath}"`;

    console.log('[COMBINE] Running:', command);
    
    try {
      await execPromise(command);
    } catch (execErr) {
      console.error('[COMBINE] FFmpeg error:', execErr);
      return NextResponse.json(
        { error: 'FFmpeg failed to combine videos. Make sure FFmpeg is installed.' },
        { status: 500 }
      );
    }

    try {
      const { unlink } = await import('fs/promises');
      await unlink(tempListFile);
    } catch {}

    if (!existsSync(outputPath)) {
      return NextResponse.json(
        { error: 'Failed to create combined video' },
        { status: 500 }
      );
    }

    const { copyFile, mkdir: mkDir } = await import('fs/promises');
    const comfyOutputVideoDir = path.join(process.cwd(), '..', 'ComfyUI', 'output', 'video');
    if (!existsSync(comfyOutputVideoDir)) {
      await mkDir(comfyOutputVideoDir, { recursive: true });
    }
    const comfyDestPath = path.join(comfyOutputVideoDir, outputFilename);
    await copyFile(outputPath, comfyDestPath);

    return NextResponse.json({
      video_path: outputFilename,
      subfolder: 'video',
      prompt_id: `combined_${Date.now()}`
    });
  } catch (error) {
    console.error('[COMBINE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to combine videos' },
      { status: 500 }
    );
  }
}