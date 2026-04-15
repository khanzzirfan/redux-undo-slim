# Architecture: Immer Patches — Ops Stack Design

## Problem with the Current Architecture

The current `redux-undo` stores **full state snapshots** in `past[]` and `future[]`:

```js
{
  past:    [fullState0, fullState1, ..., fullStateN],  // N deep copies
  present: fullStateN+1,                               // current
  future:  [fullStateN+2, ..., fullStateM],            // M deep copies
  _latestUnfiltered: fullStateK,                       // yet another copy
  group: null,
  index: N,
  limit: N + M + 1
}
```

### Memory cost

| History limit | State size | Memory used |
|---|---|---|
| 50 steps | 1 KB | ~101 KB |
| 50 steps | 100 KB | ~10 MB |
| 50 steps | 1 MB | ~101 MB |
| 100 steps | 1 MB | ~201 MB |

For any non-trivial application (document editors, canvas tools, form builders), this
becomes the dominant memory consumer. The model is fundamentally `O(N × S)` where N is
the history depth and S is the full state size.

### Additional structural problems

- `insert` spreads the entire `past[]` array on every action (`[...pastSliced, _latestUnfiltered]`).
- `jumpToPast` / `jumpToFuture` spread both `past[]` and `future[]` simultaneously.
- `_latestUnfiltered` is a second full state reference that leaks into the public API
  and confuses users (see FAQ).
- Separate `past` and `future` arrays require shifting items between them on every
  undo/redo, creating GC pressure.

---

## Core Concept: Ops Stack + Immer Patches

Instead of storing full snapshots, store **only what changed** between each state
transition as a pair of immer `Patch` arrays:

- **forward patches** (`p`): the minimal set of operations to move from state N → state N+1 (used by redo)
- **inverse patches** (`ip`): the minimal set of operations to move from state N+1 → state N (used by undo)

A single integer `cursor` replaces separate `past[]` / `future[]` arrays:

```
stack:  [op0,  op1,  op2,  op3,  op4]
cursor:                  ^
                         |
               cursor=3: ops 0-2 applied (past), ops 3-4 unapplied (future)
```

- `past.length` equivalent  → `cursor`
- `future.length` equivalent → `stack.length - cursor`
- Only **one materialized state** (`present`) exists at any time.

---

## New State Shape

```ts
import { Patch } from 'immer'

/** A single reversible operation unit stored in the ops stack. */
interface OpEntry {
  p:  Patch[]          // forward patches — apply to redo this op
  ip: Patch[]          // inverse patches — apply to undo this op
  g?: string | number  // group key (omitted when null)
}

/** The new history envelope replacing { past, present, future }. */
interface PatchHistory<T> {
  present:            T              // single materialized state (source of truth)
  stack:              OpEntry[]      // all ops — past and future combined
  cursor:             number         // how many ops have been applied (0 = initial)
  _latestUnfiltered:  T | null       // last pre-filter anchor state (immer ref, not copy)
}
```

### Computed properties (not stored)

```ts
canUndo:     cursor > 0
canRedo:     cursor < stack.length
pastLength:  cursor
futureLength: stack.length - cursor
```

### Key insight on `_latestUnfiltered`

In the new design `_latestUnfiltered` is still required for filter semantics, but it
is **never a deep copy**. Because immer produces frozen structural-sharing objects,
this reference costs nothing extra — it simply points to the last frozen state object
that was committed to the stack. Under `syncFilter: true` it becomes `null`.

---

## Op Entry Format

An `OpEntry` carries immer RFC-6902-style patch operations:

```ts
// Example: user renames a document title
{
  p:  [{ op: 'replace', path: '/title', value: 'New Title' }],
  ip: [{ op: 'replace', path: '/title', value: 'Old Title' }]
}

// Example: user adds an item to a list
{
  p:  [{ op: 'add', path: '/items/3', value: { id: 4, text: 'Buy milk' } }],
  ip: [{ op: 'remove', path: '/items/3' }]
}

// Example: large structural change (select all + delete)
{
  p:  [{ op: 'replace', path: '/items', value: [] }],
  ip: [{ op: 'replace', path: '/items', value: [/* all items */] }]
}
```

The patches are exactly what immer's `produceWithPatches` emits — no custom format.

---

## Patch Mode Options

Different projects have different reducer styles. The new architecture supports three
modes via a `patchMode` config option:

### `'immer'` (recommended for new projects)

The wrapped reducer is expected to use immer's `produce` internally, or accept a
draft and mutate it. The `undoable` wrapper calls `produceWithPatches` around the
reducer call to capture patches natively.

```js
// Reducer written with immer produce:
const myReducer = produce((draft, action) => {
  if (action.type === 'SET_TITLE') draft.title = action.title
})

undoable(myReducer, { patchMode: 'immer' })
```

Zero additional diffing cost. Patches are a byproduct of the same immer call that
produces `nextState`.

### `'diff'` (for existing non-immer reducers)

The wrapped reducer returns a plain new state object (existing redux style). After the
reducer runs, the architecture computes a structural diff between `present` and
`nextState` to derive patches.

```js
// Existing plain reducer — no changes needed:
const myReducer = (state = initial, action) => { ... }

undoable(myReducer, { patchMode: 'diff' })
```

Requires a structural diff utility (e.g. `fast-json-patch`). Slightly more CPU cost
per action but eliminates all memory overhead of full snapshots.

### `'snapshot'` (backward compatibility default)

Falls back to the current full-copy behavior. Keeps the old `{ past, present, future }`
shape. Allows existing consumers to adopt the new library version without any
migration work.

```js
undoable(myReducer)  // defaults to 'snapshot' for backward compat
undoable(myReducer, { patchMode: 'snapshot' })
```

---

## Core Operations

### enablePatches (module init)

```ts
import { enablePatches } from 'immer'
enablePatches()  // called once at module load — unlocks patch tracking in immer
```

### insert (new action recorded)

```
function insert(history, reducer, action, limit, group):
  1. [nextState, patches, inversePatches] = produceWithPatches(
       history.present,
       draft => reducer(draft, action)   // immer mode
     )
     -- OR --
     nextState = reducer(history.present, action)
     [patches, inversePatches] = diffPatches(history.present, nextState)  // diff mode

  2. newStack = history.stack.slice(0, history.cursor)   // discard redo history
     newOp = { p: patches, ip: inversePatches, g: group ?? undefined }
     newStack.push(newOp)

  3. if limit && newStack.length > limit:
       newStack.shift()          // trim oldest op (O(1) with circular buffer — see Limit)
       newCursor = limit         // cursor stays at cap
     else:
       newCursor = history.cursor + 1

  4. return {
       present:           nextState,
       stack:             newStack,
       cursor:            newCursor,
       _latestUnfiltered: nextState
     }
```

### undo (step back 1)

```
function undo(history):
  if history.cursor === 0: return history  // nothing to undo

  op = history.stack[history.cursor - 1]
  nextState = applyPatches(history.present, op.ip)

  return {
    ...history,
    present: nextState,
    cursor:  history.cursor - 1
  }
```

### redo (step forward 1)

```
function redo(history):
  if history.cursor === history.stack.length: return history  // nothing to redo

  op = history.stack[history.cursor]
  nextState = applyPatches(history.present, op.p)

  return {
    ...history,
    present: nextState,
    cursor:  history.cursor + 1
  }
```

### jump(n) — n steps in either direction

```
function jump(history, n):
  if n > 0: apply redo n times
  if n < 0: apply undo |n| times
  return result
```

Each step applies a single `OpEntry`'s forward or inverse patches. Multi-step jumps
can be optimized by accumulating and composing patch arrays before a single
`applyPatches` call (see Patch Composition below).

### jumpToPast(index) — jump to past[index]

```
function jumpToPast(history, index):
  // past[index] = state after `index` ops applied = cursor position of index
  // (matches old semantics: past[0] = oldest snapshot, past[N-1] = most recent)
  stepsBack = history.cursor - index   // how many undo steps needed
  return jump(history, -stepsBack)
```

### jumpToFuture(index) — jump to future[index]

```
function jumpToFuture(history, index):
  // future[index] = state after cursor + index + 1 ops applied
  stepsForward = index + 1
  return jump(history, stepsForward)
```

### clearHistory

```
function clearHistory(history):
  return {
    present:           history.present,
    stack:             [],
    cursor:            0,
    _latestUnfiltered: history.present
  }
```

---

## Grouping with Patch Merging

When consecutive actions belong to the same group (e.g. rapid drag events), their
op entries are **merged** rather than appended:

```
state  →(op1)→  state1  →(op2)→  state2

merged op:
  p  = [...op1.p,  ...op2.p]     // apply op1 patches then op2 patches = reach state2
  ip = [...op2.ip, ...op1.ip]    // apply op2 inverse then op1 inverse = return to state
```

The ordering matters:
- Forward: op1 then op2 (chronological)
- Inverse: op2 then op1 (reverse chronological to correctly unwind)

```
function insertGrouped(history, op, group):
  if history.cursor === 0: push as new entry
  lastOp = history.stack[history.cursor - 1]
  if lastOp.g === group:
    // merge into last entry — no cursor increment, no new stack entry
    history.stack[history.cursor - 1] = {
      p:  [...lastOp.p,  ...op.p],
      ip: [...op.ip, ...lastOp.ip],
      g:  group
    }
    return { ...history, present: nextState }
  else:
    // start a new entry
    return insert(history, op)
```

This is strictly better than the current approach, which grows `present` copies
while grouped. Here: grouped actions → single op entry with merged patches → single undo step.

---

## Filtering (updated semantics)

Filter behavior is preserved. A filtered action updates `present` but does not push
to `stack`:

```
function insertFiltered(history, nextState):
  // Update present but keep _latestUnfiltered pointing to the pre-filter anchor
  return {
    ...history,
    present: nextState
    // _latestUnfiltered unchanged — stays at last committed state
    // cursor unchanged
    // stack unchanged
  }
```

When `syncFilter: true`, `_latestUnfiltered` is updated to `nextState` (matching
current semantics — filtered state becomes the new undo anchor).

The key difference from the current design: `_latestUnfiltered` is used only during
the **next non-filtered insert** to correctly anchor the inverse patches. The insert
function uses `_latestUnfiltered` as the **base state** for `produceWithPatches` when
it differs from `present`:

```
baseForPatches = history._latestUnfiltered ?? history.present
[nextState, patches, inversePatches] = produceWithPatches(
  baseForPatches,          // patches start from the last committed anchor
  draft => applyMutation(draft, newState)
)
```

This ensures that an undo step correctly returns to `_latestUnfiltered`, not to a
mid-filtered-action intermediate state.

---

## Limit and Offset Tracking

When `limit` is set, old ops are trimmed from the bottom of the stack. The naive
approach shifts the array (O(N) memory move). The production-quality approach uses
an **offset counter** and a circular buffer:

### Offset counter (simple approach for early phases)

```ts
interface PatchHistory<T> {
  // ...existing fields...
  _stackOffset: number  // how many entries have been trimmed from stack[0]
}
```

When `stack.length > limit`:
```
stack.shift()         // remove oldest op
_stackOffset += 1     // track that indices are now off by 1
cursor = limit        // stays at limit
```

This keeps `cursor` and all indices consistent without an O(N) reindex.

### Circular buffer (performance optimization, later phase)

Replace `stack: OpEntry[]` with a ring buffer of fixed size `limit`. The ring
buffer maintains `head` and `tail` pointers, giving O(1) push and O(1) eviction
with zero array copies.

---

## Patch Composition for Multi-Step Jumps

When `jump(n)` is called with `|n| > 1`, applying patches one at a time is
`O(|n| × P)` where P is average patch size. Patches can be composed into a
single application call:

```
// Jumping forward 3 steps:
combinedPatches = [...stack[cursor].p, ...stack[cursor+1].p, ...stack[cursor+2].p]
nextState = applyPatches(present, combinedPatches)
cursor += 3
```

This works correctly when patches are non-conflicting (guaranteed within a linear
op stack). The resulting single `applyPatches` call is faster than three separate
immutable state transitions.

---

## New Public API Shape

### State envelope (what selectors see)

```ts
// NEW — what consumers read
state.present      // same as before
state.canUndo      // boolean (replaces state.past.length > 0)
state.canRedo      // boolean (replaces state.future.length > 0)
state.pastLength   // number  (replaces state.past.length)
state.futureLength // number  (replaces state.future.length)

// REMOVED from public API (previously semi-internal)
state.past         // no longer an array of full states
state.future       // no longer an array of full states
state._latestUnfiltered  // moved fully internal
state.index        // replaced by cursor (internal)
state.limit        // removed (was redundant)
```

### Action creators (unchanged)

```js
ActionCreators.undo()
ActionCreators.redo()
ActionCreators.jump(n)
ActionCreators.jumpToPast(index)
ActionCreators.jumpToFuture(index)
ActionCreators.clearHistory()
```

### History materialization helper (new)

For consumers that need full state snapshots (e.g. visual history timeline):

```ts
import { materializeHistory } from 'redux-undo'

// Lazily reconstruct full states by replaying patches from initial state
const { past, present, future } = materializeHistory(historyState, initialState)
// past: T[]   — reconstructed full states (expensive, for display only)
// future: T[] — reconstructed full states
```

This makes the expensive operation **explicit and opt-in** rather than always paying
the cost.

---

## Configuration (updated)

```js
undoable(reducer, {
  // NEW
  patchMode: 'immer' | 'diff' | 'snapshot',  // default: 'snapshot' for compat

  // UNCHANGED
  limit:           false,
  filter:          () => true,
  groupBy:         () => null,
  undoType:        ActionTypes.UNDO,
  redoType:        ActionTypes.REDO,
  jumpType:        ActionTypes.JUMP,
  jumpToPastType:  ActionTypes.JUMP_TO_PAST,
  jumpToFutureType: ActionTypes.JUMP_TO_FUTURE,
  clearHistoryType: ActionTypes.CLEAR_HISTORY,
  initTypes:       ['@@redux-undo/INIT'],
  debug:           false,
  ignoreInitialState: false,
  neverSkipReducer: false,
  syncFilter:      false,
})
```

---

## Memory Comparison

### Scenario: document editor, 100 KB state, 50-step history

| Architecture | Memory model | Approx. memory |
|---|---|---|
| Current (snapshot) | 101 × 100 KB | ~10 MB |
| New (immer patches, typical edits) | 1 × 100 KB + 50 × 200 B | ~110 KB |
| New (immer patches, large bulk ops) | 1 × 100 KB + 50 × 5 KB | ~350 KB |
| Worst case (replace entire state) | 1 × 100 KB + 50 × 100 KB | ~5 MB (half current) |

### Scenario: canvas editor, 10 MB state, 100-step history

| Architecture | Memory model | Approx. memory |
|---|---|---|
| Current (snapshot) | 201 × 10 MB | ~2 GB |
| New (immer patches, typical edits) | 1 × 10 MB + 100 × 500 B | ~10 MB |

The gains are proportional to the **sparsity of changes** relative to state size,
which is the common case in interactive editors.

---

## Structural Diagram

```
CURRENT ARCHITECTURE
=====================

state = {
  past:    [ {…full copy 1…}, {…full copy 2…}, … {…full copy N…} ]
  present: { …full copy N+1… }
  future:  [ {…full copy N+2…}, … {…full copy M…} ]
  _latestUnfiltered: {…full copy K…}
}

NEW ARCHITECTURE
=====================

state = {
  present: { …single live state… }    ← only ONE full state in memory
  stack: [
    { p: [patch…], ip: [patch…] },    ← op 0 (oldest)
    { p: [patch…], ip: [patch…] },    ← op 1
    { p: [patch…], ip: [patch…] },    ← op 2  ← cursor here = past.length = 3
    { p: [patch…], ip: [patch…] },    ← op 3 (redo available)
    { p: [patch…], ip: [patch…] },    ← op 4 (redo available)
  ]
  cursor: 3
  _latestUnfiltered: <ref to last committed present>
}

To UNDO: applyPatches(present, stack[cursor-1].ip) → move cursor left
To REDO: applyPatches(present, stack[cursor].p)    → move cursor right
```

---

## Immer Integration Requirements

```js
import { enablePatches, produceWithPatches, applyPatches } from 'immer'

// Call once at module load:
enablePatches()

// On each new action (immer mode):
const [nextState, patches, inversePatches] = produceWithPatches(
  currentState,
  draft => {
    // Apply reducer changes to draft
    // Either: call immer-style reducer directly
    // Or: copy result of plain reducer onto draft (diff mode fallback)
  }
)

// On undo:
const prevState = applyPatches(present, op.ip)

// On redo:
const nextState = applyPatches(present, op.p)
```

`immer` must be a **peer dependency** at `>=9.0.0` (patches API stable from v9).

---

## Migration Path

| Consumer scenario | Required change |
|---|---|
| Reading `state.present` | None |
| Reading `state.past.length` or `state.future.length` | Switch to `state.pastLength` / `state.futureLength` |
| Iterating `state.past` for history UI | Use `materializeHistory()` helper |
| Using `ActionCreators.*` | None |
| Using `filter`, `groupBy`, `includeAction`, `excludeAction` | None |
| Using TypeScript `StateWithHistory<T>` | Use new `PatchHistory<T>` type |
| Existing non-immer reducer | Set `patchMode: 'diff'` (or keep `'snapshot'` for zero change) |
| Existing immer reducer | Set `patchMode: 'immer'` to unlock full memory savings |
