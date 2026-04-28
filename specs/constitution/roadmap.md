# Roadmap — redux-undo-slim

## Status Legend

- `[ ]` Planned
- `[~]` In Progress
- `[x]` Complete

---

## Phase 0 — Foundation

> Prerequisites: types, tooling, module init, empty stubs.

- [x] Add `immer` as peer dependency (`>=10.0.0`)
- [x] Add `fast-json-patch` as optional peer dependency
- [x] Create `src/types.ts` — `OpEntry`, `PatchHistory`, `History`, `UndoableConfig`
- [x] Add `enablePatches()` in `src/index.ts` module init
- [x] Create `src/patch-helpers.ts` with function stubs
- [x] Rename package to `redux-undo-slim`, bump to `v2.0.0`

---

## Phase 1 — PatchHistory Shape + Helpers

> Core state shape and computed helpers.

- [x] `newPatchHistory<T>(present, stack?, cursor?)` factory in `src/helpers.ts`
- [x] `isPatchHistory(state)` type guard
- [x] `canUndo(history)` — `cursor > 0`
- [x] `canRedo(history)` — `cursor < stack.length`
- [x] `pastLength(history)` — returns `cursor`
- [x] `futureLength(history)` — returns `stack.length - cursor`
- [x] `insertOp(history, patches, inversePatches, group, limit)` in `src/patch-helpers.ts`
- [x] Unit tests: `canUndo` / `canRedo` in `test/helpers.spec.js`

---

## Phase 2 — Undo / Redo with Patches

> Apply inverse/forward patches via immer `applyPatches`.

- [x] `applyUndo<T>(history)` — apply `stack[cursor-1].ip`, decrement cursor
- [x] `applyRedo<T>(history)` — apply `stack[cursor].p`, increment cursor
- [x] Guard: no-op at stack boundaries (cursor=0 or cursor=stack.length)
- [ ] Unit tests: undo/redo with real immer patch fixtures
- [ ] Unit tests: round-trip identity (undo + redo restores same reference)

---

## Phase 3 — Jump Operations

> Multi-step navigation with patch composition.

- [x] `jumpOp<T>(history, n)` — compose and apply N patches in single call
- [x] `jumpToPastOp(history, index)` — delegates to `jumpOp`
- [x] `jumpToFutureOp(history, index)` — delegates to `jumpOp`
- [x] Clamping: n bounded to `[-cursor, stack.length - cursor]`
- [ ] Unit tests: `jump(0)` identity, `jump(-1)` matches `applyUndo`
- [ ] Unit tests: multi-step jump matches sequential single steps
- [ ] Unit tests: `jumpToPast(0)` reaches oldest state

---

## Phase 4 — Wire Patch Mode into Reducer

> Connect immer/diff path through main `undoable()`.

- [x] Add `patchMode` config option — default `'snapshot'`
- [x] Create `src/patch-reducer.ts` — full switch/case matching `reducer.ts`
- [x] Handle: init, undo, redo, jump, jumpToPast, jumpToFuture, clearHistory
- [x] Handle default action: `produceWithPatches` → `insertOp`
- [x] `patchModeReducer` instantiated once at construction time (not per-dispatch)
- [x] Integration tests: increment × 3, undo, redo — verify `present` + `stack` + `cursor`

---

## Phase 5 — Filtering in Patch Mode

> `filter`, `includeAction`, `excludeAction`, `syncFilter` support.

- [x] Filter check before `insertOp` in `patch-reducer.ts` default branch
- [x] Filtered action updates `present`, does not push to `stack`
- [x] `syncFilter: true` — updates `_latestUnfiltered` to filtered state
- [x] `syncFilter: false` — `_latestUnfiltered` stays at last committed anchor
- [ ] Unit tests: excluded action absent from stack
- [ ] Unit tests: undo after filtered action returns to pre-filter state
- [ ] Unit tests: `syncFilter: true` behaviour verified

---

## Phase 6 — Grouping with Patch Merge

> Consecutive same-group actions merged into single `OpEntry`.

- [x] Detect group match: `groupValue === history.group`
- [x] Merge patches: `p = [...lastOp.p, ...newPatches]`
- [x] Merge inverse: `ip = [...newInversePatches, ...lastOp.ip]` (reverse order)
- [x] Group resets after undo/redo/jump
- [x] Integration test: 3 grouped actions → `stack.length === 1`
- [ ] Unit tests: undo of merged op returns to pre-group state in one step
- [ ] Unit tests: redo re-applies all grouped changes

---

## Phase 7 — Limit + Stack Trimming

> Cap history depth, trim oldest ops when overflow.

- [x] `insertOp` trims stack to last `limit` entries when `stack.length > limit`
- [x] `cursor` kept accurate after trim
- [x] Integration test: 5 dispatches with `limit: 3` → `stack.length === 3`
- [ ] Unit tests: undo still correct after trimming
- [ ] Unit tests: `pastLength` reflects trimmed depth

---

## Phase 8 — Diff Mode

> `patchMode: 'diff'` — plain reducer support via `fast-json-patch`.

- [x] Runtime `require('fast-json-patch')` with fallback warning
- [x] `fastJsonPatch.compare(prev, next)` for patches, `compare(next, prev)` for inverse
- [ ] Verify RFC 6902 patches are compatible with immer `applyPatches` OR switch to `fast-json-patch`'s `applyPatch` for undo/redo in diff mode
- [ ] Integration tests: plain counter reducer in diff mode — same behaviour as immer mode
- [ ] Warn in dev if `fast-json-patch` not installed when `patchMode: 'diff'` selected

---

## Phase 9 — Public API + TypeScript Types

> Clean exports, `materializeHistory`, typed helpers.

- [x] Export `PatchHistory<T>`, `OpEntry`, `HistoryState<T>` from `src/index.ts`
- [x] Export `canUndo`, `canRedo`, `pastLength`, `futureLength`
- [x] Export `materializeHistory` — **currently a stub for PatchHistory**
- [ ] Fix `materializeHistory` — replay patches from `initialState` to reconstruct `past[]` and `future[]`
- [ ] Unit tests: `materializeHistory` output matches parallel snapshot-mode history
- [ ] Update `typings.d.ts` to expose new types

---

## Phase 10 — Migration Compat + Deprecations

> Smooth upgrade path from `redux-undo` 1.x.

- [ ] Dev-mode warning when `state.past` / `state.future` accessed in patch mode
- [ ] Dev-mode warning when `state._latestUnfiltered` accessed directly
- [ ] Migration integration test: same behaviour in snapshot → diff → immer
- [ ] `StateWithHistory<T>` alias pointing to `PatchHistory<T>`

---

## Phase 11 — Benchmarks

> Quantify memory and CPU gains.

- [ ] `benchmarks/memory.js` — 100 incremental changes on 100 KB state, heap snapshot per mode
- [ ] `benchmarks/undo-redo.js` — 50-step undo + redo, time + allocations per mode
- [ ] Results added to `docs/architecture-immer-patches.md` memory table
- [ ] CI gate: immer mode uses < 5% memory of snapshot mode on reference benchmark

---

## Phase 12 — Docs + Config Cleanup

> Final polish before v2.0.0 stable publish.

- [x] `README.md` updated — new API, patchMode, migration guide
- [x] `docs/architecture-immer-patches.md` written
- [x] `docs/implementation-phases.md` written
- [x] `docs/code-review.md` written
- [ ] Fix `vite.config.ts` — entry point `index.js` → `index.ts`, name `ReduxUndoSlim`
- [ ] Remove legacy `.js` source files from `src/` (superseded by `.ts`)
- [ ] Add `CHANGELOG.md` — v1.x → v2.0.0 migration notes
- [ ] CI pipeline: GitHub Actions — `npm test && npm run lint` on push to `dev` + `master`
- [ ] Publish `redux-undo-slim@2.0.0` to npm

---

## Replanning Notes

*(Updated after each phase completes)*

- **2026-04-16**: Phases 0–7 implemented. BUG-001 (patchModeReducer re-created per dispatch) fixed in `reducer.ts`. BUG-002 (filter missing) and BUG-003 (initTypes missing) fixed in `patch-reducer.ts`. ISSUE-003 (g: undefined on OpEntry) fixed in `patch-helpers.ts`. ISSUE-001 (duplicate enablePatches) fixed — removed from `patch-reducer.ts`.
- **2026-04-28**: Constitution added to `specs/`. Remaining open items: Phase 8 diff mode applier verification, Phase 9 `materializeHistory` implementation, Phases 10–12.
