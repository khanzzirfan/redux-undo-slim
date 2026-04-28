# Tech Stack — redux-undo-slim

## Language & Runtime

| Concern          | Choice           | Notes                                          |
|------------------|------------------|------------------------------------------------|
| Language         | TypeScript 5.x   | All `src/` files are `.ts`; no `.js` in source |
| Target           | ES2020           | Vite lib build targets modern bundlers         |
| Package manager  | npm              | Single-package repo, no workspaces             |

## Build

| Concern    | Choice      | Notes                                                        |
|------------|-------------|--------------------------------------------------------------|
| Bundler    | Vite 4.x    | `vite build` — lib mode, dual ESM + UMD output              |
| ESM output | `dist/redux-undo-slim.mjs` | Tree-shakeable, for modern bundlers       |
| UMD output | `dist/redux-undo-slim.umd.js` | For CJS / browser `<script>` consumers  |
| Types      | `typings.d.ts` | Hand-maintained declaration file                           |
| Entry      | `src/index.ts` | Configured in `vite.config.ts` lib entry                  |

### `vite.config.ts` key settings

```ts
build: {
  lib: {
    entry: './src/index.ts',   // ← needs update from index.js
    name: 'ReduxUndoSlim'
  }
}
```

> Note: `vite.config.ts` still references `index.js`. Update to `index.ts` before
> next build.

## Testing

| Concern        | Choice                        | Notes                                    |
|----------------|-------------------------------|------------------------------------------|
| Test runner    | Vitest 0.32.x                 | `npm test` = `vitest run`                |
| Watch mode     | `npm run test:watch`          | `vitest` (no `run` flag)                 |
| Coverage       | Istanbul (`@vitest/coverage-istanbul`) | `npm run test:cov`              |
| Coverage report | `text` + `lcov`              | `lcov.info` for Coveralls                |
| Test location  | `test/*.spec.js`              | Co-located in `test/` directory          |
| Test language  | JavaScript (`.spec.js`)       | No TypeScript compilation in test files  |

### Test scripts

```
npm test          — single run, fail fast
npm run test:watch — interactive watch mode
npm run test:cov  — run + coverage report
npm run test:bail — watch mode, stop on first failure
```

## Linting

| Concern | Choice | Notes |
|---------|--------|-------|
| Linter  | ESLint 8.x | `npx eslint src test` |
| Plugins | `eslint-plugin-import`, `eslint-plugin-node`, `eslint-plugin-promise`, `eslint-plugin-standard` | |
| Style   | `eslint-config-standard` | Standard JS style rules |

## Dependencies

### Peer dependencies

| Package         | Version  | Required | Purpose                              |
|-----------------|----------|----------|--------------------------------------|
| `immer`         | `>=10.0.0` | Yes    | `produceWithPatches`, `applyPatches`, `enablePatches` |
| `fast-json-patch` | any    | No       | `patchMode: 'diff'` only             |

### Dev dependencies (notable)

| Package   | Version | Purpose                     |
|-----------|---------|-----------------------------|
| `redux`   | `^5`    | Peer dep under test         |
| `immer`   | `^11.0.0` | Installed locally for tests |
| `vite`    | `^4.3.0` | Build                      |
| `vitest`  | `^0.32.2` | Test runner               |

## Source Structure

```
src/
  index.ts          — package entry point, re-exports all public API, calls enablePatches()
  types.ts          — OpEntry, PatchHistory, History, UndoableConfig, all action types
  actions.ts        — ActionTypes constant, ActionCreators object, action creator functions
  helpers.ts        — newHistory, newPatchHistory, isPatchHistory, isHistory,
                      canUndo, canRedo, pastLength, futureLength, materializeHistory,
                      includeAction, excludeAction, combineFilters, groupByActionTypes,
                      parseActions
  patch-helpers.ts  — applyUndo, applyRedo, insertOp, jumpOp, jumpToPastOp, jumpToFutureOp
  patch-reducer.ts  — patchModeReducer (immer + diff modes)
  reducer.ts        — undoable() — main export, snapshot mode + delegates to patchModeReducer
  debug.ts          — debug logging with grouped console output (opt-in via config.debug)

test/
  index.spec.js         — snapshot mode integration tests (existing)
  combineFilters.spec.js — combineFilters helper tests (existing)
  helpers.spec.js       — canUndo / canRedo unit tests
  patch-mode.spec.js    — immer mode integration tests

docs/
  architecture-immer-patches.md — full architecture design doc
  implementation-phases.md      — 12-phase implementation plan
  code-review.md                — review findings against architecture

specs/
  constitution/
    mission.md     — this package's purpose and scope
    tech-stack.md  — build, test, tooling (this file)
    roadmap.md     — feature phases and status
```

## Code Conventions

- All source files TypeScript; no `.js` in `src/`
- No `any` on public-facing types — use generics
- No inline `console.log` except behind `if (__DEBUG__)` guard in `debug.ts`
- `enablePatches()` called once at module load in `src/index.ts` only
- Action type strings namespaced `@@redux-undo/` to avoid collisions
- Exported functions use named exports; `undoable` is the default export
- `OpEntry.g` only set when group is non-null (use spread pattern)
- `patchModeReducer` instantiated once at `undoable()` construction time, not per-dispatch

## CI/CD

No CI pipeline configured yet. Intended:

- `dev` branch — feature development
- `master` branch — stable releases
- `npm test && npm run lint` must pass before merge
- Publish to npm via `npm publish` on version tag
