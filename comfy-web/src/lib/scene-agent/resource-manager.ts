const COMFY_FREE_URL = '/api/comfy/free';
const SYSTEM_FREE_URL = '/api/system/free';
const LMSTUDIO_UNLOAD_URL = '/api/lmstudio/unload';
const VRAM_STATS_URL = '/api/system/stats';

const MIN_CLEANUP_WAIT_MS = 1500;
const MEMORY_STABLE_POLL_MS = 1000;
const MAX_POLL_ATTEMPTS = 10;
const VRAM_FREE_THRESHOLD = 0.3;

export async function cleanupMemory(modelToUnload: string | null = null): Promise<void> {
  try {
    if (modelToUnload) {
      await fetch(LMSTUDIO_UNLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelToUnload }),
      });
    }
  } catch {
  }

  try {
    await fetch(COMFY_FREE_URL, { method: 'POST' });
  } catch {
  }

  try {
    await fetch(SYSTEM_FREE_URL, { method: 'POST' });
  } catch {
  }

  await new Promise(r => setTimeout(r, MIN_CLEANUP_WAIT_MS));
}

export async function waitForMemoryStable(): Promise<void> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    try {
      const res = await fetch(VRAM_STATS_URL);
      if (res.ok) {
        const data = await res.json();
        if (data.total && data.free) {
          const freeRatio = data.free / data.total;
          if (freeRatio >= VRAM_FREE_THRESHOLD) {
            return;
          }
        }
      }
    } catch {
    }
    await new Promise(r => setTimeout(r, MEMORY_STABLE_POLL_MS));
  }
}

export async function fullCleanup(modelToUnload: string | null = null): Promise<void> {
  await cleanupMemory(modelToUnload);
  await waitForMemoryStable();
}
