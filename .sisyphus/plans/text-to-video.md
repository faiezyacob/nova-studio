# Text-to-Video (T2V) Workflow Implementation Plan

## Context

Nova Studio currently only supports Image-to-Video (I2V) generation. The UI header says "Image to video", the generate button is disabled without an uploaded image, and both WAN/LTX API routes require a `File` image parameter. This feature adds a Text-to-Video mode so users can generate videos from a text prompt alone, without providing a reference image.

## Architecture

The existing I2V flow is:
1. `VideoWorkspace.tsx` → builds FormData with `image` file → POST to `/api/comfy/wan` or `/api/comfy/ltx`
2. API routes upload the image to ComfyUI, build a ComfyUI workflow graph with image-processing nodes, execute it
3. The key I2V-specific node is `WanImageToVideo` (WAN) / `LTXVImgToVideoInplace` (LTX) which takes a loaded+resized image as the starting latent

For T2V, the only ComfyUI graph change is replacing the image pipeline with an empty latent:
- **WAN**: Replace `LoadImage` (node 40) + `ImageResizeKJv2` (node 41) + `WanImageToVideo` (node 50) with a single `EmptyWanLatentVideo` node that feeds directly into the samplers
- **LTX**: Replace `LoadImage` (node 20) + `ResizeImagesByLongerEdge` (node 21) + `LTXVPreprocess` (node 22) + `LTXVImgToVideoInplace` (node 54/59) with `EmptyLTXVLatentVideo` directly

## Files to Modify

### 1. NEW: `comfy-web/src/app/api/comfy/wan-t2v/route.ts`
WAN 2.2 T2V API route. Copied from `wan/route.ts` with these changes:
- Remove image upload logic (nodes 40, 41)
- Replace `WanImageToVideo` (node 50) with `EmptyWanLatentVideo`:
  ```ts
  nodes["50"] = {
    class_type: "EmptyWanLatentVideo",
    inputs: {
      width: videoWidth,
      height: videoHeight,
      length: videoFrames,
      batch_size: 1,
    },
  };
  ```
- The sampler nodes (60, 61) change their `latent_image` input from `["50", 2]` to `["50", 0]` (EmptyWanLatentVideo output is at index 0, not 2)
- Remove `image` from the interface/options — only `prompt`, `negative_prompt`, `width`, `height`, `frames`, `generationId`
- POST handler: remove `imageFile` requirement, accept plain JSON body instead of FormData

### 2. NEW: `comfy-web/src/app/api/comfy/ltx-t2v/route.ts`
LTX 2.3 T2V API route. Copied from `ltx/route.ts` with these changes:
- Remove image upload logic (nodes 20, 21, 22)
- Replace `LTXVImgToVideoInplace` (node 54) — instead of encoding the image into the latent, just use `EmptyLTXVLatentVideo` (node 32) directly as the latent for sampling
- Node 54 (`LTXVImgToVideoInplace`) is removed; node 55 (`LTXVConcatAVLatent`) takes `["32", 0]` (empty video latent) instead of `["54", 0]`
- Node 59 (`LTXVImgToVideoInplace`) is also removed; node 60 takes `["58", 0]` directly (already does)
- Remove `image` from options
- POST handler: accept JSON body, no image file required

### 3. MODIFY: `comfy-web/src/components/VideoWorkspace.tsx`
**Changes:**

a) **Add T2V workflow options** to `WORKFLOW_OPTIONS` (line 108-111):
```ts
const WORKFLOW_OPTIONS = [
  { value: 'wan-2.2-t2v', label: 'Wan 2.2 T2V' },
  { value: 'ltx-2.3-t2v', label: 'LTX 2.3 T2V (12GB)' },
  { value: 'wan-2.2-i2v', label: 'Wan 2.2 I2V' },
  { value: 'ltx-2.3-i2v', label: 'LTX 2.3 I2V (12GB)' },
];
```

b) **Add `isT2V` helper**:
```ts
const isT2V = activeWorkflow.includes('t2v');
```

c) **Make image upload optional for T2V** — the upload section (lines 803-843) should show a different state when T2V is selected (e.g., "Text-to-Video mode — no image required" or make upload optional). When T2V is selected, image upload becomes optional (not required).

d) **Update generate button disabled condition** (line 1035):
```ts
disabled={isGenerating || isEnhancing || (!isT2V && !uploadedImage) || !prompt.trim()}
```

e) **Add `WORKFLOW_FPS` entries** for T2V (line 113-116):
```ts
const WORKFLOW_FPS: Record<string, number> = {
  'wan-2.2-i2v': 16,
  'ltx-2.3-i2v': 24,
  'wan-2.2-t2v': 16,
  'ltx-2.3-t2v': 24,
};
```

f) **Update `generateVideo` function** (lines 448-626):
- Early return: change `if (!uploadedImage || !prompt.trim()) return;` to `if ((!isT2V && !uploadedImage) || !prompt.trim()) return;`
- Add T2V branches alongside existing I2V branches:
  ```ts
  if (isT2V && (activeWorkflow === 'wan-2.2-t2v')) {
    // POST JSON to /api/comfy/wan-t2v
    const response = await fetch('/api/comfy/wan-t2v', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Generation-Id': generationId },
      body: JSON.stringify({ prompt, negative_prompt, width: finalWidth, height: finalHeight, frames: durationFrames }),
    });
    // ... handle result
  } else if (isT2V && (activeWorkflow === 'ltx-2.3-t2v')) {
    // POST JSON to /api/comfy/ltx-t2v
    // ... similar
  } else if (isLtxWorkflow) {
    // existing I2V LTX path
  } else {
    // existing I2V WAN path
  }
  ```
- For T2V thumbnail: use a generated placeholder or skip thumbnail (no uploaded image)

g) **Update header text** (line 764):
```tsx
<p className="text-xs text-text-muted">{isT2V ? 'Text to video' : 'Image to video'}</p>
```

h) **Update duration frames max** (line 147) to handle T2V workflows:
```ts
const maxFrames = activeWorkflow === 'ltx-2.3-i2v' || activeWorkflow === 'ltx-2.3-t2v' ? 241 : 129;
```

i) **Update prompt enhancement** — the `enhancePrompt` function (lines 235-446) currently requires `uploadedImage`. For T2V, either skip image context or use a text-only enhancement prompt. The simplest approach: if T2V and no image, use the existing LM Studio call but without the image attachment.

### 4. MODIFY: `comfy-web/src/app/page.tsx`
No structural changes needed. The `videoWorkspaceState.activeWorkflow` can already hold T2V values since it's just a string. The only change is the initial default — we keep `"wan-2.2-i2v"` as default.

## Execution Order

1. Create `wan-t2v/route.ts` (backend first)
2. Create `ltx-t2v/route.ts` (backend first)
3. Modify `VideoWorkspace.tsx` (frontend integration)
4. Test with `npm run build` to verify no type errors

## Verification

1. `npm run build` — should compile without errors
2. Manual testing: switch to T2V workflow → image upload should be optional → generate button should work without image → video should generate via empty latent path
3. Verify I2V still works (regression check)
