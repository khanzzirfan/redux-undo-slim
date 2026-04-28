import type { AnyAction } from 'redux'
import type { History, PatchHistory, HistoryState } from './types'
import type { OpEntry } from './types'
import { applyPatchEntry } from './apply-patch'

export function parseActions (rawActions: string | string[] | undefined, defaultValue: string[] = []): string[] {
  if (Array.isArray(rawActions)) {
    return rawActions
  } else if (typeof rawActions === 'string') {
    return [rawActions]
  }
  return defaultValue
}

export function isHistory (history: unknown): history is History<unknown> {
  if (typeof history !== 'object' || history === null) return false
  const h = history as Record<string, unknown>
  return typeof h.present !== 'undefined' &&
    typeof h.future !== 'undefined' &&
    typeof h.past !== 'undefined' &&
    Array.isArray(h.future) &&
    Array.isArray(h.past)
}

export function includeAction (rawActions: string | string[]): (action: AnyAction) => boolean {
  const actions = parseActions(rawActions)
  return (action: AnyAction): boolean => actions.indexOf(action.type) >= 0
}

export function excludeAction (rawActions: string | string[]): (action: AnyAction) => boolean {
  const actions = parseActions(rawActions)
  return (action: AnyAction): boolean => actions.indexOf(action.type) < 0
}

export function combineFilters<T = unknown> (...filters: Array<(action: AnyAction, currentState: T, previousHistory: HistoryState<T>) => boolean>): (action: AnyAction, currentState: T, previousHistory: HistoryState<T>) => boolean {
  return (action: AnyAction, currentState: T, previousHistory: HistoryState<T>): boolean => {
    return filters.reduce<boolean>((prev, curr) =>
      prev && curr(action, currentState, previousHistory)
    , true)
  }
}

export function groupByActionTypes (rawActions: string | string[]): (action: AnyAction) => string | null {
  const actions = parseActions(rawActions)
  return (action: AnyAction): string | null => actions.indexOf(action.type) >= 0 ? action.type : null
}

export function newHistory<T> (past: T[], present: T, future: T[], group: string | number | undefined = undefined): History<T> {
  return {
    past,
    present,
    future,
    group: group ?? undefined,
    _latestUnfiltered: present,
    index: past.length,
    limit: past.length + future.length + 1
  }
}

export function newPatchHistory<T> (present: T, stack: OpEntry[] = [], cursor = 0): PatchHistory<T> {
  return {
    present,
    stack,
    cursor,
    _latestUnfiltered: present
  }
}

export function isPatchHistory<T> (state: unknown): state is PatchHistory<T> {
  if (typeof state !== 'object' || state === null) return false
  const s = state as Record<string, unknown>
  return typeof s.present !== 'undefined' &&
    Array.isArray(s.stack) &&
    typeof s.cursor === 'number'
}

export function canUndo (history: PatchHistory<unknown>): boolean {
  return history.cursor > 0
}

export function canRedo (history: PatchHistory<unknown>): boolean {
  return history.cursor < history.stack.length
}

export function pastLength (history: PatchHistory<unknown>): number {
  return history.cursor
}

export function futureLength (history: PatchHistory<unknown>): number {
  return history.stack.length - history.cursor
}

export function materializeHistory<T> (history: HistoryState<T>, initialState?: T): { past: T[]; present: T; future: T[] } {
  if (!isHistory(history)) {
    if (isPatchHistory<T>(history)) {
      if (initialState === undefined) {
        throw new Error(
          'redux-undo-slim: materializeHistory requires initialState when called with PatchHistory'
        )
      }
      const past: T[] = []
      let state = initialState
      for (let i = 0; i < history.cursor; i++) {
        past.push(state)
        const entry = history.stack[i]
        const src = entry.src ?? 'immer'
        state = applyPatchEntry(state, entry.p, src)
      }
      const future: T[] = []
      state = history.present
      for (let i = history.cursor; i < history.stack.length; i++) {
        const entry = history.stack[i]
        const src = entry.src ?? 'immer'
        state = applyPatchEntry(state, entry.p, src)
        future.push(state)
      }
      return { past, present: history.present, future }
    }
    return { past: [], present: history.present, future: [] }
  }
  return { past: history.past, present: history.present, future: history.future }
}
