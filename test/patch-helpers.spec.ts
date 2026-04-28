import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'redux'
import undoable, { ActionCreators, materializeHistory } from '../src/index'
import { applyUndo, applyRedo, insertOp, jumpOp, jumpToPastOp, jumpToFutureOp } from '../src/patch-helpers'
import { newPatchHistory } from '../src/helpers'
import type { Patch } from 'immer'

const counterReducer = (s = 0, a: { type: string }) => {
  if (a.type === 'INC') return s + 1
  if (a.type === 'DEC') return s - 1
  return s
}

describe('patch-helpers', () => {
  describe('insertOp', () => {
    it('clears redo entries when cursor < stack.length', () => {
      const history = newPatchHistory(2, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 2 }] },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }] },
      ], 1)

      const patch: Patch[] = [{ op: 'replace', path: '', value: 3 }]
      const inversePatch: Patch[] = [{ op: 'replace', path: '', value: 2 }]

      const result = insertOp(history, patch, inversePatch, null, undefined, 'immer')

      expect(result.stack.length).toBe(2)
      expect(result.cursor).toBe(2)
      expect(result.stack[1].p[0].value).toBe(3)
    })

    it('respects limit - stack trimmed, cursor capped', () => {
      const history = newPatchHistory(3, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }] },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }] },
      ], 2)

      const patch: Patch[] = [{ op: 'replace', path: '', value: 4 }]
      const inversePatch: Patch[] = [{ op: 'replace', path: '', value: 3 }]

      const result = insertOp(history, patch, inversePatch, null, 3, 'immer')

      expect(result.stack.length).toBe(3)
      expect(result.cursor).toBe(3)
    })
  })

  describe('applyUndo', () => {
    it('returns same history reference when cursor is 0', () => {
      const history = newPatchHistory(0, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }] },
      ], 0)

      const result = applyUndo(history)

      expect(result).toBe(history)
    })

    it('returns same history reference when cursor is at stack.length', () => {
      const history = newPatchHistory(1, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }] },
      ], 1)

      const result = applyRedo(history)

      expect(result).toBe(history)
    })

    it('applies inverse patches and decrements cursor', () => {
      const history = newPatchHistory(2, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 2)

      const result = applyUndo(history)

      expect(result.present).toBe(1)
      expect(result.cursor).toBe(1)
    })
  })

  describe('applyRedo', () => {
    it('applies forward patches and increments cursor', () => {
      const history = newPatchHistory(1, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 1)

      const result = applyRedo(history)

      expect(result.present).toBe(2)
      expect(result.cursor).toBe(2)
    })
  })

  describe('round-trip', () => {
    it('undo then redo returns to identical present', () => {
      const history = newPatchHistory(2, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 2)

      const undone = applyUndo(history)
      const redone = applyRedo(undone)

      expect(redone.present).toBe(2)
    })
  })

  describe('jumpOp', () => {
    it('jump(0) returns same history reference', () => {
      const history = newPatchHistory(1, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
      ], 1)

      const result = jumpOp(history, 0)

      expect(result).toBe(history)
    })

    it('jump(-1) produces same present as applyUndo', () => {
      const history = newPatchHistory(2, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 2)

      const jumpResult = jumpOp(history, -1)
      const undoResult = applyUndo(history)

      expect(jumpResult.present).toBe(undoResult.present)
      expect(jumpResult.cursor).toBe(undoResult.cursor)
    })

    it('jump(+1) produces same present as applyRedo', () => {
      const history = newPatchHistory(1, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 1)

      const jumpResult = jumpOp(history, 1)
      const redoResult = applyRedo(history)

      expect(jumpResult.present).toBe(redoResult.present)
      expect(jumpResult.cursor).toBe(redoResult.cursor)
    })

    it('jump(-1) decrements cursor', () => {
      const history = newPatchHistory(2, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 2)

      const result = jumpOp(history, -1)

      expect(result.cursor).toBe(1)
    })
  })

  describe('jumpToPastOp', () => {
    it('jumpToPast(0) reaches oldest past entry (index 0)', () => {
      const history = newPatchHistory(2, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 2)

      const result = jumpToPastOp(history, 0)

      expect(result.present).toBe(0)
      expect(result.cursor).toBe(0)
    })
  })

  describe('jumpToFutureOp', () => {
    it('jumpToFuture(0) reaches first redo step', () => {
      const history = newPatchHistory(1, [
        { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
        { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
      ], 1)

      const result = jumpToFutureOp(history, 0)

      expect(result.present).toBe(2)
      expect(result.cursor).toBe(2)
    })
  })
})

describe('patch-filter', () => {
  it('excluded action does not appear in stack', () => {
    const store = createStore(undoable(counterReducer, { patchMode: 'immer', filter: (action) => action.type !== 'TICK' }))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'TICK' })
    store.dispatch({ type: 'INC' })

    const state = store.getState() as any
    expect(state.stack.length).toBe(2)
  })

  it('excluded action still updates present', () => {
    const counterWithTick = (s = 0, a: { type: string }) => {
      if (a.type === 'INC') return s + 1
      if (a.type === 'TICK') return s + 0.01
      return s
    }

    const store = createStore(undoable(counterWithTick, { patchMode: 'immer', filter: (action) => action.type !== 'TICK' }))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'TICK' })
    store.dispatch({ type: 'INC' })

    const state = store.getState() as any
    expect(Math.abs(state.present - 2.01)).toBeLessThan(0.001)
  })

  it('undo after excluded action returns to pre-filter present', () => {
    const counterWithTick = (s = 0, a: { type: string }) => {
      if (a.type === 'INC') return s + 1
      if (a.type === 'TICK') return s + 0.01
      return s
    }

    const store = createStore(undoable(counterWithTick, { patchMode: 'immer', filter: (action) => action.type !== 'TICK' }))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'TICK' })
    store.dispatch({ type: 'INC' })

    store.dispatch(ActionCreators.undo())
    store.dispatch(ActionCreators.undo())

    const state = store.getState() as any
    expect(Math.abs(state.present - 0)).toBeLessThan(0.001)
  })
})

describe('patch-limit', () => {
  it('undo works correctly after stack trim', () => {
    const store = createStore(undoable(counterReducer, { patchMode: 'immer', limit: 3 }))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })

    const stateBefore = store.getState() as any
    expect(stateBefore.stack.length).toBe(3)
    expect(stateBefore.cursor).toBe(3)

    store.dispatch(ActionCreators.undo())
    store.dispatch(ActionCreators.undo())
    store.dispatch(ActionCreators.undo())

    const stateAfter = store.getState() as any
    expect(stateAfter.present).toBe(2)
  })

  it('cursor equals limit after overflow', () => {
    const store = createStore(undoable(counterReducer, { patchMode: 'immer', limit: 3 }))

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })

    const state = store.getState() as any
    expect(state.cursor).toBe(3)
    expect(state.stack.length).toBe(3)
  })
})

describe('diff-mode round-trip', () => {
  it('undo then redo with diff src returns to identical present', () => {
    const history = newPatchHistory({ count: 2 }, [
      { p: [{ op: 'replace', path: '/count', value: 1 }], ip: [{ op: 'replace', path: '/count', value: 0 }], src: 'diff' },
      { p: [{ op: 'replace', path: '/count', value: 2 }], ip: [{ op: 'replace', path: '/count', value: 1 }], src: 'diff' },
    ], 2)

    const undone = applyUndo(history)
    expect(undone.present.count).toBe(1)
    expect(undone.cursor).toBe(1)

    const redone = applyRedo(undone)
    expect(redone.present.count).toBe(2)
    expect(redone.cursor).toBe(2)
  })
})

describe('materializeHistory', () => {
  it('converts PatchHistory to snapshot history format with initialState', () => {
    const history = newPatchHistory(2, [
      { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
      { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
    ], 2)

    const result = materializeHistory(history, 0)

    expect(result.past).toEqual([0, 1])
    expect(result.present).toBe(2)
    expect(result.future).toEqual([])
  })

  it('includes future entries after cursor', () => {
    const history = newPatchHistory(1, [
      { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
      { p: [{ op: 'replace', path: '', value: 2 }], ip: [{ op: 'replace', path: '', value: 1 }], src: 'immer' },
    ], 1)

    const result = materializeHistory(history, 0)

    expect(result.past).toEqual([0])
    expect(result.present).toBe(1)
    expect(result.future).toEqual([2])
  })

  it('throws when initialState not provided for PatchHistory', () => {
    const history = newPatchHistory(2, [
      { p: [{ op: 'replace', path: '', value: 1 }], ip: [{ op: 'replace', path: '', value: 0 }], src: 'immer' },
    ], 1)

    expect(() => materializeHistory(history as any)).toThrow('materializeHistory requires initialState')
  })
})

describe('grouped-op undo/redo', () => {
  it('undo reverts entire grouped operation', () => {
    const groupedCounter = undoable(counterReducer, {
      patchMode: 'immer',
      groupBy: (action) => action.type === 'INC' || action.type === 'DEC' ? 'arith' : null
    })
    const store = createStore(groupedCounter)

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })

    const stateBefore = store.getState() as any
    expect(stateBefore.stack.length).toBe(1)
    expect(stateBefore.present).toBe(3)

    store.dispatch(ActionCreators.undo())
    const stateAfter = store.getState() as any
    expect(stateAfter.present).toBe(0)
    expect(stateAfter.cursor).toBe(0)
  })

  it('redo reapplies entire grouped operation', () => {
    const groupedCounter = undoable(counterReducer, {
      patchMode: 'immer',
      groupBy: (action) => action.type === 'INC' || action.type === 'DEC' ? 'arith' : null
    })
    const store = createStore(groupedCounter)

    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })

    store.dispatch(ActionCreators.undo())
    store.dispatch(ActionCreators.redo())

    const state = store.getState() as any
    expect(state.present).toBe(3)
    expect(state.cursor).toBe(1)
  })
})