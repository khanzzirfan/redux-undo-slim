import { enablePatches } from 'immer'

enablePatches()

export { ActionTypes, ActionCreators } from './actions'
export {
  parseActions,
  isHistory,
  isPatchHistory,
  includeAction,
  excludeAction,
  combineFilters,
  groupByActionTypes,
  newHistory,
  newPatchHistory,
  canUndo,
  canRedo,
  pastLength,
  futureLength,
  materializeHistory
} from './helpers'

export { default } from './reducer'
export { applyUndo, applyRedo, insertOp, jumpOp, jumpToPastOp, jumpToFutureOp } from './patch-helpers'

export type {
  OpEntry,
  PatchHistory,
  History,
  HistoryState,
  FilterFunction,
  GroupByFunction,
  PatchMode,
  UndoableConfig,
  UndoableReducer,
  UndoAction,
  RedoAction,
  JumpToFutureAction,
  JumpToPastAction,
  JumpAction,
  ClearHistoryAction
} from './types'
