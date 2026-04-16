/* eslint-disable no-unused-expressions */
import { describe, expect, it } from 'vitest'
import { createStore } from 'redux'
import undoable, { ActionCreators, isPatchHistory, canUndo, canRedo, isHistory, pastLength, futureLength } from '../src/index'

function includeAction (rawActions: string | string[]): (action: { type: string }) => boolean {
  const actions = Array.isArray(rawActions) ? rawActions : [rawActions]
  return (action) => actions.indexOf(action.type) >= 0
}

function groupByActionTypes (rawActions: string | string[]): (action: { type: string }) => string | null {
  const actions = Array.isArray(rawActions) ? rawActions : [rawActions]
  return (action) => actions.indexOf(action.type) >= 0 ? action.type : null
}

describe('Immer patch mode', () => {
  describe('patchMode: snapshot (default)', () => {
    const counterReducer = (state = 0, action) => {
      switch (action.type) {
        case 'INCREMENT':
          return state + 1
        default:
          return state
      }
    }

    it('should still work with default snapshot mode', () => {
      const undoableCounter = undoable(counterReducer)
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(isHistory(state)).to.be.true
      expect(isPatchHistory(state)).to.be.false
    })

    it('should support pastLength and futureLength helpers for snapshot mode', () => {
      const undoableCounter = undoable(counterReducer)
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(state.past.length).to.equal(3)
      expect(state.future.length).to.equal(0)
    })

    it('should migrate from snapshot to patch mode', () => {
      const snapshotReducer = undoable(counterReducer, { limit: 5 })
      const store = createStore(snapshotReducer)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(state.past).to.deep.equal([0, 1])
      expect(state.present).to.equal(2)
    })
  })

  describe('patchMode: immer', () => {
    const counterReducer = (state = 0, action) => {
      switch (action.type) {
        case 'INCREMENT':
          return state + 1
        case 'DECREMENT':
          return state - 1
        default:
          return state
      }
    }

    const undoableCounter = undoable(counterReducer, {
      patchMode: 'immer'
    })

    it('should use PatchHistory structure', () => {
      const store = createStore(undoableCounter)
      const state = store.getState()
      expect(isPatchHistory(state)).to.be.true
      expect(state.stack).to.be.an('array')
      expect(typeof state.cursor).to.equal('number')
    })

    it('should initially have empty stack and cursor at 0', () => {
      const store = createStore(undoableCounter)
      const state = store.getState()
      expect(state.stack.length).to.equal(0)
      expect(state.cursor).to.equal(0)
    })

    it('should increment state and add entry to stack', () => {
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(state.present).to.equal(1)
      expect(state.stack.length).to.equal(1)
      expect(state.cursor).to.equal(1)
    })

    it('should support undo', () => {
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      expect(store.getState().present).to.equal(3)
      store.dispatch(ActionCreators.undo())
      expect(store.getState().present).to.equal(2)
    })

    it('should support redo', () => {
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch(ActionCreators.undo())
      expect(store.getState().present).to.equal(2)
      store.dispatch(ActionCreators.redo())
      expect(store.getState().present).to.equal(3)
    })

    it('should support canUndo and canRedo', () => {
      const store = createStore(undoableCounter)
      let state = store.getState()
      expect(canUndo(state)).to.be.false
      expect(canRedo(state)).to.be.false
      store.dispatch({ type: 'INCREMENT' })
      state = store.getState()
      expect(canUndo(state)).to.be.true
      expect(canRedo(state)).to.be.false
      store.dispatch(ActionCreators.undo())
      state = store.getState()
      expect(canUndo(state)).to.be.false
      expect(canRedo(state)).to.be.true
    })

    it('should support jump', () => {
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch(ActionCreators.undo())
      expect(store.getState().present).to.equal(2)
      store.dispatch(ActionCreators.jump(1))
      expect(store.getState().present).to.equal(3)
      store.dispatch(ActionCreators.jump(-1))
      expect(store.getState().present).to.equal(2)
    })

    it('should support clearHistory', () => {
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      let state = store.getState()
      expect(state.stack.length).to.equal(3)
      store.dispatch(ActionCreators.clearHistory())
      state = store.getState()
      expect(state.stack.length).to.equal(0)
      expect(state.cursor).to.equal(0)
    })

    it('should handle filter option', () => {
      const counterWithFilter = undoable(counterReducer, {
        patchMode: 'immer',
        filter: includeAction(['INCREMENT'])
      })
      const store = createStore(counterWithFilter)
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(state.present).to.equal(1)
      expect(state.stack.length).to.equal(1)
    })

    it('should respect limit option', () => {
      const limitedCounter = undoable(counterReducer, {
        patchMode: 'immer',
        limit: 3
      })
      const store = createStore(limitedCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(state.stack.length).to.equal(3)
      expect(state.cursor).to.equal(3)
    })

    it('should handle groupBy option', () => {
      const groupedCounter = undoable(counterReducer, {
        patchMode: 'immer',
        groupBy: groupByActionTypes(['INCREMENT'])
      })
      const store = createStore(groupedCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(state.stack.length).to.equal(1)
      expect(state.present).to.equal(3)
    })

    it('should support pastLength and futureLength helpers', () => {
      const undoableCounter = undoable(counterReducer, { patchMode: 'immer' })
      const store = createStore(undoableCounter)
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      store.dispatch({ type: 'INCREMENT' })
      const state = store.getState()
      expect(pastLength(state)).to.equal(3)
      expect(futureLength(state)).to.equal(0)
    })
  })
})