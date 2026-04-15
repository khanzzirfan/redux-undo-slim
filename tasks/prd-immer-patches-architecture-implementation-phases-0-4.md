# PRD: Immer Patches Architecture Implementation (Phases 0-4)

## Overview

Implement the new patch-based history architecture for redux-undo-slim that replaces full state snapshots with minimal Immer patches, dramatically reducing memory usage for large state applications. Phases 0-4 implement the core functionality: tooling, core helpers, undo/redo operations, jump operations, and wiring the reducer with 'immer' patch mode.

## Goals

- Add Immer as a peer dependency to enable patch-based state management
- Implement `PatchHistory` state shape with `stack` (ops array) and `cursor` instead of `past[]`/`future[]` arrays
- Implement core patch operations: `insertOp`, `undoOp`, `redoOp`, `jumpOp`
- Wire `patchMode: 'immer'` into the reducer while maintaining backward compatibility with existing snapshot mode
- Ensure all existing tests pass (no regression)

## Quality Gates

These commands must pass for every user story:
- `npm run test` - Run all existing tests
- `npm run lint` - Linting

## User Stories

### US-001: Add Immer peer dependency and types
**Description:** As a developer, I want Immer and its types available in the project so that I can implement patch-based state management.

**Acceptance Criteria:**
- [ ] Add `immer` as a devDependency and peerDependency in package.json with version `>=9.0.0`
- [ ] Add `fast-json-patch` as an optional peer dependency (for future diff mode)
- [ ] Create `src/types.ts` with `OpEntry` and `PatchHistory<T>` interfaces

### US-002: Add enablePatches and stub helpers
**Description:** As a developer, I want the Immer patch API enabled at module load and stub functions in place so that the foundation is ready for implementation.

**Acceptance Criteria:**
- [ ] Add `enablePatches()` call in src/index.js module initialization
- [ ] Create `src/patch-helpers.js` with stub functions: `applyUndo`, `applyRedo`, `insertOp`
- [ ] Stub functions return unchanged history (no-op)

### US-003: Implement newPatchHistory factory
**Description:** As a developer, I want a factory function that creates the new `PatchHistory` state shape so that I can initialize history with the new structure.

**Acceptance Criteria:**
- [ ] Implement `newPatchHistory<T>(present, stack?, cursor?)` in src/helpers.js
- [ ] Function returns `{ present, stack: [], cursor: 0, _latestUnfiltered: present }`
- [ ] Export both `newHistory` (existing) and `newPatchHistory` (new)

### US-004: Implement isPatchHistory type guard
**Description:** As a developer, I want a type guard to detect whether a state uses the new patch history shape so that I can handle both old and new formats.

**Acceptance Criteria:**
- [ ] Implement `isPatchHistory(state)` in src/helpers.js
- [ ] Returns true when state has `present`, `stack` (array), and `cursor` (number)
- [ ] Returns false for existing snapshot-style history

### US-005: Implement insertOp helper
**Description:** As a developer, I want an `insertOp` function that adds a new operation to the stack and advances the cursor so that I can record state changes.

**Acceptance Criteria:**
- [ ] Slices stack to cursor position (removes redo entries)
- [ ] Pushes new OpEntry with patches, inversePatches, and optional group
- [ ] Increments cursor by 1
- [ ] Returns new PatchHistory object

### US-006: Implement computed helpers (canUndo, canRedo)
**Description:** As a developer, I want helper functions to determine if undo/redo is possible so that I can compute these values without storing them.

**Acceptance Criteria:**
- [ ] `canUndo(history)` returns `history.cursor > 0`
- [ ] `canRedo(history)` returns `history.cursor < history.stack.length`
- [ ] Unit tests verify both return correct boolean values

### US-007: Implement undoOp with applyPatches
**Description:** As a developer, I want an `undoOp` function that applies inverse patches to move back one step so that undo functionality works with the new architecture.

**Acceptance Criteria:**
- [ ] Returns unchanged history if cursor is 0
- [ ] Applies inverse patches from `stack[cursor - 1].ip` to present state
- [ ] Decrements cursor by 1
- [ ] Returns new PatchHistory with updated present and cursor

### US-008: Implement redoOp with applyPatches
**Description:** As a developer, I want a `redoOp` function that applies forward patches to move forward one step so that redo functionality works with the new architecture.

**Acceptance Criteria:**
- [ ] Returns unchanged history if cursor equals stack.length
- [ ] Applies forward patches from `stack[cursor].p` to present state
- [ ] Increments cursor by 1
- [ ] Returns new PatchHistory with updated present and cursor

### US-009: Unit tests for undoOp and redoOp
**Description:** As a developer, I want unit tests that verify undo/redo correctness so that I can trust the implementation.

**Acceptance Criteria:**
- [ ] Undo on empty stack returns unchanged history
- [ ] Undo on cursor=1 correctly restores state
- [ ] Redo on full cursor returns unchanged history
- [ ] Redo after undo restores state
- [ ] Undo + redo round-trip restores to exact same present reference

### US-010: Implement jumpOp for multi-step navigation
**Description:** As a developer, I want a `jumpOp` function that can move multiple steps at once using patch composition so that jump functionality is efficient.

**Acceptance Criteria:**
- [ ] Clamps n to valid range (-cursor to stack.length - cursor)
- [ ] For positive n: composes forward patches from cursor through cursor+n-1
- [ ] For negative n: composes inverse patches in reverse order
- [ ] Applies composed patches in single applyPatches call
- [ ] Updates cursor accordingly

### US-011: Implement jumpToPastOp and jumpToFutureOp
**Description:** As a developer, I want functions to jump to specific past/future indices so that jumpToPast and jumpToFuture work with the new architecture.

**Acceptance Criteria:**
- [ ] `jumpToPastOp(history, index)` validates index in [0, cursor - 1]
- [ ] `jumpToFutureOp(history, index)` validates index in [0, stack.length - cursor - 1]
- [ ] Both delegate to jumpOp with correct step count

### US-012: Unit tests for jump operations
**Description:** As a developer, I want unit tests for jump operations so that I can verify correct behavior.

**Acceptance Criteria:**
- [ ] jump(0) returns same history
- [ ] jump(-1) gives same result as undo
- [ ] jump(+1) gives same result as redo
- [ ] jumpToPast(0) reaches oldest state
- [ ] jumpToFuture(0) reaches first future state
- [ ] Multi-step jump gives same state as sequential single steps

### US-013: Add patchMode config to undoable
**Description:** As a developer, I want the undoable function to accept a patchMode config option so that I can select between snapshot and patch modes.

**Acceptance Criteria:**
- [ ] Add `patchMode` to config defaults with default value 'snapshot'
- [ ] Config accepts: 'snapshot', 'immer', 'diff'
- [ ] Default 'snapshot' keeps existing tests green

### US-014: Create patchModeReducer
**Description:** As a developer, I want a separate reducer function that handles the patch mode logic so that the existing snapshot logic remains untouched.

**Acceptance Criteria:**
- [ ] Create `src/patch-reducer.js` file
- [ ] Handle init/createHistory using newPatchHistory
- [ ] Handle undoType via undoOp
- [ ] Handle redoType via redoOp
- [ ] Handle jumpType, jumpToPastType, jumpToFutureType via jump ops
- [ ] Handle clearHistoryType (clear stack and reset cursor)

### US-015: Wire immer mode into main reducer
**Description:** As a developer, I want the main reducer to dispatch to patchModeReducer when patchMode is 'immer' so that the patch mode is functional.

**Acceptance Criteria:**
- [ ] Add branch at top of returned reducer checking config.patchMode
- [ ] For 'immer' mode, call patchModeReducer
- [ ] Existing snapshot logic unchanged
- [ ] Preserves initTypes reset behavior

### US-016: Implement default action handling in patchModeReducer
**Description:** As a developer, I want the patchModeReducer to capture patches when handling regular actions so that state changes are recorded.

**Acceptance Criteria:**
- [ ] Use produceWithPatches around reducer call
- [ ] Extract patches and inversePatches from produceWithPatches result
- [ ] Call insertOp with the new patches
- [ ] Update _latestUnfiltered to nextState

### US-017: Integration test for immer mode
**Description:** As a developer, I want an integration test that verifies the full undo/redo flow works in immer mode so that end-to-end functionality is confirmed.

**Acceptance Criteria:**
- [ ] Create test with counter reducer wrapped in undoable with patchMode: 'immer'
- [ ] Increment 3 times, undo once, redo once - verify present value
- [ ] Verify stack.length and cursor at each step
- [ ] All existing snapshot tests still pass (no regression)

## Functional Requirements

- FR-1: Package.json must declare immer >=9.0.0 as peerDependency
- FR-2: enablePatches() must be called once at module initialization
- FR-3: newPatchHistory must create valid PatchHistory shape
- FR-4: insertOp must slice stack to cursor before pushing new entry
- FR-5: undoOp must apply inverse patches using applyPatches from immer
- FR-6: redoOp must apply forward patches using applyPatches from immer
- FR-7: jumpOp must compose multiple patches before single applyPatches call
- FR-8: patchModeReducer must handle all action types (undo, redo, jump, clear, default)
- FR-9: Default 'snapshot' mode must produce identical behavior to existing implementation
- FR-10: All existing tests must continue to pass

## Non-Goals

- diff mode (patchMode: 'diff') - deferred to future phase
- materializeHistory helper - deferred to Phase 9
- Deprecation warnings - deferred to Phase 10
- Performance benchmarks - deferred to Phase 11
- Documentation updates - deferred to Phase 12

## Technical Considerations

- Immer patches follow RFC-6902 JSON Patch format
- _latestUnfiltered is a reference (not a copy) due to immer's frozen structural sharing
- Patch composition works because ops in a linear stack never conflict
- The new architecture is opt-in via patchMode config (backward compatible by default)

## Success Metrics

- All Phase 0-4 unit tests pass
- All existing snapshot-mode tests pass (no regression)
- Integration test confirms undo/redo works correctly in immer mode
- No changes to public API surface for existing consumers

## Open Questions

- Should we use TypeScript strict mode for new files? (User indicated: match existing codebase conventions)
- Any preference on file organization? (User indicated: keep in same src/ directory structure)