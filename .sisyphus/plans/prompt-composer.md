# Prompt Composer (Random Prompt Builder) - Implementation Plan

## Overview
Replace the current prompt textbox in ImageWorkspace with a visual Prompt Composer that allows users to build, randomize, mutate, and enhance prompts before image generation.

**Tech stack note**: The codebase uses React 19 + Next.js 16 (NOT Vue as the spec mentions). All components will be `.tsx` files following existing patterns.

---

## Architecture

```
src/
├── types/
│   └── prompt-composer.ts          # All type definitions
├── prompt-composer/
│   ├── RandomPromptEngine.ts       # Core randomization/mutation engine
│   ├── PackLoader.ts               # Discovers & loads JSON packs from /public/packs/
│   ├── RelationshipEngine.ts       # Category dependency rules
│   └── PresetManager.ts            # Save/load full composer states
├── components/
│   ├── PromptComposer.tsx          # Main composer component (tabs, toolbar, cards grid)
│   ├── PromptCategoryCard.tsx      # Individual category card (random, lock, disable, select)
│   ├── PromptSearchDialog.tsx      # Searchable multi-select dialog
│   ├── ThemePackSelector.tsx       # Pack selection dropdown/dialog
│   ├── MutationDialog.tsx          # Mutation percentage slider dialog
│   └── PromptPreview.tsx           # Generated prompt text preview + copy
public/
├── packs/
│   └── default/
│       ├── meta.json               # Pack metadata (name, description, version)
│       ├── subject.json
│       ├── gender.json
│       ├── age.json
│       ├── hair.json
│       ├── eyes.json
│       ├── expression.json
│       ├── pose.json
│       ├── clothing.json
│       ├── accessories.json
│       ├── location.json
│       ├── environment.json
│       ├── weather.json
│       ├── season.json
│       ├── time.json
│       ├── lighting.json
│       ├── camera.json
│       ├── lens.json
│       ├── composition.json
│       ├── mood.json
│       ├── style.json
│       ├── quality.json
│       ├── details.json
│       └── rules.json              # Relationship rules
```

---

## File-by-File Plan

### 1. `src/types/prompt-composer.ts`
Type definitions for the entire feature:
- `PromptCategory` - category key enum/type
- `PromptValue` - single value with name, weight, tags
- `CategoryState` - current value, locked, enabled, multi-select support
- `PromptComposerState` - full state (all categories, locks, pack, mutation %)
- `ThemePack` - pack metadata + category data
- `RelationshipRule` - dependency rules (location->weather, time->lighting, etc.)
- `ComposerPreset` - saved preset (state + metadata)
- `CategoryConfig` - display config per category (label, icon, multi, order)

### 2. `src/prompt-composer/PackLoader.ts`
- `loadAllPacks()` - fetches `/packs/` directory, loads meta.json + all category JSONs
- `loadPack(packName)` - loads a single pack
- `getPackCategories(packName)` - returns available categories for a pack
- Merges pack data with default data (pack overrides default)
- Uses `fetch()` for offline-capable static file loading from `/public/packs/`

### 3. `src/prompt-composer/RelationshipEngine.ts`
- `loadRules(packName)` - loads rules.json from pack
- `getAllowedValues(category, currentValue, allRules)` - returns allowed values based on current state
- `getForbiddenValues(category, currentValue, allRules)` - returns forbidden values
- `validateState(state, rules)` - checks if current state is valid
- Rules are simple JSON: `{ "if": { "category": "value" }, "then": { "category": ["allowed"] }, "else": { "category": ["forbidden"] } }`

### 4. `src/prompt-composer/RandomPromptEngine.ts`
Pure functions, no UI dependency:
- `randomizeCategory(state, category, packData)` - random single category
- `randomizeAll(state, packData)` - random all unlocked categories
- `randomizeUnlocked(state, packData)` - random only unlocked (alias for randomizeAll)
- `mutate(state, percentage, packData)` - mutate N fields based on percentage
- `generatePrompt(state)` - converts structured state to prompt string
- `applyLocks(currentState, newState)` - preserves locked fields
- `getWeightedRandom(values)` - weighted random selection from value array

### 5. `src/prompt-composer/PresetManager.ts`
- `savePreset(name, state)` - saves to IndexedDB via `db.ts`
- `loadPreset(id)` - loads from IndexedDB
- `listPresets()` - returns all saved presets
- `deletePreset(id)` - removes preset
- `exportPreset(preset)` - JSON download
- `importPreset(json)` - JSON upload + save

### 6. Theme Pack JSONs (`public/packs/default/`)
Each category JSON is an array of `{ name, weight, tags }`.
- ~30-80 values per category for good variety
- Tags enable future filtering (fantasy, anime, realistic, etc.)

### 7. `PromptCategoryCard.tsx`
Card component per category:
- Displays category label + current value
- Buttons: Random (dice), Lock (lock icon), Disable (X)
- Click value opens `PromptSearchDialog`
- Visual states: locked (gold border), disabled (dimmed), active
- Props: `category`, `state`, `onRandomize`, `onLock`, `onDisable`, `onSelect`

### 8. `PromptSearchDialog.tsx`
Modal dialog:
- Search input at top with auto-focus
- Filtered list of values from current pack
- Multi-select support (checkboxes for categories that allow it)
- Selected values highlighted
- Confirm/Cancel buttons
- Props: `values`, `selected`, `multi`, `onConfirm`, `onClose`

### 9. `ThemePackSelector.tsx`
- Dropdown showing installed packs
- Shows pack name + description
- "Default" always available
- Triggers pack reload when changed

### 10. `MutationDialog.tsx`
- Slider: 10% / 25% / 50% / 100%
- Visual explanation of what each level does
- Confirm button triggers mutation

### 11. `PromptPreview.tsx`
- Shows the generated prompt text in a read-only textarea
- Copy button
- Character count
- Updates in real-time as categories change

### 12. `PromptComposer.tsx` (Main)
- Two tabs: "Composer" and "Inspiration"
- **Composer tab**: Grid of PromptCategoryCards + toolbar
- **Inspiration tab**: Mood buttons (Beautiful, Weird, Impossible, etc.) that generate concepts via AI, then convert to structured attributes
- Top toolbar: Random All, Random Unlocked, Mutate, Lock All, Unlock All, Enhance with AI, Copy, Generate
- Theme pack selector
- Mutation percentage setting
- Integration with existing LM Studio enhancement

### 13. Integration into `ImageWorkspace.tsx`
- Add a toggle/switch between "Free Prompt" and "Composer" modes
- When in Composer mode, replace the textarea with `<PromptComposer />`
- Composer outputs to the same `prompt` state variable
- "Enhance with AI" and "Generate Image" use existing workflow unchanged

---

## Key Design Decisions

1. **React, not Vue** - follows existing codebase
2. **Packs in `/public/packs/`** - served as static files, fetchable offline
3. **No global state** - composer state lives in PromptComposer, exposed via callback
4. **Engine is pure** - no React dependencies in engine files
5. **IndexedDB for presets** - consistent with existing persistence pattern
6. **Existing enhance/generate untouched** - composer feeds into existing prompt flow

---

## Integration Points

- `ImageWorkspace.tsx`: Add mode toggle, render PromptComposer conditionally
- `page.tsx`: No changes needed (prompt state already flows through)
- `enhancePrompt()`: Composer can call it with the generated prompt text
- `generateImage()`: Uses the same `prompt` state, no changes needed
