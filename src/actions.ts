import type {
  UndoAction,
  RedoAction,
  JumpToFutureAction,
  JumpToPastAction,
  JumpAction,
  ClearHistoryAction,
  ActionCreators
} from './types'

export type { UndoAction, RedoAction, JumpToFutureAction, JumpToPastAction, JumpAction, ClearHistoryAction }

export const ActionTypes = {
  UNDO: '@@redux-undo/UNDO',
  REDO: '@@redux-undo/REDO',
  JUMP_TO_FUTURE: '@@redux-undo/JUMP_TO_FUTURE',
  JUMP_TO_PAST: '@@redux-undo/JUMP_TO_PAST',
  JUMP: '@@redux-undo/JUMP',
  CLEAR_HISTORY: '@@redux-undo/CLEAR_HISTORY'
} as const

export function undo (): UndoAction {
  return { type: ActionTypes.UNDO }
}

export function redo (): RedoAction {
  return { type: ActionTypes.REDO }
}

export function jumpToFuture (index: number): JumpToFutureAction {
  return { type: ActionTypes.JUMP_TO_FUTURE, index }
}

export function jumpToPast (index: number): JumpToPastAction {
  return { type: ActionTypes.JUMP_TO_PAST, index }
}

export function jump (index: number): JumpAction {
  return { type: ActionTypes.JUMP, index }
}

export function clearHistory (): ClearHistoryAction {
  return { type: ActionTypes.CLEAR_HISTORY }
}

export const ActionCreators: ActionCreators = {
  undo,
  redo,
  jumpToFuture,
  jumpToPast,
  jump,
  clearHistory
}
