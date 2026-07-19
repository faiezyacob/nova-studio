import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const LOCAL_IMAGES_DIR = path.join(process.cwd(), 'public', 'generated');
const TEMP_EDIT_DIR = path.join(process.cwd(), 'temp_edit');

interface EditClip {
  filename: string;
  subfolder?: string;
  trim_start?: number;
  trim_end?: number;
}

interface EditRequestBody {
  clips: EditClip[];
  audio?: {
    data?: string;
    filename?: string;
    volume?: number;
  };
  remove_original_audio?: boolean;
}

async function ensureDirectory(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function resolveVideoPath(filename: string, subfolder?: string): string {
  const s = subfolder || '';
  const comfyDir = s
    ? path.join(process.cwd(), '..', 'ComfyUI', 'output', s)
    : path.join(process.cwd(), '..', 'ComfyUI', 'output');

  let videoPath = path.join(comfyDir, filename);
  if (existsSync(videoPath)) return videoPath;

  const publicPath = path.join(LOCAL_IMAGES_DIR, filename);
  if (existsSync(publicPath)) return publicPath;

  return videoPath;
}

async function cleanupTempFiles(filePaths: string[]) {
  for (const fp of filePaths) {
    try { await unlink(fp); } catch { /* ignore */ }
  }
}

async function fileHasAudioStream(filePath: string): Promise<boolean> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];
  const editId = randomUUID().slice(0, 8);

  try {
    await ensureDirectory(TEMP_EDIT_DIR);
    await ensureDirectory(LOCAL_IMAGES_DIR);

    const body: EditRequestBody = await request.json();
    const { clips, audio, remove_original_audio } = body;

    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json({ error: 'At least one clip is required' }, { status: 400 });
    }

    // Resolve and validate all video paths
    const resolvedClips: { path: string; trim_start?: number; trim_end?: number }[] = [];
    for (const clip of clips) {
      const resolved = resolveVideoPath(clip.filename, clip.subfolder);
      if (!existsSync(resolved)) {
        return NextResponse.json(
          { error: `Video not found: ${clip.filename}` },
          { status: 404 }
        );
      }
      resolvedClips.push({
        path: resolved,
        trim_start: clip.trim_start,
        trim_end: clip.trim_end,
      });
    }

    const hasTrim = resolvedClips.some(c => c.trim_start !== undefined || c.trim_end !== undefined);
    const hasAudio = audio?.data || audio?.filename;

    let segmentsToConcat: string[] = [];

    if (hasTrim) {
      // Re-encode each clip with trim for frame accuracy
      for (let i = 0; i < resolvedClips.length; i++) {
        const clip = resolvedClips[i];
        const ext = path.extname(clip.path) || '.mp4';
        const segmentPath = path.join(TEMP_EDIT_DIR, `segment_${editId}_${i}${ext}`);
        tempFiles.push(segmentPath);

        let filterParts: string[] = [];
        if (clip.trim_start !== undefined) filterParts.push(`-ss`, String(clip.trim_start));
        if (clip.trim_end !== undefined) filterParts.push(`-to`, String(clip.trim_end));
        if (remove_original_audio) filterParts.push(`-an`);

        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execPromise = promisify(exec);

        const ffmpegArgs = [
          `-i "${clip.path}"`,
          ...filterParts,
          `-c:v libx264 -preset fast -crf 23`,
          remove_original_audio ? '' : `-c:a aac`,
          `-movflags +faststart`,
          `"${segmentPath}"`,
        ].filter(Boolean).join(' ');

        await execPromise(`ffmpeg ${ffmpegArgs}`);
        segmentsToConcat.push(segmentPath);
      }
    } else {
      // No trim needed — use original files directly
      segmentsToConcat = resolvedClips.map(c => c.path);
    }

    // Concatenate all segments
    const combinedPath = path.join(TEMP_EDIT_DIR, `combined_${editId}.mp4`);
    tempFiles.push(combinedPath);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);

    if (segmentsToConcat.length === 1) {
      // Single clip with trim — just copy the processed segment
      const { copyFile } = await import('fs/promises');
      await copyFile(segmentsToConcat[0], combinedPath);
    } else {
      // Check if segments have audio
      const segmentsHaveAudio = (await Promise.all(segmentsToConcat.map(fileHasAudioStream))).some(Boolean);

      const inputs = segmentsToConcat.map(s => `-i "${s}"`).join(' ');

      if (segmentsHaveAudio) {
        const streamLabels = segmentsToConcat.map((_, i) => `[${i}:v][${i}:a]`).join('');
        const concatFilter = `-filter_complex "${streamLabels}concat=n=${segmentsToConcat.length}:v=1:a=1[v][a]"`;
        const cmd = `ffmpeg ${inputs} ${concatFilter} -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart "${combinedPath}"`;
        await execPromise(cmd);
      } else {
        const streamLabels = segmentsToConcat.map((_, i) => `[${i}:v]`).join('');
        const concatFilter = `-filter_complex "${streamLabels}concat=n=${segmentsToConcat.length}:v=1:a=0[v]"`;
        const cmd = `ffmpeg ${inputs} ${concatFilter} -map "[v]" -c:v libx264 -preset fast -crf 23 -movflags +faststart "${combinedPath}"`;
        await execPromise(cmd);
      }
    }

    // Audio overlay (if provided)
    let finalOutputPath = path.join(LOCAL_IMAGES_DIR, `edited_${Date.now()}.mp4`);
    let audioFilePath: string | null = null;

    if (hasAudio) {
      if (audio?.data) {
        // Write base64 audio to temp file
        const audioExt = audio.filename
          ? path.extname(audio.filename) || '.mp3'
          : '.mp3';
        audioFilePath = path.join(TEMP_EDIT_DIR, `audio_${editId}${audioExt}`);
        tempFiles.push(audioFilePath);

        const audioBuffer = Buffer.from(audio.data, 'base64');
        await writeFile(audioFilePath, audioBuffer);
      } else if (audio?.filename) {
        audioFilePath = audio.filename;
      }

      if (audioFilePath && existsSync(audioFilePath)) {
        const volume = audio?.volume ?? 0.5;

        if (remove_original_audio) {
          // Replace audio track entirely
          const cmd = `ffmpeg -i "${combinedPath}" -i "${audioFilePath}" -c:v copy -c:a aac -map 0:v -map 1:a -shortest -movflags +faststart "${finalOutputPath}"`;
          await execPromise(cmd);
        } else {
          // Check if input video has an audio stream
          const probeCmd = `ffmpeg -i "${combinedPath}" 2>&1`;
          const probeResult = await execPromise(probeCmd).catch((e: { stdout: string }) => e);
          const hasAudio = (typeof probeResult === 'string' ? probeResult : probeResult.stdout || '').includes('Audio:');

          if (hasAudio) {
            // Mix audio with original
            const cmd = `ffmpeg -i "${combinedPath}" -i "${audioFilePath}" -filter_complex "[1:a]volume=${volume}[a1];[0:a][a1]amix=inputs=2:duration=first" -c:v copy -c:a aac -movflags +faststart "${finalOutputPath}"`;
            await execPromise(cmd);
          } else {
            // No original audio — just add the new audio track
            const cmd = `ffmpeg -i "${combinedPath}" -i "${audioFilePath}" -c:v copy -c:a aac -map 0:v -map 1:a -shortest -movflags +faststart "${finalOutputPath}"`;
            await execPromise(cmd);
          }
        }
      } else {
        // Audio specified but file missing — fall through to no-audio path
        const { copyFile } = await import('fs/promises');
        await copyFile(combinedPath, finalOutputPath);
      }
    } else {
      // No audio overlay
      const { copyFile } = await import('fs/promises');
      await copyFile(combinedPath, finalOutputPath);
    }

    if (!existsSync(finalOutputPath)) {
      return NextResponse.json({ error: 'Failed to create edited video' }, { status: 500 });
    }

    // Copy to ComfyUI output for compatibility
    const comfyOutputVideoDir = path.join(process.cwd(), '..', 'ComfyUI', 'output', 'video');
    await ensureDirectory(comfyOutputVideoDir);
    const outputFilename = path.basename(finalOutputPath);
    const comfyDestPath = path.join(comfyOutputVideoDir, outputFilename);
    const { copyFile } = await import('fs/promises');
    await copyFile(finalOutputPath, comfyDestPath);

    // Cleanup temp files
    cleanupTempFiles(tempFiles);

    return NextResponse.json({
      video_path: outputFilename,
      subfolder: 'video',
      prompt_id: `edited_${Date.now()}`,
    });
  } catch (error) {
    cleanupTempFiles(tempFiles);
    console.error('[EDIT] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to edit video' },
      { status: 500 }
    );
  }
}
