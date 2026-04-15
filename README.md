# redux-undo-slim

[![NPM version](https://img.shields.io/npm/v/redux-undo-slim.svg?style=flat-square)](https://www.npmjs.com/package/redux-undo-slim)
[![NPM Downloads](https://img.shields.io/npm/dm/redux-undo-slim.svg?style=flat-square)](https://www.npmjs.com/package/redux-undo-slim)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE.md)

_Memory-efficient undo/redo for Redux — powered by [immer](https://immerjs.github.io/immer/) patches._

`redux-undo-slim` is a drop-in higher-order reducer that adds undo/redo history to any
Redux slice. Unlike the classic approach of storing full state snapshots per step, it
stores only the **minimal diff** (immer patches) between states — dramatically reducing
memory usage for large or deeply nested state trees.

For a full breakdown of the architecture see [docs/architecture-immer-patches.md](./docs/architecture-immer-patches.md).

---

## Installation

```bash
npm install redux-undo-slim immer
```

`immer` is a required peer dependency (`>=9.0.0`).

---

## Quick Start

```js
import undoable, { ActionCreators } from 'redux-undo-slim'
import { combineReducers } from 'redux'

const rootReducer = combineReducers({
  document: undoable(documentReducer, { patchMode: 'immer' })
})

// Undo / redo
store.dispatch(ActionCreators.undo())
store.dispatch(ActionCreators.redo())
```

---

## Making Your Reducer Undoable

`undoable` is a reducer enhancer (higher-order reducer). Wrap any existing reducer:

```js
import undoable from 'redux-undo-slim'

combineReducers({
  counter: undoable(counter)
})
```

> **Note:** After wrapping, access your state via `state.counter.present` instead
> of `state.counter`.

### Multiple independent histories

```js
const rootReducer = combineReducers({
  ui: uiReducer,
  document: undoable(documentReducer, {
    undoType: 'DOCUMENT_UNDO',
    redoType: 'DOCUMENT_REDO',
  }),
  canvas: undoable(canvasReducer, {
    undoType: 'CANVAS_UNDO',
    redoType: 'CANVAS_REDO',
  }),
})
```

Always set distinct action types per slice when using multiple `undoable` wrappers,
otherwise all histories will respond to the same undo/redo actions.

---

## History API

Wrapping your reducer with `undoable` produces this state shape:

```js
{
  present:     { ...currentState },  // your live state — this is what you read
  stack:       [...opEntries],       // internal patch stack (past + future combined)
  cursor:      3,                    // how many ops have been applied
  canUndo:     true,                 // shorthand: cursor > 0
  canRedo:     false,                // shorthand: cursor < stack.length
  pastLength:  3,                    // equivalent to old past.length
  futureLength: 0,                   // equivalent to old future.length
}
```

Read the current state with `state.present`. Use `canUndo` / `canRedo` to drive
your UI buttons. The internal `stack` array stores patch pairs, not full copies.

### Accessing past states (history timeline UI)

If you need full state snapshots for a history timeline, use the
`materializeHistory` helper. This is an explicit, opt-in O(N) operation:

```js
import { materializeHistory } from 'redux-undo-slim'

const { past, future } = materializeHistory(state, initialState)
// past:   T[]  — full state at each past step
// future: T[]  — full state at each future step
```

---

## Undo / Redo Actions

```js
import { ActionCreators } from 'redux-undo-slim'

store.dispatch(ActionCreators.undo())              // undo last action
store.dispatch(ActionCreators.redo())              // redo last undone action

store.dispatch(ActionCreators.jump(-2))            // undo 2 steps
store.dispatch(ActionCreators.jump(3))             // redo 3 steps

store.dispatch(ActionCreators.jumpToPast(index))   // jump to a past index
store.dispatch(ActionCreators.jumpToFuture(index)) // jump to a future index

store.dispatch(ActionCreators.clearHistory())      // wipe history, keep present
```

---

## Configuration

```js
undoable(reducer, {
  // --- NEW in redux-undo-slim ---
  patchMode: 'snapshot',  // 'snapshot' | 'immer' | 'diff'
                          // 'snapshot': full copies (default, backward-compatible)
                          // 'immer':    immer patch diffs — best memory savings
                          // 'diff':     structural diff for plain reducers

  // --- Unchanged from redux-undo ---
  limit: false,           // max history steps (false = unlimited)

  filter: () => true,     // (action, newState, history) => bool
                          // return false to exclude an action from history
  groupBy: () => null,    // (action, newState, history) => key | null
                          // consecutive actions with the same key become one undo step

  undoType:          '@@redux-undo/UNDO',
  redoType:          '@@redux-undo/REDO',
  jumpType:          '@@redux-undo/JUMP',
  jumpToPastType:    '@@redux-undo/JUMP_TO_PAST',
  jumpToFutureType:  '@@redux-undo/JUMP_TO_FUTURE',
  clearHistoryType:  '@@redux-undo/CLEAR_HISTORY',

  initTypes:         ['@@redux-undo/INIT'],  // reset history on these action types

  debug:             false,
  ignoreInitialState: false,  // if true, users cannot undo back to the initial state
  neverSkipReducer:  false,   // if true, always run the wrapped reducer on undo/redo
  syncFilter:        false,   // if true, filtered-action states become the undo anchor
})
```

---

## Patch Modes

### `patchMode: 'snapshot'` (default)

Stores a full state copy per history step. Identical to classic `redux-undo`
behaviour. Use this when migrating from `redux-undo` and you want zero changes.

```js
undoable(reducer)
// or explicitly:
undoable(reducer, { patchMode: 'snapshot' })
```

### `patchMode: 'immer'` (recommended for new projects)

Stores only immer patches between states. Requires the wrapped reducer to use
immer's `produce` internally (or accept a draft and mutate it):

```js
import { produce } from 'immer'

const myReducer = produce((draft, action) => {
  if (action.type === 'SET_TITLE') {
    draft.title = action.title
  }
})

undoable(myReducer, { patchMode: 'immer' })
```

Memory savings scale with how much of the state actually changes per action.
For a 1 MB state with a typical field update, a single history step is ~50 bytes
instead of 1 MB.

### `patchMode: 'diff'` (for existing plain reducers)

Computes a structural diff after each reducer call. Works with any existing plain
reducer — no changes to the reducer required. Requires `fast-json-patch` as an
additional peer dependency:

```bash
npm install fast-json-patch
```

```js
// Existing plain reducer — no changes needed:
const myReducer = (state = initial, action) => { ... }

undoable(myReducer, { patchMode: 'diff' })
```

---

## Filtering Actions

Prevent specific actions from being added to the undo history:

```js
import undoable, { includeAction, excludeAction } from 'redux-undo-slim'

undoable(reducer, { filter: includeAction('MY_ACTION') })
undoable(reducer, { filter: excludeAction(['MOUSE_MOVE', 'SCROLL']) })
```

A filtered action still updates `present` — it is just not recorded as an undo step.
To block an action from updating state entirely, use
[redux-ignore](https://github.com/omnidan/redux-ignore).

### Custom filter

```js
undoable(reducer, {
  filter: (action, newState, history) => {
    return newState.isDirty  // only record when state is dirty
  }
})
```

### Combining filters

```js
import { combineFilters } from 'redux-undo-slim'

undoable(reducer, {
  filter: combineFilters(
    excludeAction(['MOUSE_MOVE']),
    (action, state) => state.recording
  )
})
```

---

## Grouping Actions

Make consecutive related actions count as a single undo step:

```js
import undoable, { groupByActionTypes } from 'redux-undo-slim'

undoable(reducer, { groupBy: groupByActionTypes('DRAG_MOVE') })
// or with an array:
undoable(reducer, { groupBy: groupByActionTypes(['DRAG_MOVE', 'RESIZE']) })
```

Custom grouping:

```js
undoable(reducer, {
  groupBy: (action, newState, history) => {
    if (action.type === 'DRAG_MOVE') return `drag-${action.itemId}`
    return null  // null = start a new undo step
  }
})
```

> In `immer` and `diff` patch modes, grouped actions are merged at the patch level —
> the entire group is stored as a single `OpEntry`, not N separate entries.
> This means one undo step = one patch application, regardless of group size.

---

## Initial State

Set an initial present state as you normally would with Redux — history is created automatically:

```js
const store = createStore(undoable(counter), { count: 5 })

// State will be:
// { present: { count: 5 }, stack: [], cursor: 0, canUndo: false, canRedo: false }
```

Or supply a pre-built history (e.g. for hydration):

```js
import { newHistory } from 'redux-undo-slim'

const store = createStore(
  undoable(counter),
  newHistory([], { count: 5 }, [])
)
```

---

## TypeScript

```ts
import undoable, { PatchHistory, ActionCreators } from 'redux-undo-slim'

// PatchHistory<T> is the state shape produced by undoable()
type DocumentState = PatchHistory<{ title: string; body: string }>

// Access present state with correct typing:
const title = store.getState().document.present.title
```

---

## Migrating from `redux-undo`

`redux-undo-slim` is a fork of `redux-undo` with a new default export name and
optional memory-efficient patch modes. The default `patchMode: 'snapshot'` keeps
full backward compatibility.

| Change | Action required |
|---|---|
| Package name: `redux-undo` → `redux-undo-slim` | Update `import`/`require` |
| `state.past.length` | Use `state.pastLength` |
| `state.future.length` | Use `state.futureLength` |
| `state.past` / `state.future` arrays for UI | Use `materializeHistory()` |
| `StateWithHistory<T>` type | Use `PatchHistory<T>` |
| Everything else | No change |

---

## How It Works

For a deep dive into the patch-based architecture, see
[docs/architecture-immer-patches.md](./docs/architecture-immer-patches.md).

For the implementation roadmap, see
[docs/implementation-phases.md](./docs/implementation-phases.md).

The classic snapshot model is explained in the
[Redux Implementing Undo History recipe](https://redux.js.org/recipes/implementing-undo-history).

---

## License

MIT — see [LICENSE.md](./LICENSE.md).

Forked from [omnidan/redux-undo](https://github.com/omnidan/redux-undo) by
[Irfan Khan](https://github.com/irfank).
