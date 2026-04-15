import { enablePatches } from 'immer'

enablePatches()

export { ActionTypes, ActionCreators } from './actions'
export {
  parseActions, isHistory,
  includeAction, excludeAction,
  combineFilters, groupByActionTypes, newHistory
} from './helpers'

export { default } from './reducer'
export { applyUndo, applyRedo, insertOp } from './patch-helpers'
