# Validation — Phase 2.0: Patch Mode Production Ready

## Automated Test Suite

All checks run via `npm test`. Must be 100% green before merge to `master`.

### Existing tests — must not regress

```bash
npm test
```

Expected: `test/index.spec.js` and `test/combineFilters.spec.js` pass without change.
These cover snapshot mode end-to-end. Any failure = regression introduced.

### New tests — must pass

```bash
npm test -- --reporter=verbose
```

Expected new passing suites:
- `test/patch-helpers.spec.js`
- `test/patch-filter.spec.js`
- `test/patch-limit.spec.js`

---

## Test Coverage Gate

```bash
npm run test:cov
```

Expected: line coverage ≥ 85% across `src/`.
Check report at `coverage/index.html` — verify `patch-helpers.ts`, `patch-reducer.ts`,
`helpers.ts` are not red.

---

## Build Verification

```bash
npm run build
```

Expected output (no errors, no warnings about missing entry):
```
dist/redux-undo-slim.mjs        — ESM bundle
dist/redux-undo-slim.umd.js     — UMD bundle
```

Verify immer is NOT bundled:
```bash
grep -c "enablePatches" dist/redux-undo-slim.mjs
```
Expected: `0` — immer code must not appear in the output.

Bundle size check:
```bash
gzip -c dist/redux-undo-slim.mjs | wc -c
```
Expected: < 5120 bytes (5 KB gzipped).

---

## Functional Spot Checks

### 1. Snapshot mode unchanged

```js
import undoable, { ActionCreators } from './dist/redux-undo-slim.mjs'
import { createStore } from 'redux'

const counter = (s = 0, a) => a.type === 'INC' ? s + 1 : s
const store = createStore(undoable(counter))  // default patchMode: 'snapshot'

store.dispatch({ type: 'INC' })
store.dispatch({ type: 'INC' })
store.dispatch(ActionCreators.undo())
console.assert(store.getState().present === 1, 'undo failed')
console.assert(store.getState().past.length === 1, 'past wrong')
```

### 2. Immer patch mode — memory shape

```js
const store = createStore(undoable(counter, { patchMode: 'immer' }))
store.dispatch({ type: 'INC' })
store.dispatch({ type: 'INC' })
store.dispatch({ type: 'INC' })

const s = store.getState()
console.assert(s.stack.length === 3, 'stack should have 3 ops')
console.assert(s.cursor === 3, 'cursor should be 3')
console.assert(!Array.isArray(s.past), 'no past array in patch mode')

store.dispatch(ActionCreators.undo())
console.assert(store.getState().present === 2, 'undo failed')
console.assert(store.getState().cursor === 2, 'cursor should be 2')

store.dispatch(ActionCreators.redo())
console.assert(store.getState().present === 3, 'redo failed')
```

### 3. `materializeHistory` reconstructs timeline

```js
import { materializeHistory } from './dist/redux-undo-slim.mjs'

// Build up 3-step immer history
const store = createStore(undoable(counter, { patchMode: 'immer' }))
store.dispatch({ type: 'INC' })  // 0 → 1
store.dispatch({ type: 'INC' })  // 1 → 2
store.dispatch({ type: 'INC' })  // 2 → 3
store.dispatch(ActionCreators.undo())  // cursor back to 2

const { past, present, future } = materializeHistory(store.getState(), 0)
console.assert(past.length === 2, 'past should have 2 entries')
console.assert(past[0] === 0, 'past[0] should be initial 0')
console.assert(past[1] === 1, 'past[1] should be 1')
console.assert(present === 2, 'present should be 2')
console.assert(future.length === 1, 'future should have 1 entry')
console.assert(future[0] === 3, 'future[0] should be 3')
```

### 4. `diff` mode undo/redo correctness

```js
const store = createStore(undoable(counter, { patchMode: 'diff' }))
store.dispatch({ type: 'INC' })
store.dispatch({ type: 'INC' })

const op = store.getState().stack[0]
console.assert(op.src === 'diff', 'op.src should be diff')

store.dispatch(ActionCreators.undo())
console.assert(store.getState().present === 1, 'undo failed in diff mode')

store.dispatch(ActionCreators.redo())
console.assert(store.getState().present === 2, 'redo failed in diff mode')
```

### 5. Filter — excluded action absent from stack

```js
import { excludeAction } from './dist/redux-undo-slim.mjs'

const counter2 = (s = 0, a) => {
  if (a.type === 'INC') return s + 1
  if (a.type === 'TICK') return s + 0.01
  return s
}
const store = createStore(undoable(counter2, {
  patchMode: 'immer',
  filter: excludeAction('TICK')
}))

store.dispatch({ type: 'INC' })   // stack entry
store.dispatch({ type: 'TICK' })  // filtered — no stack entry
store.dispatch({ type: 'INC' })   // stack entry

console.assert(store.getState().stack.length === 2, 'stack should have 2 entries')
console.assert(Math.abs(store.getState().present - 2.01) < 0.001, 'present includes TICK')

store.dispatch(ActionCreators.undo())
console.assert(Math.abs(store.getState().present - 1.01) < 0.001, 'undo skips back 1 INC')
```

### 6. `src/` has no `.js` files

```bash
ls src/*.js 2>/dev/null && echo "FAIL — js files remain" || echo "PASS"
```
Expected: `PASS`

---

## Checklist

- [ ] `npm test` — 100% green, no regressions
- [ ] `npm run test:cov` — ≥ 85% line coverage
- [ ] `npm run build` — no errors, both output files present
- [ ] `gzip dist/redux-undo-slim.mjs` — < 5 KB
- [ ] immer NOT bundled in output
- [ ] `src/*.js` — zero `.js` files remain
- [ ] Snapshot mode spot check passes (check 1)
- [ ] Immer mode spot check passes (check 2)
- [ ] `materializeHistory` spot check passes (check 3)
- [ ] `diff` mode spot check passes (check 4)
- [ ] Filter spot check passes (check 5)
- [ ] `CHANGELOG.md` exists and documents v2.0.0 breaking changes
- [ ] `typings.d.ts` exports `PatchHistory<T>`, `OpEntry`, new helpers
- [ ] Roadmap Phase 2.0 items marked `[x]`
- [ ] `npm run lint` — no errors
