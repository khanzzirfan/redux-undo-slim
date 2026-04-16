import { describe, expect, it, beforeAll } from 'vitest'
import { createStore } from 'redux'
import undoable, { ActionCreators, ActionTypes, excludeAction, includeAction, isHistory } from '../src/index'

const decrementActions = ['DECREMENT']

runTests('Default config')
runTests('Never skip reducer', {
  undoableConfig: {
    neverSkipReducer: true
  }
})
runTests('No Init types', {
  undoableConfig: {
    initTypes: []
  },
  testConfig: {
    checkSlices: true
  }
})
runTests('Initial State equals 100', {
  undoableConfig: {
    limit: 200
  },
  initialStoreState: 100,
  testConfig: {
    checkSlices: true
  }
})
runTests('Initial State that looks like a history', {
  undoableConfig: {},
  initialStoreState: { present: 0 },
  testConfig: {
    checkSlices: true
  }
})
runTests('Filter (Include Actions)', {
  undoableConfig: {
    filter: includeAction(decrementActions)
  },
  testConfig: {
    includeActions: decrementActions
  }
})
runTests('Initial History and Filter (Exclude Actions)', {
  undoableConfig: {
    limit: 100,
    initTypes: 'RE-INITIALIZE',
    filter: excludeAction(decrementActions)
  },
  initialStoreState: {
    past: [0, 1, 2, 3],
    present: 4,
    future: [5, 6, 7]
  },
  testConfig: {
    excludedActions: decrementActions,
    checkSlices: true
  }
})
runTests('Initial State and Init types', {
  undoableConfig: {
    limit: 1024,
    initTypes: 'RE-INITIALIZE'
  },
  initialStoreState: {
    past: [123],
    present: 5,
    future: [-1, -2, -3]
  },
  testConfig: {
    checkSlices: true
  }
})
runTests('Array as clearHistoryType', {
  undoableConfig: {
    clearHistoryType: ['TYPE_1', 'TYPE_2']
  },
  testConfig: {
    checkSlices: true
  }
})
runTests('Erroneous configuration', {
  undoableConfig: {
    limit: -1,
    initTypes: []
  },
  initialStoreState: {
    past: [5, {}, 3, null, 1],
    present: Math.pow(2, 32),
    future: []
  },
  testConfig: {
    checkSlices: true
  }
})
runTests('Get Slices', {
  testConfig: {
    checkSlices: true
  }
})
runTests('Group By', {
  undoableConfig: {
    groupBy: (action: { group?: string }) => action.group ?? null
  },
  testConfig: {
    checkSlices: true
  }
})

interface TestConfig {
  checkSlices?: boolean
  excludedActions?: string[]
  includeActions?: string[]
}

function runTests (
  label: string,
  { undoableConfig = {}, initialStoreState, testConfig }: { undoableConfig?: Record<string, unknown>; initialStoreState?: unknown; testConfig?: TestConfig } = {}
): void {
  describe('Undoable: ' + label, () => {
    let wasCalled = false

    const countReducer = (state = 0, action = {}) => {
      switch (action.type) {
        case ActionTypes.UNDO:
        case ActionTypes.REDO:
          wasCalled = true
          return state
        case 'INCREMENT':
          return state + 1
        case 'DECREMENT':
          return state - 1
        default:
          return state
      }
    }

    let mockUndoableReducer: ReturnType<typeof undoable>
    let mockInitialState: ReturnType<typeof mockUndoableReducer>
    let incrementedState: ReturnType<typeof mockUndoableReducer>
    let store: ReturnType<typeof createStore>

    beforeAll(() => {
      mockUndoableReducer = undoable(countReducer, undoableConfig)
      store = createStore(mockUndoableReducer, initialStoreState)

      mockInitialState = mockUndoableReducer(undefined as unknown as Parameters<typeof mockUndoableReducer>[0], {} as Parameters<typeof mockUndoableReducer>[1])
      incrementedState = mockUndoableReducer(mockInitialState, { type: 'INCREMENT' })
      console.info('  Beginning Test! Good luck!')
      console.info('    initialStoreState:     ', initialStoreState)
      console.info('    store.getState():      ', store.getState())
      console.info('    mockInitialState:      ', mockInitialState)
      console.info('    incrementedState:      ', incrementedState)
      console.info('')

      expect(store.getState()).to.deep.equal(mockInitialState, 'mockInitialState should be the same as our store\'s state')
    })

    describe('Initial state', () => {
      it('should be initialized with the value of the default `initialState` of the reducer if there is no `initialState` set on the store', () => {
        if (initialStoreState === undefined) {
          expect(mockInitialState.present).to.equal(countReducer())
        }
      })

      it('should be initialized with the the store\'s initial `history` if provided', () => {
        if (initialStoreState !== undefined && isHistory(initialStoreState)) {
          const expected = {
            past: mockInitialState.past,
            present: mockInitialState.present,
            future: mockInitialState.future
          }
          const actual = {
            past: (initialStoreState as { past: unknown[] }).past,
            present: (initialStoreState as { present: unknown }).present,
            future: (initialStoreState as { future: unknown[] }).future
          }
          expect(expected).to.deep.equal(actual)
        }
      })

      it('should be initialized with the the store\'s initial `state` if provided', () => {
        if (initialStoreState !== undefined && !isHistory(initialStoreState)) {
          expect(mockInitialState).to.deep.equal({
            past: [],
            present: initialStoreState,
            _latestUnfiltered: initialStoreState,
            future: [],
            group: undefined,
            index: 0,
            limit: 1
          })
        }
      })
    })

    describe('Replace reducers on the fly', () => {
      const tenfoldReducer = (state = 10, action = {}) => {
        switch (action.type) {
          case 'INCREMENT':
            return state + 10
          case 'DECREMENT':
            return state - 10
          default:
            return state
        }
      }
      it('should preserve state when reducers are replaced', () => {
        store.replaceReducer(undoable(tenfoldReducer, undoableConfig))
        expect(store.getState()).to.deep.equal(mockInitialState)

        store.replaceReducer(mockUndoableReducer)
        expect(store.getState()).to.deep.equal(mockInitialState)
      })

      it('should use replaced reducer for new actions', () => {
        store.replaceReducer(undoable(tenfoldReducer, undoableConfig))

        let expectedResult = tenfoldReducer(store.getState().present, { type: 'INCREMENT' })
        store.dispatch({ type: 'INCREMENT' })
        expect(store.getState().present).to.equal(expectedResult)

        store.replaceReducer(mockUndoableReducer)

        expectedResult = countReducer(store.getState().present, { type: 'INCREMENT' })
        store.dispatch({ type: 'INCREMENT' })
        expect(store.getState().present).to.equal(expectedResult)
      })
    })

    describe('Actions', () => {
      it('should not record unwanted actions', () => {
        if (testConfig && testConfig.excludedActions) {
          const excludedAction = { type: testConfig.excludedActions[0] }
          const includedAction = { type: 'INCREMENT' }
          const notFilteredReducer = undoable(countReducer, { ...undoableConfig, filter: null })
          let expected = notFilteredReducer(mockInitialState, includedAction)
          let actual = mockUndoableReducer(mockInitialState, includedAction)
          expect(actual).to.deep.equal(expected)
          expected = {
            ...expected,
            present: notFilteredReducer(
              notFilteredReducer(expected, excludedAction),
              excludedAction
            ).present
          }
          actual = mockUndoableReducer(
            mockUndoableReducer(actual, excludedAction),
            excludedAction
          )
          expect(actual).to.deep.equal(expected)
        }

        if (testConfig && testConfig.includeActions) {
          const includedAction = { type: testConfig.includeActions[0] }
          const excludedAction = { type: 'INCREMENT' }
          const commonInitialState = mockUndoableReducer(mockInitialState, includedAction)

          const notFilteredReducer = undoable(countReducer, { ...undoableConfig, filter: null })
          let expected = notFilteredReducer(commonInitialState, includedAction)
          let actual = mockUndoableReducer(commonInitialState, includedAction)
          expect(actual).to.deep.equal(expected)
          expected = {
            ...expected,
            present: notFilteredReducer(expected, excludedAction).present
          }
          actual = mockUndoableReducer(actual, excludedAction)
          expect(actual).to.deep.equal(expected)
        }
      })

      it('should not record non state changing actions', () => {
        const dummyState = mockUndoableReducer(incrementedState, { type: 'DUMMY' })
        expect(dummyState).to.deep.equal(incrementedState)
      })

      it('should synchronize latest unfiltered state to present when filtering actions', () => {
        if (testConfig && testConfig.excludedActions) {
          const excludedAction = { type: testConfig.excludedActions[0] }

          const synchronizedFilteredReducer = undoable(countReducer, {
            ...undoableConfig,
            syncFilter: true
          })
          const unsynchronized = mockUndoableReducer(mockInitialState, excludedAction)
          const synchronized = synchronizedFilteredReducer(mockInitialState, excludedAction)
          expect(unsynchronized.present).to.deep.equal(synchronized.present)
          expect(unsynchronized._latestUnfiltered).to.not.deep.equal(synchronized._latestUnfiltered)
          expect(synchronized.present).to.deep.equal(synchronized._latestUnfiltered)
        }
      })

      it('should not record undefined actions', () => {
        const dummyState = mockUndoableReducer(incrementedState, undefined as unknown as Parameters<typeof mockUndoableReducer>[1])
        expect(dummyState).to.deep.equal(incrementedState)
      })

      it('should reset upon init actions', () => {
        let reInitializedState: ReturnType<typeof mockUndoableReducer>
        if (undoableConfig && undoableConfig.initTypes) {
          if ((undoableConfig.initTypes as string[]).length > 0) {
            const initType = Array.isArray(undoableConfig.initTypes) ? undoableConfig.initTypes[0] : undoableConfig.initTypes
            reInitializedState = mockUndoableReducer(incrementedState, { type: initType })
            expect(reInitializedState).to.deep.equal(mockInitialState)
          } else {
            reInitializedState = mockUndoableReducer(incrementedState, { type: '@@redux-undo/INIT' })
            expect(reInitializedState).to.deep.equal(incrementedState)
          }
        } else {
          reInitializedState = mockUndoableReducer(incrementedState, { type: '@@redux-undo/INIT' })
          expect(reInitializedState).to.deep.equal(mockInitialState)
        }
      })

      it('should increment when action is dispatched to store', () => {
        const expectedResult = store.getState().present + 1
        store.dispatch({ type: 'INCREMENT' })
        expect(store.getState().present).to.equal(expectedResult)
      })
    })

    describe('groupBy', () => {
      it('should run normally without undo/redo', () => {
        if (undoableConfig && undoableConfig.groupBy && !testConfig?.excludedActions) {
          const first = mockUndoableReducer(mockInitialState, {
            type: 'INCREMENT',
            group: 'a'
          })
          expect(first.past.length).to.equal(1)
          const second = mockUndoableReducer(first, {
            type: 'INCREMENT',
            group: 'a'
          })
          expect(second.past.length).to.equal(first.past.length)
          const third = mockUndoableReducer(second, {
            type: 'INCREMENT',
            group: 'a'
          })
          expect(third.past.length).to.equal(second.past.length)
          expect(third.present).to.equal(mockInitialState.present + 3)
          const fourth = mockUndoableReducer(third, {
            type: 'DECREMENT',
            group: 'b'
          })
          expect(fourth.past.length).to.equal(2)
          const fifth = mockUndoableReducer(fourth, {
            type: 'DECREMENT',
            group: 'b'
          })
          expect(fifth.past.length).to.equal(fourth.past.length)
          const sixth = mockUndoableReducer(fifth, {
            type: 'DECREMENT',
            group: 'b'
          })
          expect(sixth.past.length).to.equal(fifth.past.length)
          expect(sixth.present).to.equal(mockInitialState.present)
          const seventh = mockUndoableReducer(sixth, {
            type: 'INCREMENT'
          })
          expect(seventh.present).to.equal(first.present)
          expect(seventh.past.length).to.equal(3)
          const eighth = mockUndoableReducer(seventh, {
            type: 'INCREMENT'
          })
          expect(eighth.past.length).to.equal(4)
        }
      })

      it('should save undo/redo', () => {
        if (undoableConfig && undoableConfig.groupBy && !testConfig?.excludedActions) {
          const first = mockUndoableReducer(mockInitialState, {
            type: 'INCREMENT',
            group: 'a'
          })
          expect(first.past.length).to.equal(1)
          const second = mockUndoableReducer(first, {
            type: 'INCREMENT',
            group: 'a'
          })
          expect(second.past.length).to.equal(first.past.length)
          const third = mockUndoableReducer(second, ActionCreators.undo())
          expect(third.past.length).to.equal(0)
          expect(third.present).to.equal(mockInitialState.present)
          const fourth = mockUndoableReducer(third, ActionCreators.redo())
          expect(fourth.past.length).to.equal(second.past.length)
          expect(fourth.present).to.equal(second.present)
          const fifth = mockUndoableReducer(fourth, {
            type: 'INCREMENT',
            group: 'a'
          })
          expect(fifth.past.length).to.equal(fourth.past.length + 1)
          const sixth = mockUndoableReducer(fifth, {
            type: 'DECREMENT',
            group: 'b'
          })
          expect(sixth.past.length).to.equal(fifth.past.length + 1)
          const seventh = mockUndoableReducer(sixth, {
            type: 'DECREMENT',
            group: 'b'
          })
          expect(seventh.past.length).to.equal(sixth.past.length)
          const eighth = mockUndoableReducer(seventh, ActionCreators.undo())
          expect(eighth.present).to.equal(fifth.present)
          const ninth = mockUndoableReducer(eighth, ActionCreators.undo())
          expect(ninth.present).to.equal(fourth.present)
          const tenth = mockUndoableReducer(ninth, ActionCreators.undo())
          expect(tenth.present).to.equal(mockInitialState.present)
        }
      })
    })

    describe('Undo', () => {
      let undoState: ReturnType<typeof mockUndoableReducer>
      beforeAll(() => {
        wasCalled = false
        undoState = mockUndoableReducer(incrementedState, ActionCreators.undo())
      })

      it('should have called the reducer if neverSkipReducer is true', () => {
        expect(wasCalled).to.equal(Boolean(undoableConfig.neverSkipReducer))
      })

      it('should change present state back by one action', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(undoState.present).to.equal(mockInitialState.present)
        }
      })

      it('should change present state to last element of \'past\'', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(undoState.present).to.equal(incrementedState.past[incrementedState.past.length - 1])
        }
      })

      it('should add a new element to \'future\' from last state', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(undoState.future[0]).to.equal(incrementedState.present)
        }
      })

      it('should decrease length of \'past\' by one', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(undoState.past.length).to.equal(incrementedState.past.length - 1)
        }
      })

      it('should increase length of \'future\' by one', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(undoState.future.length).to.equal(incrementedState.future.length + 1)
        }
      })

      it('should do nothing if \'past\' is empty', () => {
        const undoInitialState = mockUndoableReducer(mockInitialState, ActionCreators.undo())
        if (!mockInitialState.past.length) {
          expect(undoInitialState.present).to.deep.equal(mockInitialState.present)
        }
      })

      it('should undo to last not filtered state', () => {
        if (testConfig && testConfig.excludedActions) {
          const excludedAction = { type: testConfig.excludedActions[0] }
          const includedAction = { type: 'INCREMENT' }
          let state = mockUndoableReducer(mockInitialState, excludedAction)
          state = mockUndoableReducer(state, excludedAction)
          const preUndoState = mockUndoableReducer(state, includedAction)
          state = mockUndoableReducer(preUndoState, ActionCreators.undo())
          expect(state.present).to.deep.equal(preUndoState.past[preUndoState.past.length - 1])
        }
      })
    })

    describe('Redo', () => {
      let undoState: ReturnType<typeof mockUndoableReducer>
      let redoState: ReturnType<typeof mockUndoableReducer>
      beforeAll(() => {
        wasCalled = false
        undoState = mockUndoableReducer(incrementedState, ActionCreators.undo())
        redoState = mockUndoableReducer(undoState, ActionCreators.redo())
      })

      it('should have called the reducer if neverSkipReducer is true', () => {
        expect(wasCalled).to.equal(Boolean(undoableConfig.neverSkipReducer))
      })

      it('should change present state to equal state before undo', () => {
        if (testConfig && !testConfig.includeActions) {
          expect(redoState.present).to.equal(incrementedState.present)
        }
      })

      it('should change present state to first element of \'future\'', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(redoState.present).to.equal(undoState.future[0])
        }
      })

      it('should add a new element to \'past\' from last state', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(redoState.past[redoState.past.length - 1]).to.equal(undoState.present)
        }
      })

      it('should decrease length of \'future\' by one', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(redoState.future.length).to.equal(undoState.future.length - 1)
        }
      })

      it('should increase length of \'past\' by one', () => {
        if (undoableConfig && (undoableConfig.limit as number) >= 0) {
          expect(redoState.past.length).to.equal(undoState.past.length + 1)
        }
      })

      it('should do nothing if \'future\' is empty', () => {
        const secondRedoState = mockUndoableReducer(redoState, ActionCreators.redo())
        if (!redoState.future.length) {
          expect(secondRedoState.present).to.deep.equal(redoState.present)
        }
      })

      it('should not redo to filtered state', () => {
        if (testConfig && testConfig.excludedActions) {
          const excludedAction = { type: testConfig.excludedActions[0] }
          const excludedState = mockUndoableReducer(mockInitialState, excludedAction)
          const postUndoState = mockUndoableReducer(excludedState, ActionCreators.undo())
          const postRedoState = mockUndoableReducer(postUndoState, ActionCreators.redo())
          expect(mockInitialState).to.deep.equal(postRedoState)
        }
      })
    })

    describe('JumpToPast', () => {
      const jumpToPastIndex = 0
      let jumpToPastState: ReturnType<typeof mockUndoableReducer>
      beforeAll(() => {
        jumpToPastState = mockUndoableReducer(incrementedState, ActionCreators.jumpToPast(jumpToPastIndex))
      })

      it('should change present to a given value from past', () => {
        const pastState = incrementedState.past[jumpToPastIndex]
        if (pastState !== undefined) {
          expect(jumpToPastState.present).to.equal(pastState)
        }
      })

      it('should do nothing if past index is out of bounds', () => {
        const jumpToOutOfBounds = mockUndoableReducer(incrementedState, ActionCreators.jumpToPast(-1))
        expect(jumpToOutOfBounds).to.deep.equal(incrementedState)
      })

      it('should increase the length of future if successful', () => {
        if (testConfig && !testConfig.includeActions) {
          if (incrementedState.past.length > jumpToPastIndex) {
            expect(jumpToPastState.future.length).to.be.above(incrementedState.future.length)
          }
        }
      })

      it('should decrease the length of past if successful', () => {
        if (incrementedState.past.length > jumpToPastIndex) {
          expect(jumpToPastState.past.length).to.be.below(incrementedState.past.length)
        }
      })
    })

    describe('JumpToFuture', () => {
      const jumpToFutureIndex = 2
      let jumpToFutureState: ReturnType<typeof mockUndoableReducer>
      beforeAll(() => {
        jumpToFutureState = mockUndoableReducer(mockInitialState, ActionCreators.jumpToFuture(jumpToFutureIndex))
      })

      it('should change present to a given value from future', () => {
        const futureState = mockInitialState.future[jumpToFutureIndex]
        if (futureState !== undefined) {
          expect(jumpToFutureState.present).to.equal(futureState)
        }
      })

      it('should do nothing if future index is out of bounds', () => {
        const jumpToOutOfBounds = mockUndoableReducer(mockInitialState, ActionCreators.jumpToFuture(-1))
        expect(jumpToOutOfBounds).to.deep.equal(mockInitialState)
      })

      it('should increase the length of past if successful', () => {
        if (mockInitialState.future.length > jumpToFutureIndex) {
          expect(jumpToFutureState.past.length).to.be.above(mockInitialState.past.length)
        }
      })

      it('should decrease the length of future if successful', () => {
        if (mockInitialState.future.length > jumpToFutureIndex) {
          expect(jumpToFutureState.future.length).to.be.below(mockInitialState.future.length)
        }
      })

      it('should do a redo if index = 0', () => {
        if (mockInitialState.future.length > 0) {
          jumpToFutureState = mockUndoableReducer(mockInitialState, ActionCreators.jumpToFuture(0))
          const redoState = mockUndoableReducer(mockInitialState, ActionCreators.redo())
          expect(redoState).to.deep.equal(jumpToFutureState)
        }
      })
    })

    describe('Jump', () => {
      const jumpStepsToPast = -2
      const jumpStepsToFuture = 2
      let jumpToPastState: ReturnType<typeof mockUndoableReducer>
      let jumpToFutureState: ReturnType<typeof mockUndoableReducer>
      let doubleUndoState: ReturnType<typeof mockUndoableReducer>
      let doubleRedoState: ReturnType<typeof mockUndoableReducer>
      beforeAll(() => {
        const doubleIncrementedState = mockUndoableReducer(incrementedState, { type: 'INCREMENT' })
        jumpToPastState = mockUndoableReducer(doubleIncrementedState, ActionCreators.jump(jumpStepsToPast))
        jumpToFutureState = mockUndoableReducer(mockInitialState, ActionCreators.jump(jumpStepsToFuture))
        doubleUndoState = mockUndoableReducer(doubleIncrementedState, ActionCreators.undo())
        doubleUndoState = mockUndoableReducer(doubleUndoState, ActionCreators.undo())
        doubleRedoState = mockUndoableReducer(mockInitialState, ActionCreators.redo())
        doubleRedoState = mockUndoableReducer(doubleRedoState, ActionCreators.redo())
      })

      it('-2 steps should result in same state as two times undo', () => {
        if (testConfig && !testConfig.includeActions) {
          expect(doubleUndoState).to.deep.equal(jumpToPastState)
        }
      })

      it('+2 steps should result in same state as two times redo', () => {
        expect(doubleRedoState).to.deep.equal(jumpToFutureState)
      })

      it('should do nothing if steps is 0', () => {
        const jumpToCurrentState = mockUndoableReducer(mockInitialState, ActionCreators.jump(0))
        expect(jumpToCurrentState).to.deep.equal(mockInitialState)
      })

      it('should do nothing if steps is out of bounds', () => {
        let jumpToOutOfBounds = mockUndoableReducer(mockInitialState, ActionCreators.jump(10))
        expect(jumpToOutOfBounds).to.deep.equal(mockInitialState)
        jumpToOutOfBounds = mockUndoableReducer(mockInitialState, ActionCreators.jump(-10))
        expect(jumpToOutOfBounds).to.deep.equal(mockInitialState)
      })
    })

    describe('Clear History', () => {
      let clearedState: ReturnType<typeof mockUndoableReducer>

      beforeAll(() => {
        const clearHistoryType = undoableConfig && undoableConfig.clearHistoryType as string[] | undefined
        const actionType = clearHistoryType && Array.isArray(clearHistoryType) && clearHistoryType.length ? { type: clearHistoryType[0] } : ActionCreators.clearHistory()
        clearedState = mockUndoableReducer(incrementedState, actionType)
      })

      it('should clear future and past', () => {
        expect(clearedState.past.length).to.equal(0)
        expect(clearedState.future.length).to.equal(0)
      })

      it('should preserve the present value', () => {
        expect(clearedState.present).to.equal(incrementedState.present)
      })
    })

    if (testConfig?.checkSlices) {
      describe('running getSlices', () => {
        const initialState = {
          normalState: 0,
          slice1: 100
        }
        const sliceReducer = (state: number, action: { type: string }, slice1: number) => {
          switch (action.type) {
            case 'INCREMENT':
              return state + 1
            case 'DECREMENT':
              return state - 1
            case 'COPY_SLICE':
              return slice1
            default:
              return state
          }
        }
        const undoableSliceReducer = undoable(sliceReducer, undoableConfig)
        const fullReducer = (state: { normalState: number; slice1: number }, action: { type: string }) => ({
          normalState: undoableSliceReducer(state.normalState, action, state.slice1),
          slice1: state.slice1
        })
        let secondState: ReturnType<typeof fullReducer>
        let thirdState: ReturnType<typeof fullReducer>
        let fourthState: ReturnType<typeof fullReducer>
        let fifthState: ReturnType<typeof fullReducer>
        let sixthState: ReturnType<typeof fullReducer>
        let seventhState: ReturnType<typeof fullReducer>
        beforeAll(() => {
          secondState = fullReducer(initialState, { type: 'BOGUS' })
          thirdState = fullReducer(secondState, { type: 'INCREMENT' })
          fourthState = fullReducer(thirdState, { type: ActionTypes.UNDO })
          fifthState = fullReducer(fourthState, { type: ActionTypes.REDO })
          sixthState = fullReducer(fifthState, { type: 'COPY_SLICE' })
          seventhState = fullReducer(sixthState, { type: 'DECREMENT' })
        })
        it('should keep same initial state on ignored action', () => {
          expect(secondState.normalState.present).to.equal(initialState.normalState)
          expect(secondState.slice1).to.equal(initialState.slice1)
        })
        it('should increment normally', () => {
          expect(thirdState.normalState.present).to.equal(initialState.normalState + 1)
          expect(thirdState.slice1).to.equal(initialState.slice1)
        })
        it('should undo normally', () => {
          expect(fourthState.normalState.present).to.equal(secondState.normalState.present)
          expect(fourthState.slice1).to.equal(initialState.slice1)
        })
        it('should redo normally', () => {
          expect(fifthState.normalState.present).to.equal(thirdState.normalState.present)
          expect(fifthState.slice1).to.equal(initialState.slice1)
        })
        it('should referenced sliced state normally', () => {
          expect(sixthState.normalState.present).to.equal(sixthState.slice1)
          expect(sixthState.slice1).to.equal(initialState.slice1)
        })
        it('should work normally after referencing slices', () => {
          expect(seventhState.normalState.present).to.equal(sixthState.normalState.present - 1)
          expect(seventhState.slice1).to.equal(initialState.slice1)
        })
      })
    }
  })
}