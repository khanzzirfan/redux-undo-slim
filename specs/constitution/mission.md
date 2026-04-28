# Mission — redux-undo-slim

## Vision

`redux-undo-slim` is a memory-efficient undo/redo higher-order reducer for Redux.
It replaces the classic full-snapshot history model with immer patch pairs — storing
only what changed per step — so large state trees do not balloon memory with every
user action.

## Problem We Solve

Classic `redux-undo` stores a full deep copy of state for every history step.
For non-trivial states (document editors, canvas tools, form builders) this becomes
the dominant memory consumer:

| History limit | State size | Classic cost | Patch cost (typical) |
|---|---|---|---|
| 50 steps | 100 KB | ~10 MB | ~110 KB |
| 50 steps | 1 MB | ~101 MB | ~350 KB |
| 100 steps | 10 MB | ~2 GB | ~10 MB |

`redux-undo-slim` solves this by storing only immer `Patch[]` pairs per step and
keeping a single materialized `present` state. Undo/redo applies patches forward
or backward — no snapshot copies needed.

## Target Audience

- **Primary**: Developers building Redux-powered editors, design tools, or any
  application with large state and deep undo/redo history requirements.
- **Secondary**: Existing `redux-undo` users seeking a drop-in upgrade with reduced
  memory overhead.
- **Internal**: Irfan Khan maintaining and extending the package.

## Scope

### In Scope

- Higher-order reducer (`undoable`) that wraps any Redux reducer
- Three patch modes: `snapshot` (backward compat), `immer`, `diff`
- `PatchHistory<T>` state shape: `present`, `stack`, `cursor`
- Undo, redo, jump, jumpToPast, jumpToFuture, clearHistory operations
- Filter support (`filter`, `includeAction`, `excludeAction`, `combineFilters`)
- Group support (`groupBy`, `groupByActionTypes`) with patch-level merge
- History limit with stack trimming
- TypeScript types exported from the package
- ESM + UMD dual build via Vite
- Vitest test suite

### Out of Scope

- React bindings (use `react-redux` selectors directly)
- DevTools integration
- Persistence / serialisation helpers
- Server-side rendering concerns
- Any frontend UI components

## Success Criteria

1. `patchMode: 'immer'` uses < 5% memory of `patchMode: 'snapshot'` for a
   100 KB state / 50-step history benchmark.
2. All existing `snapshot` mode tests pass with zero regression.
3. Filter, groupBy, limit, and jump operations behave identically across all
   three patch modes.
4. Package ships typed — no consumer needs to add `@types/redux-undo-slim`.
5. Bundle size (ESM, minified + gzip) stays under 5 KB.

## Constraints

- Must remain a zero-runtime-dependency package (immer is a peer dep, not bundled)
- `patchMode: 'snapshot'` must be the default — no breaking change for existing consumers
- TypeScript strict mode throughout `src/`
- No `.js` source files in `src/` — TypeScript only
- Test files may remain `.spec.js` for now
