import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process python | Where-Object { $_.Path -like '*ComfyUI*' } | Stop-Process -Force"`;
    
    try {
      const { stdout, stderr } = await execAsync(cmd);
      console.log("KILL STDOUT:", stdout);
      console.log("KILL STDERR:", stderr);
    } catch (killError) {
      // It might throw if no process matches
      console.log("Kill process info (or no processes found):", killError);
    }

    const rootPath = path.resolve(process.cwd(), '..');
    const batPath = path.join(rootPath, 'start_comfy.bat');
    
    console.log("Starting ComfyUI via:", batPath);
    
    const { spawn } = require('child_process');
    const child = spawn('cmd.exe', ['/c', batPath], {
      cwd: rootPath,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    return NextResponse.json({ success: true, message: 'Restarted ComfyUI' });
  } catch (error) {
    console.error('Failed to restart ComfyUI:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}
