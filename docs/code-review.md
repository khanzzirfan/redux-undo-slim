# Code Review — redux-undo-slim

> Reviewed against: [architecture-immer-patches.md](./architecture-immer-patches.md) and [implementation-phases.md](./implementation-phases.md)
> Date: 2026-04-16

---

## Implementation Status

Phases 0–4 are largely built. The PRD `passes` flags in `tasks/prd.json` are stale —
more has been implemented than they reflect. Actual file-level status:

| File | Status |
|---|---|
| [src/types.ts](../src/types.ts) | Complete |
| [src/actions.ts](../src/actions.ts) | Complete |
| [src/debug.ts](../src/debug.ts) | Complete |
| [src/helpers.ts](../src/helpers.ts) | Complete — all helpers present |
| [src/patch-helpers.ts](../src/patch-helpers.ts) | Complete — undo, redo, insert, all jump ops |
| [src/patch-reducer.ts](../src/patch-reducer.ts) | Partial — grouping + limit present, filter + initTypes missing |
| [src/reducer.ts](../src/reducer.ts) | Has a critical wiring bug |
| [src/index.ts](../src/index.ts) | Complete |

### Phase completion map

| Phase | Description | Verdict |
|---|---|---|
| 0 | Tooling, types, stubs | Done |
| 1 | PatchHistory shape + helpers | Done |
| 2 | Undo / redo with patches | Done in isolation; broken end-to-end via BUG-001 |
| 3 | Jump operations | Done in isolation; broken end-to-end via BUG-001 |
| 4 | Wire patch mode into reducer | Blocked by BUG-001 |
| 5 | Filtering in patch mode | Not implemented — BUG-002 |
| 6 | Grouping with patch merging | Implemented |
| 7 | Limit + offset trimming | Implemented in `insertOp` |
| 8 | Diff mode | Partial — applier compatibility unverified — ISSUE-004 |
| 9 | Public API + TypeScript types | Mostly done — `materializeHistory` is a stub — ISSUE-002 |
| 10 | Migration compat + deprecations | Not started |
| 11 | Benchmarks | Not started |
| 12 | Docs update | Not started |

---

## Critical Bugs

### BUG-001 — `patchModeReducer` reconstructed on every dispatch

**File:** [src/reducer.ts](../src/reducer.ts) lines 101–108
**Severity:** Critical — breaks all immer/diff mode functionality

**Problem:**

```ts
// Inside the returned reducer — runs on every dispatch:
return ((state, action, ...slices) => {
  const patchResult = patchModeReducer(reducer, rawConfig, patchModeValue) // new instance every call
  return patchResult(state as never, action, ...slices) as unknown as History<S>
})
```

`patchModeReducer(...)` creates a new closure with a fresh `initialState = undefined`
on every single action dispatch. The `initialState` variable inside `patchModeReducer`
is a closed-over value that must persist across calls to track whether the reducer has
been initialised. Reconstructing the closure on every call resets it to `undefined`
each time, so history re-initialises on every action instead of accumulating.

**Fix:** Call `patchModeReducer(...)` once at `undoable()` construction time, store
the result, and call the stored instance from within the returned function:

```ts
// At construction time — runs once:
const patchReducer = patchModeReducer(reducer, rawConfig, patchModeValue)

// Inside the returned reducer — runs on every dispatch:
return (state, action, ...slices) => {
  return patchReducer(state as never, action, ...slices) as unknown as History<S>
}
```

---

### BUG-002 — `filter` option not implemented in `patchModeReducer`

**File:** [src/patch-reducer.ts](../src/patch-reducer.ts) — default branch, lines 157–225
**Severity:** Critical — `filter`, `includeAction`, `excludeAction` are silently no-ops in patch mode

**Problem:**

The default branch in `patchModeReducer` has no filter check. Every action goes
directly to `insertOp` regardless of `config.filter`. Compare with the snapshot path
in [src/reducer.ts](../src/reducer.ts) lines 230–248 which correctly gates `insert`
behind the filter result.

The existing test at `test/patch-mode.spec.js:160–170` appears to pass because it
uses `includeAction(['INCREMENT'])` and only dispatches `INCREMENT`. It does not
verify that a filtered-out action is absent from the stack.

**Fix:** Add the filter check before `insertOp` in the default branch, mirroring the
snapshot reducer. Also handle `syncFilter` to update `_latestUnfiltered` when
`config.syncFilter` is `true`:

```ts
const filtered = typeof config.filter === 'function' && !config.filter(action, newState, history)

if (filtered) {
  const filteredState = { ...history, present: newState }
  if (!config.syncFilter) {
    filteredState._latestUnfiltered = history._latestUnfiltered
  }
  return filteredState
}
```

---

### BUG-003 — `initTypes` reset missing from `patchModeReducer`

**File:** [src/patch-reducer.ts](../src/patch-reducer.ts) — default branch
**Severity:** High — init actions are recorded as op entries instead of resetting history

**Problem:**

[src/reducer.ts](../src/reducer.ts) lines 219–224 checks `config.initTypes` after
running the reducer and returns `initialState` on a match. The patch reducer default
branch has no equivalent check. An `@@redux-undo/INIT` action in patch mode inserts
a patch entry into the stack instead of wiping history back to `initialState`.

**Fix:** Add the `initTypes` check immediately after computing `newState` and before
any grouping or `insertOp` call, mirroring the snapshot reducer:

```ts
const initTypes = config.initTypes ?? []
if (initTypes.includes(action.type)) {
  debug.log('reset history due to init action')
  return initialState
}
```

---

## Significant Issues

### ISSUE-001 — `enablePatches()` called twice

**Files:** [src/index.ts](../src/index.ts) line 3, [src/patch-reducer.ts](../src/patch-reducer.ts) line 18
**Severity:** Low — harmless but signals an unclear module boundary

**Problem:** Both files independently call `enablePatches()`. Calling it twice is
safe but redundant and the duplication obscures where module initialisation lives.

**Fix:** Remove `enablePatches()` from `patch-reducer.ts`. The single call in
`index.ts` is the correct location as the package entry point.

---

### ISSUE-002 — `materializeHistory` returns empty arrays for `PatchHistory`

**File:** [src/helpers.ts](../src/helpers.ts) lines 91–96
**Severity:** High — function silently returns wrong data for patch mode consumers

**Problem:**

```ts
export function materializeHistory<T>(history: HistoryState<T>) {
  if (!isHistory(history)) {
    // PatchHistory always falls here — returns empty past and future
    return { past: [], present: history.present, future: [] }
  }
  return { past: history.past, present: history.present, future: history.future }
}
```

For `PatchHistory`, this always returns `past: []` and `future: []`. The architecture
doc requires it to reconstruct full state snapshots by replaying patches forward from
an `initialState` argument. As written it is a non-functional stub that will silently
give wrong data to any consumer using it for history timeline display.

**Fix:** Accept an `initialState` parameter and replay ops forward from it to
reconstruct the past array, then replay from cursor to end for the future array.

---

### ISSUE-003 — `g: undefined` written on every ungrouped `OpEntry`

**File:** [src/patch-helpers.ts](../src/patch-helpers.ts) lines 44–48
**Severity:** Low — unnecessary property on every op, pollutes serialised state

**Problem:**

```ts
const newEntry: OpEntry = {
  p: patches,
  ip: inversePatches,
  g: group   // always set, even when group is null/undefined
}
```

`g` is typed as optional (`g?: string | number`) in `OpEntry`. Writing `g: undefined`
adds an explicit undefined key to every ungrouped entry, which bloats serialised state
and can cause unexpected behaviour with `Object.keys()` enumeration.

**Fix:**

```ts
const newEntry: OpEntry = {
  p: patches,
  ip: inversePatches,
  ...(group != null && { g: group })
}
```

---

### ISSUE-004 — Diff mode patch format vs immer `applyPatches` compatibility

**Files:** [src/patch-reducer.ts](../src/patch-reducer.ts) lines 172–174,
[src/patch-helpers.ts](../src/patch-helpers.ts)
**Severity:** Medium — diff mode undo/redo may produce incorrect state

**Problem:**

`diff` mode produces patches using `fastJsonPatch.compare()` (RFC 6902 format) and
stores them in `OpEntry.p` / `ip`. On undo/redo, `applyUndo` / `applyRedo` in
[src/patch-helpers.ts](../src/patch-helpers.ts) apply those patches using immer's
`applyPatches`. Immer's `applyPatches` is only guaranteed to handle patches it has
itself produced. While the surface formats are structurally similar, edge cases around
arrays, nested deletions, and index handling may diverge between the two libraries.

**Fix options:**
- Tag each `OpEntry` with its origin (`source: 'immer' | 'diff'`) and dispatch to
  the correct applier in the undo/redo helpers.
- Or exhaustively test that `fast-json-patch` output is fully compatible with immer's
  `applyPatches` for the operation types used.

---

### ISSUE-005 — Unused `EnablePatches` type import

**File:** [src/patch-reducer.ts](../src/patch-reducer.ts) line 1
**Severity:** Low — dead import, will produce a lint warning

**Problem:**

```ts
import { produceWithPatches, enablePatches, type Patch, type Draft, type EnablePatches } from 'immer'
```

`EnablePatches` is imported as a type but never referenced anywhere in the file.

**Fix:** Remove `type EnablePatches` from the import statement.

---

## Missing Tests

The test files cover basic happy-path scenarios but leave core logic untested.

| Area | Missing tests |
|---|---|
| `insertOp` | Clears redo entries when `cursor < stack.length`; respects `limit`; cursor increments correctly |
| `applyUndo` / `applyRedo` | Unit tests with real immer patch fixtures; round-trip identity; no-op at stack boundaries |
| Jump ops | `jump(0)` is identity; `jump(-1)` matches `applyUndo`; multi-step jump matches sequential steps; `jumpToPast(0)` reaches oldest state; `jumpToFuture(0)` reaches first future state |
| Filter | Excluded action does not appear in stack; `present` still updates; `syncFilter: true` updates `_latestUnfiltered`; undo after filtered actions returns to correct pre-filter state |
| `initTypes` | Init action in patch mode resets history rather than adding an op entry |
| `materializeHistory` | Reconstructed `past` matches a parallel snapshot-mode history |

---

## Recommended Fix Order

| Priority | ID | Description | File |
|---|---|---|---|
| 1 | BUG-001 | Move `patchModeReducer` call to construction time | [src/reducer.ts](../src/reducer.ts) |
| 2 | BUG-002 | Implement `filter` + `syncFilter` in patch reducer default branch | [src/patch-reducer.ts](../src/patch-reducer.ts) |
| 3 | BUG-003 | Add `initTypes` reset to patch reducer default branch | [src/patch-reducer.ts](../src/patch-reducer.ts) |
| 4 | ISSUE-002 | Implement full `materializeHistory` for `PatchHistory` | [src/helpers.ts](../src/helpers.ts) |
| 5 | ISSUE-003 | Only set `g` on `OpEntry` when group is non-null | [src/patch-helpers.ts](../src/patch-helpers.ts) |
| 6 | ISSUE-001 | Remove duplicate `enablePatches()` call | [src/patch-reducer.ts](../src/patch-reducer.ts) |
| 7 | ISSUE-005 | Remove unused `EnablePatches` import | [src/patch-reducer.ts](../src/patch-reducer.ts) |
| 8 | ISSUE-004 | Verify or fix diff mode patch applier compatibility | [src/patch-helpers.ts](../src/patch-helpers.ts) |
| 9 | — | Write missing unit tests for all gaps listed above | `test/` |
