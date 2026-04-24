import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Kernel {
          [DllImport("kernel32.dll")]
          public static extern bool SetProcessWorkingSetSize(IntPtr proc, int min, int max);
          [DllImport("psapi.dll")]
          public static extern bool EmptyWorkingSet(IntPtr proc);
        }
"@
      $procs = Get-Process python* -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*ComfyUI*" -or $_.CommandLine -like "*comfy*main*" }
      if (-not $procs) { $procs = Get-Process python* -ErrorAction SilentlyContinue }
      foreach ($p in $procs) {
        [Kernel]::EmptyWorkingSet($p.Handle) | Out-Null
        [Kernel]::SetProcessWorkingSetSize($p.Handle, -1, -1) | Out-Null
      }
      [System.GC]::Collect()
      [System.GC]::WaitForPendingFinalizers()
      [System.GC]::Collect()
      "done"
    `;
    await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
    return NextResponse.json({ success: true, message: 'System RAM cleanup triggered' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to clear system RAM' }, { status: 500 });
  }
}