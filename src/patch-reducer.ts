import { produceWithPatches, type Patch, type Draft } from 'immer'
import type { AnyAction, Reducer } from 'redux'
import * as debug from './debug'
import { ActionTypes } from './actions'
import { parseActions, isPatchHistory, newPatchHistory } from './helpers'
import { applyUndo, applyRedo, insertOp, jumpOp, jumpToPastOp, jumpToFutureOp } from './patch-helpers'
import type { PatchHistory, UndoableConfig } from './types'

type FastJsonPatch = typeof import('fast-json-patch')

let fastJsonPatch: FastJsonPatch | null = null
try {
  fastJsonPatch = require('fast-json-patch')
} catch (e) {
  fastJsonPatch = null
}

function createPatchHistory<T> (state: T, ignoreInitialState: boolean): PatchHistory<T> {
  const history = newPatchHistory<T>(state, [], 0)
  if (ignoreInitialState) {
    history._latestUnfiltered = null
  }
  return history
}

function actionTypeAmongClearHistoryType (actionType: string | undefined, clearHistoryType: string[]): boolean {
  return clearHistoryType.indexOf(actionType as string) > -1 ? actionType !== undefined : !actionType
}

export default function patchModeReducer<S, A extends AnyAction = AnyAction>(
  reducer: Reducer<S, A>,
  rawConfig: UndoableConfig<S> = {},
  patchMode: 'immer' | 'diff' = 'immer'
): (state: PatchHistory<S> | undefined, action: A, ...slices: unknown[]) => PatchHistory<S> {
  debug.set(rawConfig.debug)

  const config: UndoableConfig<S> = {
    limit: undefined,
    filter: (): boolean => true,
    groupBy: (): null => null,
    undoType: ActionTypes.UNDO,
    redoType: ActionTypes.REDO,
    jumpToPastType: ActionTypes.JUMP_TO_PAST,
    jumpToFutureType: ActionTypes.JUMP_TO_FUTURE,
    jumpType: ActionTypes.JUMP,
    neverSkipReducer: false,
    ignoreInitialState: false,
    syncFilter: false,

    ...rawConfig,

    initTypes: parseActions(rawConfig.initTypes, ['@@redux/INIT', '@@redux-undo/INIT']),
    clearHistoryType: parseActions(
      rawConfig.clearHistoryType,
      [ActionTypes.CLEAR_HISTORY]
    )
  }

  const skipReducer = config.neverSkipReducer
    ? <T>(res: PatchHistory<T>, action: A, ..._slices: unknown[]): PatchHistory<T> => ({
        ...res,
        present: reducer(res.present as unknown as S, action, ...(_slices as unknown[])) as T
      })
    : <T>(res: PatchHistory<T>): PatchHistory<T> => res

  let initialState: PatchHistory<S> | undefined
  return (state: PatchHistory<S> | undefined = initialState, action: A, ...slices: unknown[]): PatchHistory<S> => {
    debug.start(action, state as PatchHistory<S> | undefined)

    let history: PatchHistory<S>
    if (!initialState) {
      debug.log('history is uninitialized')

      if (state === undefined) {
        const createHistoryAction = { type: '@@redux-undo/CREATE_HISTORY' }
        const start = reducer(state, createHistoryAction as unknown as A, ...(slices as unknown[]))

        history = createPatchHistory(
          start,
          config.ignoreInitialState ?? false
        )

        debug.log('do not set initialState on probe actions')
        debug.end(history)
        return history
      } else if (isPatchHistory<S>(state)) {
        history = initialState = config.ignoreInitialState
          ? state
          : newPatchHistory<S>(
            state.present,
            state.stack,
            state.cursor
          )
        debug.log(
          'initialHistory initialized: initialState is a history',
          initialState
        )
      } else {
        history = initialState = createPatchHistory(
          state as unknown as S,
          config.ignoreInitialState ?? false
        )
        debug.log(
          'initialHistory initialized: initialState is not a history',
          initialState
        )
      }
    } else {
      history = state as PatchHistory<S>
    }

    let res: PatchHistory<S>
    const actionType = action.type as string | undefined
    switch (actionType) {
      case undefined:
        return history

      case config.undoType as string:
        res = applyUndo(history)
        debug.log('perform undo')
        debug.end(res)
        return skipReducer(res, action, ...(slices as unknown[]))

      case config.redoType as string:
        res = applyRedo(history)
        debug.log('perform redo')
        debug.end(res)
        return skipReducer(res, action, ...(slices as unknown[]))

      case config.jumpToPastType as string:
        res = jumpToPastOp(history, (action as { index?: number }).index ?? 0)
        debug.log(`perform jumpToPast to ${(action as { index?: number }).index}`)
        debug.end(res)
        return skipReducer(res, action, ...(slices as unknown[]))

      case config.jumpToFutureType as string:
        res = jumpToFutureOp(history, (action as { index?: number }).index ?? 0)
        debug.log(`perform jumpToFuture to ${(action as { index?: number }).index}`)
        debug.end(res)
        return skipReducer(res, action, ...(slices as unknown[]))

      case config.jumpType as string:
        res = jumpOp(history, (action as { index?: number }).index ?? 0)
        debug.log(`perform jump to ${(action as { index?: number }).index}`)
        debug.end(res)
        return skipReducer(res, action, ...(slices as unknown[]))

      case actionTypeAmongClearHistoryType(actionType, config.clearHistoryType as string[]) ? actionType : undefined: {
        res = createPatchHistory(history.present, config.ignoreInitialState ?? false)
        debug.log('perform clearHistory')
        debug.end(res)
        return skipReducer(res, action, ...(slices as unknown[]))
      }

      default: {
        let patches: Patch[] = []
        let inversePatches: Patch[] = []
        let patchedMode = patchMode

        if (patchedMode === 'diff') {
          if (!fastJsonPatch) {
            console.warn('redux-undo-slim: patchMode "diff" requires fast-json-patch. Using immer mode instead.')
            patchedMode = 'immer'
          }
        }

        let newState: S
        if (patchedMode === 'diff' && fastJsonPatch) {
          const baseState = history.present
          newState = reducer(baseState, action, ...(slices as unknown[]))
          patches = fastJsonPatch.compare(baseState, newState)
          inversePatches = fastJsonPatch.compare(newState, baseState)
        } else {
          const result = produceWithPatches(
            history.present,
            (draft: Draft<S>) => reducer(draft, action, ...(slices as unknown[]))
          )
          if (Array.isArray(result)) {
            newState = result[0]
            patches = result[1] as unknown as Patch[]
            inversePatches = result[2] as unknown as Patch[]
          } else {
            newState = result as S
          }
        }

        const initTypes = config.initTypes ?? []
        const isInitAction = initTypes.some(type => action.type.startsWith(type))
        if (isInitAction) {
          debug.log('reset history due to init action', action.type)
          debug.end(initialState)
          return initialState
        }

        const filtered = typeof config.filter === 'function' && !config.filter(
          action,
          newState,
          history
        )

        if (filtered) {
          const filteredState: PatchHistory<S> = {
            ...history,
            present: newState,
            group: history.group
          }
          if (!config.syncFilter) {
            filteredState._latestUnfiltered = history._latestUnfiltered
          }
          debug.log('filter ignored action, not storing it in stack')
          debug.end(filteredState)
          return filteredState
        }

        const group = config.groupBy?.(action, newState, history)
        const groupValue = group ?? undefined
        res = {
          ...history,
          present: newState,
          group: groupValue
        }
        if (groupValue != null && groupValue === history.group) {
          const lastOp = history.stack[history.cursor - 1]
          if (lastOp) {
            const mergedHistory: PatchHistory<S> = {
              ...history,
              stack: [
                ...history.stack.slice(0, -1),
                {
                  p: [...(lastOp.p || []), ...patches],
                  ip: [...inversePatches, ...(lastOp.ip || [])],
                  src: patchedMode,
                  ...(group != null && { g: group })
                }
              ],
              present: res.present,
              group
            }
            debug.log('groupBy grouped the action with the previous action')
            debug.end(mergedHistory)
            return mergedHistory
          }
        }

        const updatedHistory = insertOp(history, patches, inversePatches, group, config.limit, patchMode as 'immer' | 'diff')
        updatedHistory.present = res.present
        updatedHistory._latestUnfiltered = res.present
        updatedHistory.group = group

        debug.log('inserted new state into history')
        debug.end(updatedHistory)
        return updatedHistory
      }
    }
  }
}
