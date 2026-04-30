# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.1.0-alpha.1](https://github.com/khanzzirfan/redux-undo-slim/compare/rc-2.1.0-alpha.0...rc-2.1.0-alpha.1) (2026-04-30)


### Bug Fixes

* updated standardversoin script ([e3f1695](https://github.com/khanzzirfan/redux-undo-slim/commit/e3f1695e63fa04c1d23d06e4ae80edb591baf339))

## 2.1.0-alpha.0 (2026-04-30)


### Features

* **build:** Adding UMD support ([b994c08](https://github.com/khanzzirfan/redux-undo-slim/commit/b994c08fe5e4d336068ddcd236394c7b076509d0))
* **bump:** 1.0.0-beta7 ([d2c8d3b](https://github.com/khanzzirfan/redux-undo-slim/commit/d2c8d3b6b2a34ba58111b3e4d888a16ffc9c6a85))
* **lint:** Adding webpack.config into lint ([8de5726](https://github.com/khanzzirfan/redux-undo-slim/commit/8de5726d38a6be64be705e56d2c1b979440b65bc))
* **readme:** Adding note about commonsjs/es/umd ([e4c267d](https://github.com/khanzzirfan/redux-undo-slim/commit/e4c267d0e33f721178c6b0745ca115ae0915a108))
* **readme:** Move note to top ([4f58310](https://github.com/khanzzirfan/redux-undo-slim/commit/4f583102a19a511608ceaf13d1ea07f1f04ba198))
* **slim:** redux slim changes updated ([3e720ec](https://github.com/khanzzirfan/redux-undo-slim/commit/3e720ecd0c1e31812a3fb76ad1bbe3fcd8183bbd))
* US-001 - Add Immer peer dependency and types ([a1f7e52](https://github.com/khanzzirfan/redux-undo-slim/commit/a1f7e5270655e410f684dfedd5ffa9bd7acc072a))
* US-002 - Add enablePatches and stub helpers ([d265301](https://github.com/khanzzirfan/redux-undo-slim/commit/d265301c05c8f0be18bc7e139146f235ce701ec5))


### Bug Fixes

* added new changes ([0f9cc93](https://github.com/khanzzirfan/redux-undo-slim/commit/0f9cc93ea4b5146e10a61150d48d1a66ba38481f))
* added new changes ([7e127a7](https://github.com/khanzzirfan/redux-undo-slim/commit/7e127a722f2430e49fe0b73ce3e131296b3451e2))
* added ralph tasks ([825ef1b](https://github.com/khanzzirfan/redux-undo-slim/commit/825ef1bb233ea5a6d57ed0cb5518fdcc8242055b))
* published packages ([32cdce2](https://github.com/khanzzirfan/redux-undo-slim/commit/32cdce23671638330f5fffb69cf54795744901ba))
* **readme:** UMD note ([e5e745a](https://github.com/khanzzirfan/redux-undo-slim/commit/e5e745a45ef4c2be79aadabc5025c05821fe8391))
* updated github workflow ([5cd99c2](https://github.com/khanzzirfan/redux-undo-slim/commit/5cd99c2317c0146c7ed63f0151f39ea7b80a77c3))
* updated redux slim ([0952b13](https://github.com/khanzzirfan/redux-undo-slim/commit/0952b13cedd4e05d428027f66d05865ddef0afc7))
* updated specs ([3d71655](https://github.com/khanzzirfan/redux-undo-slim/commit/3d7165577cb124c1278fb89041349b1a40e590d1))
* updated standardversoin script ([cd8819c](https://github.com/khanzzirfan/redux-undo-slim/commit/cd8819c205d744a6d8864b56cd22c0c7d7ed515f))

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