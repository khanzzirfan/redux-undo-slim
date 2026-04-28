# Requirements — Phase 2.0: Patch Mode Production Ready

## Context

`redux-undo-slim` v2.0.0 replaces full-snapshot history with immer patch pairs.
Phases 0–7 are implemented — the core `patchMode: 'immer'` path works end-to-end.

The remaining gaps block production use:
- `materializeHistory` returns empty arrays for `PatchHistory` (stub)
- `diff` mode stores RFC 6902 patches but applies them via immer's `applyPatches` (incompatible)
- Legacy `.js` source files still exist alongside the new `.ts` files
- `vite.config.ts` still points at `index.js`, breaking the build in TS mode
- No missing unit tests for undo/redo, jump, filter, or limit logic
- No CHANGELOG

This feature makes `patchMode: 'immer'` and `patchMode: 'diff'` production-ready and
ships `redux-undo-slim@2.0.0` to npm.

---

## Functional Requirements

### FR-1: `materializeHistory` reconstructs full state timeline

`materializeHistory(history, initialState)` MUST:
- Accept `PatchHistory<T>` + `initialState: T` as arguments
- Replay `stack[0..cursor-1]` forward from `initialState` to produce `past: T[]`
- Replay `stack[cursor..stack.length-1]` forward from `present` to produce `future: T[]`
- Return `{ past: T[], present: T, future: T[] }`

```typescript
import { materializeHistory } from 'redux-undo-slim'

const { past, present, future } = materializeHistory(patchHistory, initialState)
// past[0]  = state after 0 ops (= initialState)
// past[N-1] = state just before current present
// future[0] = state one redo step ahead
```

Signature change:

```typescript
// Before (stub — ignores PatchHistory):
materializeHistory<T>(history: HistoryState<T>): { past: T[]; present: T; future: T[] }

// After:
materializeHistory<T>(history: HistoryState<T>, initialState?: T): { past: T[]; present: T; future: T[] }
```

`initialState` optional — if omitted and history is `PatchHistory`, throw a descriptive
error rather than silently returning empty arrays.

### FR-2: `diff` mode uses correct patch applier

When `patchMode: 'diff'`:
- Patches produced by `fastJsonPatch.compare()` MUST be applied via
  `fastJsonPatch.applyOperation` (not immer's `applyPatches`) during undo/redo
- `OpEntry` MUST carry a `src` field (`'immer' | 'diff'`) so `applyUndo`/`applyRedo`
  dispatch to the correct applier

```typescript
interface OpEntry {
  p:   Patch[]
  ip:  Patch[]
  g?:  string | number
  src: 'immer' | 'diff'        // NEW — required
}
```

`applyUndo` and `applyRedo` branch on `entry.src`:
- `'immer'` → `applyPatches(present, entry.ip)`
- `'diff'`  → apply via `fast-json-patch` sequentially

### FR-3: Build compiles cleanly from TypeScript source

`vite.config.ts` MUST:
- Set `entry` to `./src/index.ts` (not `index.js`)
- Set lib `name` to `'ReduxUndoSlim'`
- `npm run build` produces `dist/redux-undo-slim.mjs` and `dist/redux-undo-slim.umd.js`
  without errors

### FR-4: Legacy `.js` source files removed

All files in `src/` with a `.js` extension (superseded by `.ts`) MUST be deleted:
- `src/actions.js`
- `src/debug.js`
- `src/helpers.js`
- `src/index.js`
- `src/patch-helpers.js`
- `src/reducer.js`

### FR-5: Missing unit tests written

The following tests MUST exist and pass:

**`test/patch-helpers.spec.js`**
- `insertOp` clears redo entries when `cursor < stack.length`
- `insertOp` respects `limit` — stack trimmed, cursor capped
- `applyUndo` on cursor=0 returns same history reference
- `applyRedo` on cursor=stack.length returns same history reference
- `applyUndo` then `applyRedo` round-trips to identical `present`
- `jump(0)` returns same history reference
- `jump(-1)` produces same `present` as `applyUndo`
- `jump(+1)` produces same `present` as `applyRedo`
- Multi-step `jump(-3)` matches 3 sequential `applyUndo` calls
- `jumpToPast(0)` reaches `initialState`
- `jumpToFuture(0)` reaches first redo step

**`test/patch-filter.spec.js`**
- Excluded action does not appear in `stack`
- Excluded action still updates `present`
- Undo after excluded action returns to pre-filter `present`
- `syncFilter: true` — undo anchor advances through filtered state

**`test/patch-limit.spec.js`**
- Undo works correctly after stack trim
- `cursor` equals `limit` after overflow

### FR-6: `CHANGELOG.md` documents v2.0.0

`CHANGELOG.md` MUST exist at repo root and cover:
- Breaking changes from `redux-undo@1.x`
- New `patchMode` option
- New state shape (`PatchHistory`)
- New helpers (`canUndo`, `canRedo`, `pastLength`, `futureLength`, `materializeHistory`)
- Migration table

---

## Non-Functional Requirements

### NFR-1: No snapshot regression

`patchMode: 'snapshot'` (default) behaviour MUST be byte-for-byte identical to
`redux-undo@1.0.1`. All existing `test/index.spec.js` and `test/combineFilters.spec.js`
tests MUST pass.

### NFR-2: Bundle size

ESM output (`dist/redux-undo-slim.mjs`) minified + gzip MUST stay under 5 KB.
Immer is a peer dep — it MUST NOT be bundled.

### NFR-3: TypeScript strict

`src/` compiles with `strict: true`. No `any` on public-facing types. No unused imports.

### NFR-4: Test coverage

`npm run test:cov` MUST report ≥ 85% line coverage across `src/`.

---

## Out of Scope

- React-specific bindings or hooks
- Redux Toolkit integration
- Persistence / serialisation of `PatchHistory` to localStorage
- Browser DevTools extension
- CI/CD pipeline (tracked separately in roadmap Phase 12)
- Removing example apps (throttled-drag, todos-with-undo)
