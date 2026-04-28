# Feature Plan — Phase 2.0: Patch Mode Production Ready

## Context

Core patch infrastructure (Phases 0–7) is complete. `patchMode: 'immer'` works
end-to-end. Five gaps block shipping v2.0.0:

1. `materializeHistory` stub returns empty arrays for `PatchHistory`
2. `diff` mode applies RFC 6902 patches via wrong applier (immer instead of fast-json-patch)
3. `vite.config.ts` entry still points at deleted `index.js`
4. Legacy `.js` source files clutter `src/` alongside `.ts` files
5. Missing tests for patch-helpers, filter, limit

## Goal

Ship `redux-undo-slim@2.0.0` — fully working `immer` and `diff` patch modes,
clean TypeScript build, full test coverage on new paths, `CHANGELOG.md`.

---

## Task Groups

### Group 1 — Fix Build (unblocks everything else)

**Files:** `vite.config.ts`

- Change `entry` from `'./src/index.js'` to `'./src/index.ts'`
- Change lib `name` from `'ReduxUndo'` to `'ReduxUndoSlim'`
- Verify `npm run build` produces both output files without errors

### Group 2 — Delete Legacy `.js` Source Files

**Files:** `src/actions.js`, `src/debug.js`, `src/helpers.js`, `src/index.js`,
`src/patch-helpers.js`, `src/reducer.js`

- Delete all six files
- Run `npm test` — must still pass (tests import from `../src/index`, which now resolves to `.ts`)

### Group 3 — Fix `diff` Mode Patch Applier

**Files:** `src/types.ts`, `src/patch-helpers.ts`, `src/patch-reducer.ts`

**Step 3a — Add `src` field to `OpEntry`:**

```typescript
// src/types.ts
export interface OpEntry {
  p:   Patch[]
  ip:  Patch[]
  g?:  string | number
  src: 'immer' | 'diff'   // add this
}
```

**Step 3b — Set `src` in `insertOp`:**

```typescript
// src/patch-helpers.ts — insertOp signature
export function insertOp<T>(
  history: PatchHistory<T>,
  patches: Patch[],
  inversePatches: Patch[],
  group: string | number | null | undefined,
  limit: number | undefined,
  src: 'immer' | 'diff' = 'immer'   // add parameter
): PatchHistory<T>
```

Pass `src` into `newEntry`:
```typescript
const newEntry: OpEntry = {
  p: patches,
  ip: inversePatches,
  src,
  ...(group != null && { g: group })
}
```

**Step 3c — Branch applier in `applyUndo` / `applyRedo`:**

```typescript
// src/patch-helpers.ts
import { applyPatches } from 'immer'

function applyPatchEntry<T>(present: T, patches: Patch[], src: 'immer' | 'diff'): T {
  if (src === 'diff') {
    // fast-json-patch apply — deep clone first to avoid mutation
    let state = JSON.parse(JSON.stringify(present))
    for (const op of patches) {
      fastJsonPatch.applyOperation(state, op as fastJsonPatch.Operation, true, true)
    }
    return state as T
  }
  return applyPatches(present, patches) as T
}
```

Use `applyPatchEntry` in both `applyUndo` and `applyRedo`.

**Step 3d — Pass `src` from `patch-reducer.ts` to `insertOp`:**

```typescript
// diff path:
const updatedHistory = insertOp(history, patches, inversePatches, group, config.limit, 'diff')

// immer path:
const updatedHistory = insertOp(history, patches, inversePatches, group, config.limit, 'immer')
```

**Step 3e — Import `fast-json-patch` in `patch-helpers.ts`:**

```typescript
let fastJsonPatch: typeof import('fast-json-patch') | null = null
try { fastJsonPatch = require('fast-json-patch') } catch { fastJsonPatch = null }
```

### Group 4 — Fix `materializeHistory`

**File:** `src/helpers.ts`

Update signature:
```typescript
export function materializeHistory<T>(
  history: HistoryState<T>,
  initialState?: T
): { past: T[]; present: T; future: T[] }
```

Implementation for `PatchHistory` path:

```typescript
if (isPatchHistory(history)) {
  if (initialState === undefined) {
    throw new Error(
      'redux-undo-slim: materializeHistory requires initialState when called with PatchHistory'
    )
  }
  // Build past[] by replaying ops[0..cursor-1] forward from initialState
  const past: T[] = []
  let state = initialState
  for (let i = 0; i < history.cursor; i++) {
    past.push(state)
    state = applyPatchEntry(state, history.stack[i].p, history.stack[i].src)
  }
  // Build future[] by replaying ops[cursor..end] forward from present
  const future: T[] = []
  state = history.present
  for (let i = history.cursor; i < history.stack.length; i++) {
    state = applyPatchEntry(state, history.stack[i].p, history.stack[i].src)
    future.push(state)
  }
  return { past, present: history.present, future }
}
```

Note: `applyPatchEntry` moved to a shared internal module (`src/apply-patch.ts`) so
both `patch-helpers.ts` and `helpers.ts` can import it without circular deps.

### Group 5 — Write Missing Tests

Three new test files. Run `npm test` after each file added.

**`test/patch-helpers.spec.js`** — unit tests for `insertOp`, `applyUndo`, `applyRedo`,
`jumpOp`, `jumpToPastOp`, `jumpToFutureOp` using hand-crafted immer patch fixtures.

Key fixtures to use:
```js
// Counter state: 0 → 1
const patchIncrement = [{ op: 'replace', path: '', value: 1 }]
const patchDecrement = [{ op: 'replace', path: '', value: 0 }]
```

**`test/patch-filter.spec.js`** — integration tests using `undoable(counterReducer, { patchMode: 'immer', filter: excludeAction(['TICK']) })`:
- Dispatch `INCREMENT`, `TICK`, `INCREMENT` — stack must have 2 entries
- `present` reflects all three actions
- Undo twice returns to 0

**`test/patch-limit.spec.js`** — integration tests using `undoable(counterReducer, { patchMode: 'immer', limit: 3 })`:
- 5 dispatches → `stack.length === 3`, `cursor === 3`
- Undo 3 times still works correctly after trim

### Group 6 — `CHANGELOG.md`

Create `CHANGELOG.md` at repo root. Cover:
- v2.0.0 breaking changes (state shape, `past`/`future` access pattern)
- v2.0.0 new features (patchMode, new helpers)
- v2.0.0 migration table
- v1.0.1 baseline (what was inherited from `redux-undo`)

### Group 7 — Update `typings.d.ts`

- Add `PatchHistory<T>` type
- Add `OpEntry` type
- Add `materializeHistory` overloads with `initialState` param
- Add `canUndo`, `canRedo`, `pastLength`, `futureLength` signatures
- Add `patchMode` to `Options` / config type

### Group 8 — Update Roadmap

Mark Phases 8, 9, 10, 12 items complete in `specs/constitution/roadmap.md`.

---

## Sequence

```
Group 1 (build fix)
  → Group 2 (delete .js files)
  → Group 3 + Group 4 (parallel — independent files)
    → Group 5 (tests — depends on 3 + 4 being correct)
      → Group 6 + Group 7 (parallel)
        → Group 8 (roadmap update)
```

---

## Out of Scope

- CI/CD pipeline
- npm publish automation
- React hooks wrapper
- Example app updates
