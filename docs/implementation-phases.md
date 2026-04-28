# Implementation Phases: Immer Patches Architecture

Reference: [architecture-immer-patches.md](./architecture-immer-patches.md)

Each phase is independently mergeable. Phases build on each other but within each
phase the scope is intentionally small and testable. Do **not** skip phases or merge
two phases into one PR — the blast radius of each phase must stay reviewable.

---

## Phase 0 — Prerequisites and Tooling

**Goal:** Prepare the repo to support the new architecture without changing any runtime behavior.

### Tasks

1. Add `immer` as a peer dependency (`>=9.0.0`) in `package.json`.
   - Add `immer` as a `devDependency` and `peerDependency`.
   - Add `fast-json-patch` as optional peer dependency (needed for `diff` mode only).

2. Add TypeScript type definitions file `src/types.ts`:
   ```ts
   import { Patch } from 'immer'

   export interface OpEntry {
     p:  Patch[]
     ip: Patch[]
     g?: string | number
   }

   export interface PatchHistory<T> {
     present:           T
     stack:             OpEntry[]
     cursor:            number
     _latestUnfiltered: T | null
   }
   ```

3. Add `enablePatches()` call to `src/index.js` module initialization block.

4. Create `src/patch-helpers.js` with empty stubs for:
   - `applyUndo(history)` → `history` (stub)
   - `applyRedo(history)` → `history` (stub)
   - `insertOp(history, op, cursor)` → `history` (stub)

5. Update `src/helpers.js` to export a new `newPatchHistory` factory alongside
   the existing `newHistory` (no removal yet).

6. No changes to `src/reducer.js` in this phase.

**Exit criteria:** All existing tests pass. No runtime behavior changes.

---

## Phase 1 — Core PatchHistory Shape and Helpers

**Goal:** Implement the new state shape and prove it works in isolation.

### Tasks

1. Implement `newPatchHistory<T>(present, stack?, cursor?)` in `src/helpers.js`:
   ```js
   export function newPatchHistory(present, stack = [], cursor = 0) {
     return { present, stack, cursor, _latestUnfiltered: present }
   }
   ```

2. Implement `isPatchHistory(state)` type guard in `src/helpers.js`:
   - Returns true if state has `present`, `stack` (array), `cursor` (number).

3. Implement `insertOp(history, patches, inversePatches, group)` in `src/patch-helpers.js`:
   - Slices `stack` to `cursor` (removes future/redo entries).
   - Pushes new `OpEntry`.
   - Increments `cursor`.
   - Returns new `PatchHistory`.

4. Implement `canUndo(history)` and `canRedo(history)` computed helpers.

5. Write unit tests for `insertOp`:
   - Insert into empty history.
   - Insert clears redo entries when cursor < stack.length.
   - cursor increments correctly.

**Exit criteria:** Unit tests for new helpers pass. No changes to the reducer yet.

---

## Phase 2 — Undo and Redo with Patches

**Goal:** Implement `undo` and `redo` using `applyPatches` in a new parallel code path.

### Tasks

1. Implement `undoOp(history)` in `src/patch-helpers.js`:
   ```js
   import { applyPatches } from 'immer'

   export function undoOp(history) {
     if (history.cursor === 0) return history
     const op = history.stack[history.cursor - 1]
     const nextState = applyPatches(history.present, op.ip)
     return { ...history, present: nextState, cursor: history.cursor - 1 }
   }
   ```

2. Implement `redoOp(history)` in `src/patch-helpers.js`:
   ```js
   export function redoOp(history) {
     if (history.cursor === history.stack.length) return history
     const op = history.stack[history.cursor]
     const nextState = applyPatches(history.present, op.p)
     return { ...history, present: nextState, cursor: history.cursor + 1 }
   }
   ```

3. Write unit tests with hand-crafted `OpEntry` fixtures:
   - Undo on empty stack returns unchanged history.
   - Undo on cursor=1 correctly restores state.
   - Redo on full cursor returns unchanged history.
   - Redo after undo restores state.
   - Undo + redo round-trip restores to exact same present reference.

4. No changes to `src/reducer.js` yet.

**Exit criteria:** Patch-based undo/redo unit tests pass. Immer peer dep resolves.

---

## Phase 3 — Jump Operations

**Goal:** Implement `jump`, `jumpToPast`, and `jumpToFuture` using the new ops stack.

### Tasks

1. Implement `jumpOp(history, n)` in `src/patch-helpers.js`:
   - Clamp `n` to valid range (`-cursor` to `stack.length - cursor`).
   - If `n > 0`: compose forward patches from `stack[cursor]` through `stack[cursor+n-1]`.
   - If `n < 0`: compose inverse patches in reverse order.
   - Apply composed patches in a single `applyPatches` call.
   - Update cursor.

2. Implement `jumpToPastOp(history, index)`:
   - Validates index is in range `[0, cursor - 1]`.
   - Delegates to `jumpOp(history, index - cursor)`.

3. Implement `jumpToFutureOp(history, index)`:
   - Validates index is in range `[0, stack.length - cursor - 1]`.
   - Delegates to `jumpOp(history, index + 1)`.

4. Write unit tests:
   - jump(0) returns same history.
   - jump(-1) same result as undo.
   - jump(+1) same result as redo.
   - jumpToPast(0) reaches oldest state.
   - jumpToFuture(0) reaches first future state.
   - Multi-step jump gives same state as sequential single steps.

**Exit criteria:** Jump unit tests pass. Patch composition tested for off-by-one safety.

---

## Phase 4 — Wire Patch Mode into the Reducer (Immer Mode)

**Goal:** Connect the new `patchMode: 'immer'` path in `src/reducer.js`. Existing
`snapshot` mode is untouched.

### Tasks

1. Add `patchMode` to the config defaults in `undoable()`:
   ```js
   const config = {
     patchMode: 'snapshot',   // default keeps all existing tests green
     ...rawConfig,
     ...
   }
   ```

2. In `src/reducer.js`, add a branch at the top of the returned reducer:
   ```js
   if (config.patchMode === 'immer') {
     return patchModeReducer(state, action, ...slices)
   }
   // existing snapshot logic below unchanged
   ```

3. Implement `patchModeReducer` in a new file `src/patch-reducer.js`:
   - Handles init/createHistory using `newPatchHistory`.
   - Handles `undoType` via `undoOp`.
   - Handles `redoType` via `redoOp`.
   - Handles `jumpType`, `jumpToPastType`, `jumpToFutureType` via jump ops.
   - Handles `clearHistoryType` via clearHistory.
   - Handles default: calls `produceWithPatches(present, draft => Object.assign(draft, reducer(present, action)))` to get patches, then calls `insertOp`.
   - Preserves `initTypes` reset behavior.
   - Preserves `neverSkipReducer` logic for undo/redo.

4. Wire `initTypes` reset: on init action, return a fresh `newPatchHistory(initialState)`.

5. Integration test with a real counter reducer wrapped in `undoable`:
   - Increment 3 times, undo once, redo once — verify present value.
   - Verify `stack.length`, `cursor` at each step.

**Exit criteria:** Integration tests pass in `immer` mode. All existing snapshot tests
still pass (no regression).

---

## Phase 5 — Filtering in Patch Mode

**Goal:** Replicate the `filter` option behavior in the new patch reducer.

### Tasks

1. In `patchModeReducer`'s default branch, after computing `nextState`:
   - Check if `history._latestUnfiltered === nextState` (no state change) → return history unchanged.
   - Run `config.filter(action, nextState, history)`.
   - If filtered:
     - Compute patches from `_latestUnfiltered` → `nextState` (not from `present` → `nextState`).
     - Update `present` to `nextState`.
     - Do NOT push to `stack` or change `cursor`.
     - If `syncFilter: true`: update `_latestUnfiltered` to `nextState`.
   - If not filtered: proceed to `insertOp`.

2. Update `insertOp` to accept an explicit `baseState` parameter for patch computation:
   - When `_latestUnfiltered !== present`, use `_latestUnfiltered` as the base for
     `produceWithPatches` to ensure inverse patches correctly undo through filtered states.

3. Write unit tests:
   - Filtered action updates present but not stack.
   - Undo after filtered actions correctly restores to pre-filter state.
   - `syncFilter: true` updates undo anchor to filtered state.
   - `combineFilters` works correctly.

**Exit criteria:** Filter unit tests pass. Behavior matches existing snapshot mode tests.

---

## Phase 6 — Grouping with Patch Merging

**Goal:** Implement the `groupBy` option with patch-level merging.

### Tasks

1. In `patchModeReducer`'s default branch, after resolving that an action is not
   filtered:
   - Call `config.groupBy(action, nextState, history)` → `group`.
   - If `group !== null && group === lastOp.g`:
     - Merge patches into last stack entry:
       ```js
       history.stack[cursor - 1] = {
         p:  [...lastOp.p,  ...newPatches],
         ip: [...newInversePatches, ...lastOp.ip],
         g:  group
       }
       ```
     - Update `present` to `nextState`.
     - Do NOT change `cursor` or push a new entry.
   - Else: call `insertOp` as normal.

2. Clear the `g` field of the last stack entry after any undo/redo/jump (matching
   existing semantics where group resets after navigation).

3. Write unit tests:
   - 3 grouped actions produce 1 stack entry, not 3.
   - Undo of merged op returns to pre-group state in one step.
   - Redo of merged op re-applies all grouped changes.
   - Non-grouped action after grouped breaks the group.
   - `groupByActionTypes` helper works with patch mode.

**Exit criteria:** Grouping tests pass. Merged patch round-trip correctness verified.

---

## Phase 7 — Limit with Offset Trimming

**Goal:** Implement the `limit` config option in patch mode using an offset counter.

### Tasks

1. Add `_stackOffset: number` to `PatchHistory` (internal only, defaults to 0):
   - Tracks how many entries have been trimmed from the bottom of `stack`.

2. In `insertOp`, after pushing the new entry:
   ```js
   if (config.limit && stack.length > config.limit) {
     stack.shift()           // remove oldest op
     _stackOffset += 1       // shift the logical index base
     // cursor stays = config.limit (already at limit after trim)
   } else {
     cursor += 1
   }
   ```

3. Update `jumpToPast` / `jumpToFuture` to account for `_stackOffset` when
   translating user-facing `past[]` indices to internal `stack[]` indices.

4. Write unit tests:
   - History of 5 ops with limit=3: only 3 ops in stack.
   - Undo still works after trimming.
   - Redo still works after trimming.
   - `pastLength` correctly reflects trimmed history depth.

**Exit criteria:** Limit tests pass. No off-by-one errors in index math.

---

## Phase 8 — Diff Mode (Non-Immer Reducer Support)

**Goal:** Implement `patchMode: 'diff'` for existing plain reducers.

### Tasks

1. Add optional dependency: `fast-json-patch` (or equivalent structural differ).

2. In `patchModeReducer`'s default branch for `diff` mode:
   ```js
   const nextState = reducer(history.present, action)   // plain call
   const patches = compare(history.present, nextState)  // JSON Patch RFC 6902
   const inversePatches = compare(nextState, history.present)
   ```
   Then proceed with `insertOp` as in immer mode.

3. Ensure `applyPatches` in undo/redo uses immer's `applyPatches` (compatible with
   RFC 6902 format) OR use `fast-json-patch`'s `applyPatch` — pick one and be consistent.

4. Add a runtime warning in development mode if `fast-json-patch` is not installed
   when `patchMode: 'diff'` is used.

5. Write integration tests with a plain counter reducer in `diff` mode:
   - Same behavioral tests as Phase 4 integration tests but using `diff` mode.
   - Verify patches produced by `compare()` are structurally minimal.

**Exit criteria:** Diff mode tests pass. Plain reducers work without any modification.

---

## Phase 9 — Public API Additions and TypeScript Types

**Goal:** Expose new helpers and tighten TypeScript definitions.

### Tasks

1. Export `PatchHistory<T>` type from `src/index.js`.

2. Export `materializeHistory(history, initialState)` helper:
   - Replays all ops from `stack[0]` forward from `initialState` to reconstruct
     `past[]` and `future[]` as arrays of full state snapshots.
   - Mark with a JSDoc note that this is O(N) and for display only.

3. Export `canUndo(history)` and `canRedo(history)` as named helpers.

4. Add `pastLength` and `futureLength` as computed getters on `PatchHistory`
   (or as exported utility functions).

5. Update `StateWithHistory<T>` type alias to accept both old and new shapes for
   a transition period.

6. Update `isHistory()` helper to also recognize `PatchHistory` shape.

7. Write TypeScript compilation tests confirming the new types resolve correctly.

**Exit criteria:** TypeScript types compile. `materializeHistory` correctly
reconstructs snapshots that match a parallel snapshot-mode history.

---

## Phase 10 — Migration Compatibility and Backward Compat Tests

**Goal:** Ensure existing code that used the old API continues to work or gets
clear migration guidance.

### Tasks

1. Write a compatibility shim: if `patchMode: 'snapshot'` (default), the returned
   history still has `past[]` and `future[]` as before. No API surface changes for
   existing consumers.

2. Add deprecation warnings (development only) for:
   - Accessing `state.past` directly when `patchMode !== 'snapshot'`.
   - Accessing `state.future` directly when `patchMode !== 'snapshot'`.
   - Accessing `state._latestUnfiltered` directly (any mode).

3. Write migration integration tests:
   - Start in `snapshot` mode, migrate to `diff` mode — same undo/redo behavior.
   - Start in `snapshot` mode, migrate to `immer` mode — same undo/redo behavior.
   - Test `materializeHistory()` output matches snapshot mode `past` arrays.

4. Write a "migration guide" section in `docs/architecture-immer-patches.md` covering
   the most common consumer patterns and their updated equivalents.

**Exit criteria:** All existing snapshot-mode tests still pass. Migration tests confirm
behavioral parity across all three modes.

---

## Phase 11 — Performance Benchmarks

**Goal:** Quantify the memory and CPU improvements against the current architecture.

### Tasks

1. Create `benchmarks/memory.js`:
   - Simulate 100 incremental state changes to a 100 KB object.
   - Measure heap allocation in snapshot vs diff vs immer mode.
   - Report ops/sec and memory footprint.

2. Create `benchmarks/undo-redo.js`:
   - Simulate 50-step undo + 50-step redo in each mode.
   - Measure time and allocations per step.

3. Add benchmark results to `docs/architecture-immer-patches.md` memory comparison table.

4. Set a performance regression gate in CI: `immer` mode must use < 5% of the memory
   of `snapshot` mode for the 100 KB / 50-step benchmark scenario.

**Exit criteria:** Benchmarks run without crashing. Immer mode demonstrates measurable
improvement. Numbers are documented.

---

## Phase 12 — Documentation and Examples Update

**Goal:** Update all user-facing documentation to reflect the new architecture options.

### Tasks

1. Update `README.md`:
   - Add `patchMode` to the configuration table.
   - Add a "Memory-efficient mode" section showing `patchMode: 'immer'` usage.
   - Update the History API section to mention `pastLength`, `futureLength`, `canUndo`, `canRedo`.
   - Deprecate the `state.past` / `state.future` array access pattern with a migration note.

2. Update `docs/main/faq.md`:
   - Update the `_latestUnfiltered` question to reflect the new internals.
   - Add a new FAQ: "How do I reduce memory usage for large states?"

3. Update `docs/main/working-with-ts.md`:
   - Replace `StateWithHistory<T>` with `PatchHistory<T>` examples.

4. Update or add an example in `examples/` showing a canvas-style editor
   benefiting from patch mode memory savings.

5. Add `CHANGELOG.md` entry for the new major version.

**Exit criteria:** All doc links resolve. Example runs without errors. README accurately
reflects new configuration options.

---

## Phase Summary

| Phase | Scope | Risk | Dependencies |
|---|---|---|---|
| 0 | Tooling, types, stubs | Low | None |
| 1 | PatchHistory shape + helpers | Low | Phase 0 |
| 2 | Undo/redo with patches | Low | Phase 1 |
| 3 | Jump operations | Low | Phase 2 |
| 4 | Wire into reducer (immer mode) | Medium | Phase 3 |
| 5 | Filtering in patch mode | Medium | Phase 4 |
| 6 | Grouping with patch merge | Medium | Phase 5 |
| 7 | Limit + offset trimming | Medium | Phase 6 |
| 8 | Diff mode (plain reducer) | Medium | Phase 4 |
| 9 | Public API + TypeScript types | Low | Phases 1–8 |
| 10 | Migration compat + deprecations | Low | Phase 9 |
| 11 | Benchmarks | Low | Phase 10 |
| 12 | Docs update | Low | All phases |

Phases 5–7 can be developed in parallel with Phase 8 by different contributors
since they build on Phase 4 independently.
