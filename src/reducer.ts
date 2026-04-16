import type { AnyAction, Reducer } from 'redux'
import * as debug from './debug'
import { ActionTypes } from './actions'
import { parseActions, isHistory, newHistory } from './helpers'
import patchModeReducer from './patch-reducer'
import type { History, UndoableConfig, PatchMode } from './types'

function createHistory<T> (state: T, ignoreInitialState: boolean): History<T> {
  const history = newHistory<T>([], state, [])
  if (ignoreInitialState) {
    history._latestUnfiltered = null
  }
  return history
}

function insert<T> (history: History<T>, state: T, limit: number | undefined, group: string | number | null | undefined): History<T> {
  const lengthWithoutFuture = history.past.length + 1

  debug.log('inserting', state)
  debug.log('new free: ', (limit ?? 0) - lengthWithoutFuture)

  const { past, _latestUnfiltered } = history
  const isHistoryOverflow = limit !== undefined && limit <= lengthWithoutFuture

  const pastSliced = past.slice(isHistoryOverflow ? 1 : 0)
  const newPast = _latestUnfiltered != null
    ? [
        ...pastSliced,
        _latestUnfiltered!
      ]
    : pastSliced

  return newHistory(newPast, state, [], group)
}

function jumpToFuture<T> (history: History<T>, index: number): History<T> {
  if (index < 0 || index >= history.future.length) return history

  const { past, future, _latestUnfiltered } = history

  const newPast = [...past, _latestUnfiltered!, ...future.slice(0, index)]
  const newPresent = future[index]
  const newFuture = future.slice(index + 1)

  return newHistory(newPast, newPresent as T, newFuture)
}

function jumpToPast<T> (history: History<T>, index: number): History<T> {
  if (index < 0 || index >= history.past.length) return history

  const { past, future, _latestUnfiltered } = history

  const newPast = past.slice(0, index)
  const newFuture = [...past.slice(index + 1), _latestUnfiltered!, ...future]
  const newPresent = past[index]

  return newHistory(newPast, newPresent as T, newFuture)
}

function jump<T> (history: History<T>, n: number): History<T> {
  if (n > 0) return jumpToFuture(history, n - 1)
  if (n < 0) return jumpToPast(history, history.past.length + n)
  return history
}

function actionTypeAmongClearHistoryType (actionType: string | undefined, clearHistoryType: string[]): boolean {
  return clearHistoryType.indexOf(actionType as string) > -1 ? actionType !== undefined : !actionType
}

export default function undoable<S, A extends AnyAction = AnyAction> (
  reducer: Reducer<S, A>,
  rawConfig: UndoableConfig<S> = {}
): (state: History<S> | undefined, action: A, ...slices: unknown[]) => History<S> {
  debug.set(rawConfig.debug)

  const config: UndoableConfig<S> = {
    limit: undefined,
    filter: (): boolean => true,
    groupBy: (): undefined => undefined,
    undoType: ActionTypes.UNDO,
    redoType: ActionTypes.REDO,
    jumpToPastType: ActionTypes.JUMP_TO_PAST,
    jumpToFutureType: ActionTypes.JUMP_TO_FUTURE,
    jumpType: ActionTypes.JUMP,
    neverSkipReducer: false,
    ignoreInitialState: false,
    syncFilter: false,
    patchMode: 'snapshot',

    ...rawConfig,

    initTypes: parseActions(rawConfig.initTypes, ['@@redux-undo/INIT']),
    clearHistoryType: parseActions(
      rawConfig.clearHistoryType,
      [ActionTypes.CLEAR_HISTORY]
    )
  }

  const patchModeValue = config.patchMode as PatchMode
  if (patchModeValue === 'immer' || patchModeValue === 'diff') {
    const patchReducer = patchModeReducer(reducer, rawConfig, patchModeValue)
    return ((
      state: History<S> | undefined,
      action: A,
      ...slices: unknown[]
    ): History<S> => {
      return patchReducer(state as never, action, ...slices) as unknown as History<S>
    }) as (state: History<S> | undefined, action: A, ...slices: unknown[]) => History<S>
  }

  const skipReducer = config.neverSkipReducer
    ? <T>(res: History<T>, action: A, ..._slices: unknown[]): History<T> => ({
        ...res,
        present: reducer(res.present as unknown as S, action, ...(_slices as unknown[])) as T
      })
    : <T>(res: History<T>): History<T> => res

  let initialState: History<S> | undefined
  return (state: History<S> | undefined = initialState, action: A, ...slices: unknown[]): History<S> => {
    debug.start(action, state as History<S> | undefined)

    let history: History<S>
    if (!initialState) {
      debug.log('history is uninitialized')

      if (state === undefined) {
        const createHistoryAction = { type: '@@redux-undo/CREATE_HISTORY' }
        const start = reducer(state, createHistoryAction as unknown as A, ...slices as unknown[])

        history = createHistory(
          start,
          config.ignoreInitialState ?? false
        )

        debug.log('do not set initialState on probe actions')
        debug.end(history)
        return history
      } else if (isHistory<S>(state)) {
        history = initialState = config.ignoreInitialState
          ? state
          : newHistory<S>(
            state.past,
            state.present,
            state.future
          )
        debug.log(
          'initialHistory initialized: initialState is a history',
          initialState
        )
      } else {
        history = initialState = createHistory(
          state as unknown as S,
          config.ignoreInitialState ?? false
        )
        debug.log(
          'initialHistory initialized: initialState is not a history',
          initialState
        )
      }
    } else {
      history = state as History<S>
    }

    let res: History<S>
    const actionType = action?.type as string | undefined
    switch (actionType) {
      case undefined:
        return history

      case config.undoType as string:
        res = jump(history, -1)
        debug.log('perform undo')
        debug.end(res)
        return skipReducer(res, action, ...slices)

      case config.redoType as string:
        res = jump(history, 1)
        debug.log('perform redo')
        debug.end(res)
        return skipReducer(res, action, ...slices)

      case config.jumpToPastType as string:
        res = jumpToPast(history, (action as { index?: number }).index ?? 0)
        debug.log(`perform jumpToPast to ${(action as { index?: number }).index}`)
        debug.end(res)
        return skipReducer(res, action, ...slices)

      case config.jumpToFutureType as string:
        res = jumpToFuture(history, (action as { index?: number }).index ?? 0)
        debug.log(`perform jumpToFuture to ${(action as { index?: number }).index}`)
        debug.end(res)
        return skipReducer(res, action, ...slices)

      case config.jumpType as string:
        res = jump(history, (action as { index?: number }).index ?? 0)
        debug.log(`perform jump to ${(action as { index?: number }).index}`)
        debug.end(res)
        return skipReducer(res, action, ...slices)

      case actionTypeAmongClearHistoryType(actionType, config.clearHistoryType as string[]) ? actionType : undefined: {
        res = createHistory(history.present, config.ignoreInitialState ?? false)
        debug.log('perform clearHistory')
        debug.end(res)
        return skipReducer(res, action, ...slices as unknown[])
      }

      default: {
        const newPresent = reducer(
          history.present as unknown as S,
          action,
          ...slices as unknown[]
        ) as S

        res = {
          ...history,
          present: newPresent
        }

        const initTypes = config.initTypes ?? []
        if (initTypes.includes(action.type)) {
          debug.log('reset history due to init action')
          debug.end(initialState)
          return initialState
        }

        if (history._latestUnfiltered === res.present) {
          return history
        }

        const filtered = typeof config.filter === 'function' && !config.filter(
          action,
          res.present,
          history
        )

        if (filtered) {
          const filteredState = newHistory<S>(
            history.past,
            res.present,
            history.future,
            history.group ?? undefined
          )
          if (!config.syncFilter) {
            filteredState._latestUnfiltered = history._latestUnfiltered
          }
          debug.log('filter ignored action, not storing it in past')
          debug.end(filteredState)
          return filteredState
        }

        const group = config.groupBy?.(action, res.present, history)
        if (group != null && group === history.group) {
          const groupedState = newHistory<S>(
            history.past,
            res.present,
            history.future,
            history.group ?? undefined
          )
          debug.log('groupBy grouped the action with the previous action')
          debug.end(groupedState)
          return groupedState
        }

        history = insert(history, res.present, config.limit, group ?? undefined)

        debug.log('inserted new state into history')
        debug.end(history)
        return history
      }
    }
  }
}
