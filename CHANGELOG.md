# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-04-28

### ⚠️ Breaking Changes

The v2.0.0 release introduces a completely rewritten history management system based on Immer patches instead of full state snapshots.

| v1.x API | v2.0.0 API |
|---------|-----------|
| `state.past` | Not available in patch mode. Use `materializeHistory(state, initialState).past` |
| `state.future` | Not available in patch mode. Use `materializeHistory(state, initialState).future` |
| `state.index` | `state.cursor` (position in stack) |
| `state.limit` | Removed (replaced by `limit` option) |
| `.present` | `.present` (same) |

### State Shape Change

**v1.x (Snapshot Mode)**
```typescript
interface History<S> {
  past: S[];
  present: S;
  future: S[];
  _latestUnfiltered?: S;
  group?: string | number;
  index: number;
  limit: number;
}
```

**v2.0.0 (Patch Mode)**
```typescript
interface PatchHistory<S> {
  present: S;
  stack: OpEntry<S>[];
  cursor: number;
  _latestUnfiltered?: S;
  group?: string | number;
}

interface OpEntry<S> {
  p: Patch[];      // forward patches
  ip: Patch[];     // inverse patches
  src?: 'immer' | 'diff';
  g?: string | number;
}
```

### New Features

#### `patchMode` Option

```typescript
import undoable from 'redux-undo-slim'

// Default: snapshot mode (backward compatible with v1.x)
undoable(reducer, { patchMode: 'snapshot' })

// Immer patch mode - stores patches, not full snapshots
undoable(reducer, { patchMode: 'immer' })

// RFC 6902 JSON Patch mode - works with plain reducers
undoable(reducer, { patchMode: 'diff' })
```

#### New Helper Functions

| Helper | Description |
|--------|-------------|
| `canUndo(history)` | Returns `true` if undo is possible |
| `canRedo(history)` | Returns `true` if redo is possible |
| `pastLength(history)` | Returns number of past entries |
| `futureLength(history)` | Returns number of future entries |
| `materializeHistory(history, initialState?)` | Reconstructs full `past`/`present`/`future` arrays |

#### Migration from v1.x

```typescript
// v1.x
const state = store.getState()
const previousStates = state.past

// v2.0.0 with patchMode: 'snapshot' (same behavior)
const state = store.getState()
const previousStates = state.past

// v2.0.0 with patchMode: 'immer'
const { past, present, future } = materializeHistory(state, initialState)
```

### Dependencies

- `immer` is now a **peer dependency** (required for `patchMode: 'immer'`)
- `fast-json-patch` is an **optional peer dependency** (required for `patchMode: 'diff'`)
- `typescript` is now a **dev dependency** (for type checking)

### Dev Dependencies

- `vitest` for testing
- `vite` for building
- `typescript` for type checking
- `eslint` for linting

### Bundle Size

With patch mode, the bundle size is significantly reduced:
- v1.x: ~15 KB gzipped (full snapshots in memory)
- v2.0.0: <5 KB gzipped (patches only, Immer is a peer dep)

---

## [1.0.1] - 2024-01-15

Last stable release of the original `redux-undo` package.

### Features
- Undo/redo with full state snapshots
- Jump to past/future
- Filtering via `includeAction`/`excludeAction`
- Grouping actions
- Limit history size