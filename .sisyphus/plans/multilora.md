# Multi-LoRA Stacking Implementation Plan

## Context

The API already accepts a `loras` array but only uses `loras[0]`. The SDK functions accept a single `Lora | null`. The UI has one dropdown + one strength slider. This feature finishes the plumbing to support N LoRAs chained in sequence.

## Architecture

ComfyUI LoRA chaining works by connecting `LoraLoader` nodes in series:
```
UNETLoader(16) → LoraLoader(100) → LoraLoader(101) → SageAttention(28) → ...
CLIPLoader(32) → LoraLoader(100) → LoraLoader(101) → CLIPTextEncode(6)
```

Each LoRA node takes model+clip from the previous node and outputs modified model+clip. For N LoRAs, we create N nodes with sequential IDs starting at 100.

## Files to Modify

### 1. `comfy-web/src/lib/comfy-sdk.ts`

**`generateWithSDK`** (Z Image Turbo, lines 34-215):
- Change signature: `lora: Lora | null` → `loras: Lora[]`
- Replace single LoRA node (lines 69-82) with a loop:
  ```ts
  let modelNodeId = "16";
  let clipNodeId = "32";
  const validLoras = loras.filter(l => l.name);
  for (let i = 0; i < validLoras.length; i++) {
    const nodeId = String(100 + i);
    nodes[nodeId] = {
      class_type: "LoraLoader",
      inputs: {
        model: [modelNodeId, 0],
        clip: [clipNodeId, 0],
        lora_name: validLoras[i].name,
        strength_model: validLoras[i].strength_model,
        strength_clip: validLoras[i].strength_clip,
      },
    };
    modelNodeId = nodeId;
    clipNodeId = nodeId;
  }
  ```
- Update CLIPTextEncode clip reference (line 111): `clip: [clipNodeId, lora ? 1 : 0]` → `clip: [clipNodeId, validLoras.length > 0 ? 1 : 0]`

**`generateWithKrea2TurboSDK`** (Krea2, lines 405-631):
- Change signature: `lora: Lora | null` → `loras: Lora[]`
- Replace single LoRA node (lines 447-456) with a loop using `LoraLoaderModelOnly`:
  ```ts
  const validLoras = loras.filter(l => l.name);
  for (let i = 0; i < validLoras.length; i++) {
    const nodeId = String(15 + i);
    nodes[nodeId] = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: [i === 0 ? "10" : String(14 + i), 0],
        lora_name: validLoras[i].name,
        strength_model: validLoras[i].strength_model,
      },
    };
  }
  ```
- Update model switch node (line 465-472): `on_true` should point to last LoRA node
- Update trigger word concatenation: concatenate ALL trigger words from all LoRAs
- Remove `_kreaRebalance` dead parameter

**`generateWithIdeogramSDK`**: No change (LoRA not supported for this engine).

### 2. `comfy-web/src/app/api/comfy/route.ts`

- Pass full `loras` array instead of extracting `loras[0]`:
  ```ts
  // Before:
  const lora = loras && loras.length > 0 ? loras[0] : null;
  result = await generateWithSDK(prompt, finalWidth, finalHeight, lora, ...);
  
  // After:
  const loraList = loras || [];
  result = await generateWithSDK(prompt, finalWidth, finalHeight, loraList, ...);
  ```

### 3. `comfy-web/src/components/ImageWorkspace.tsx`

**State change** (line 107-108):
```ts
// Before:
selectedLora: Lora;
setSelectedLora: (lora: Lora) => void;

// After:
selectedLoras: Lora[];
setSelectedLoras: (loras: Lora[]) => void;
```

**UI replacement** (lines 1056-1117):
Replace the single LoRA select + strength slider with a list:
- Each LoRA item: dropdown + strength slider + remove button (×)
- "Add LoRA" button at the bottom (hidden if no more LoRAs available or max 3)
- Empty state: just the "Add LoRA" button
- Trigger word display per LoRA (if set)

**Generate call** (line 335):
```ts
loras: imageWorkflow === 'ideogram4' ? [] : selectedLoras.filter(l => l.name),
```

### 4. `comfy-web/src/app/page.tsx`

- Change `selectedLora` state from `Lora` to `Lora[]` (line 43)
- Update the LoRA state initialization and persistence
- Pass `selectedLoras`/`setSelectedLoras` props to `ImageWorkspace`

### 5. `comfy-web/src/types.ts`

No changes needed — `Lora` type stays the same.

## Execution Order

1. Modify `comfy-sdk.ts` (SDK functions accept arrays)
2. Modify `api/comfy/route.ts` (pass full array)
3. Modify `page.tsx` (state type change)
4. Modify `ImageWorkspace.tsx` (UI replacement)
5. Build and verify

## Verification

1. `npm run build` — no type errors
2. Single LoRA still works (array of length 1)
3. Multiple LoRAs chain correctly in the ComfyUI graph
4. Ideogram4 engine still ignores LoRAs
5. No LoRA selected = no LoRA nodes in graph (same as before)
