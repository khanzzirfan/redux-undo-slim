import { produceWithPatches } from 'immer';
import * as debug from './debug';
import { ActionTypes } from './actions';
import { parseActions, isPatchHistory, newPatchHistory } from './helpers';
import { applyUndo, applyRedo, insertOp, jumpOp, jumpToPastOp, jumpToFutureOp } from './patch-helpers';
let fastJsonPatch = null;
try {
    fastJsonPatch = require('fast-json-patch');
}
catch (e) {
    fastJsonPatch = null;
}
function createPatchHistory(state, ignoreInitialState) {
    const history = newPatchHistory(state, [], 0);
    if (ignoreInitialState) {
        history._latestUnfiltered = null;
    }
    return history;
}
function actionTypeAmongClearHistoryType(actionType, clearHistoryType) {
    return clearHistoryType.indexOf(actionType) > -1 ? actionType !== undefined : !actionType;
}
export default function patchModeReducer(reducer, rawConfig = {}, patchMode = 'immer') {
    debug.set(rawConfig.debug);
    const config = {
        limit: undefined,
        filter: () => true,
        groupBy: () => null,
        undoType: ActionTypes.UNDO,
        redoType: ActionTypes.REDO,
        jumpToPastType: ActionTypes.JUMP_TO_PAST,
        jumpToFutureType: ActionTypes.JUMP_TO_FUTURE,
        jumpType: ActionTypes.JUMP,
        neverSkipReducer: false,
        ignoreInitialState: false,
        syncFilter: false,
        ...rawConfig,
        initTypes: parseActions(rawConfig.initTypes, ['@@redux-undo/INIT']),
        clearHistoryType: parseActions(rawConfig.clearHistoryType, [ActionTypes.CLEAR_HISTORY])
    };
    const skipReducer = config.neverSkipReducer
        ? (res, action, ..._slices) => ({
            ...res,
            present: reducer(res.present, action, ..._slices)
        })
        : (res) => res;
    let initialState;
    return (state = initialState, action, ...slices) => {
        debug.start(action, state);
        let history;
        if (!initialState) {
            debug.log('history is uninitialized');
            if (state === undefined) {
                const createHistoryAction = { type: '@@redux-undo/CREATE_HISTORY' };
                const start = reducer(state, createHistoryAction, ...slices);
                history = createPatchHistory(start, config.ignoreInitialState ?? false);
                debug.log('do not set initialState on probe actions');
                debug.end(history);
                return history;
            }
            else if (isPatchHistory(state)) {
                history = initialState = config.ignoreInitialState
                    ? state
                    : newPatchHistory(state.present, state.stack, state.cursor);
                debug.log('initialHistory initialized: initialState is a history', initialState);
            }
            else {
                history = initialState = createPatchHistory(state, config.ignoreInitialState ?? false);
                debug.log('initialHistory initialized: initialState is not a history', initialState);
            }
        }
        else {
            history = state;
        }
        let res;
        const actionType = action.type;
        switch (actionType) {
            case undefined:
                return history;
            case config.undoType:
                res = applyUndo(history);
                debug.log('perform undo');
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.redoType:
                res = applyRedo(history);
                debug.log('perform redo');
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.jumpToPastType:
                res = jumpToPastOp(history, action.index ?? 0);
                debug.log(`perform jumpToPast to ${action.index}`);
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.jumpToFutureType:
                res = jumpToFutureOp(history, action.index ?? 0);
                debug.log(`perform jumpToFuture to ${action.index}`);
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.jumpType:
                res = jumpOp(history, action.index ?? 0);
                debug.log(`perform jump to ${action.index}`);
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case actionTypeAmongClearHistoryType(actionType, config.clearHistoryType) ? actionType : undefined: {
                res = createPatchHistory(history.present, config.ignoreInitialState ?? false);
                debug.log('perform clearHistory');
                debug.end(res);
                return skipReducer(res, action, ...slices);
            }
            default: {
                let patches = [];
                let inversePatches = [];
                let patchedMode = patchMode;
                if (patchedMode === 'diff') {
                    if (!fastJsonPatch) {
                        console.warn('redux-undo-slim: patchMode "diff" requires fast-json-patch. Using immer mode instead.');
                        patchedMode = 'immer';
                    }
                }
                let newState;
                if (patchedMode === 'diff' && fastJsonPatch) {
                    const baseState = history.present;
                    newState = reducer(baseState, action, ...slices);
                    patches = fastJsonPatch.compare(baseState, newState);
                    inversePatches = fastJsonPatch.compare(newState, baseState);
                }
                else {
                    const result = produceWithPatches(history.present, (draft) => reducer(draft, action, ...slices));
                    if (Array.isArray(result)) {
                        newState = result[0];
                        patches = result[1];
                        inversePatches = result[2];
                    }
                    else {
                        newState = result;
                    }
                }
                const group = config.groupBy?.(action, newState, history);
                const groupValue = group ?? undefined;
                const initTypes = config.initTypes ?? [];
                if (initTypes.includes(action.type)) {
                    debug.log('reset history due to init action');
                    debug.end(initialState);
                    return initialState;
                }
                const filtered = typeof config.filter === 'function' && !config.filter(action, newState, history);
                res = {
                    ...history,
                    present: newState,
                    group: groupValue
                };
                if (filtered) {
                    if (!config.syncFilter) {
                        res._latestUnfiltered = history._latestUnfiltered;
                    }
                    debug.log('filter ignored action, not storing it in past');
                    debug.end(res);
                    return res;
                }
                if (groupValue != null && groupValue === history.group) {
                    const lastOp = history.stack[history.cursor - 1];
                    if (lastOp) {
                        const mergedHistory = {
                            ...history,
                            stack: [
                                ...history.stack.slice(0, -1),
                                {
                                    p: [...(lastOp.p || []), ...patches],
                                    ip: [...inversePatches, ...(lastOp.ip || [])],
                                    g: group
                                }
                            ],
                            present: res.present,
                            group
                        };
                        debug.log('groupBy grouped the action with the previous action');
                        debug.end(mergedHistory);
                        return mergedHistory;
                    }
                }
                const updatedHistory = insertOp(history, patches, inversePatches, group, config.limit);
                updatedHistory.present = res.present;
                updatedHistory._latestUnfiltered = res.present;
                updatedHistory.group = group;
                debug.log('inserted new state into history');
                debug.end(updatedHistory);
                return updatedHistory;
            }
        }
    };
}
//# sourceMappingURL=patch-reducer.js.map