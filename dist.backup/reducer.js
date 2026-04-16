import * as debug from './debug';
import { ActionTypes } from './actions';
import { parseActions, isHistory, newHistory } from './helpers';
import patchModeReducer from './patch-reducer';
function createHistory(state, ignoreInitialState) {
    const history = newHistory([], state, []);
    if (ignoreInitialState) {
        history._latestUnfiltered = null;
    }
    return history;
}
function insert(history, state, limit, group) {
    const lengthWithoutFuture = history.past.length + 1;
    debug.log('inserting', state);
    debug.log('new free: ', (limit ?? 0) - lengthWithoutFuture);
    const { past, _latestUnfiltered } = history;
    const isHistoryOverflow = limit !== undefined && limit <= lengthWithoutFuture;
    const pastSliced = past.slice(isHistoryOverflow ? 1 : 0);
    const newPast = _latestUnfiltered != null
        ? [
            ...pastSliced,
            _latestUnfiltered
        ]
        : pastSliced;
    return newHistory(newPast, state, [], group);
}
function jumpToFuture(history, index) {
    if (index < 0 || index >= history.future.length)
        return history;
    const { past, future, _latestUnfiltered } = history;
    const newPast = [...past, _latestUnfiltered, ...future.slice(0, index)];
    const newPresent = future[index];
    const newFuture = future.slice(index + 1);
    return newHistory(newPast, newPresent, newFuture);
}
function jumpToPast(history, index) {
    if (index < 0 || index >= history.past.length)
        return history;
    const { past, future, _latestUnfiltered } = history;
    const newPast = past.slice(0, index);
    const newFuture = [...past.slice(index + 1), _latestUnfiltered, ...future];
    const newPresent = past[index];
    return newHistory(newPast, newPresent, newFuture);
}
function jump(history, n) {
    if (n > 0)
        return jumpToFuture(history, n - 1);
    if (n < 0)
        return jumpToPast(history, history.past.length + n);
    return history;
}
function actionTypeAmongClearHistoryType(actionType, clearHistoryType) {
    return clearHistoryType.indexOf(actionType) > -1 ? actionType !== undefined : !actionType;
}
export default function undoable(reducer, rawConfig = {}) {
    debug.set(rawConfig.debug);
    const config = {
        limit: undefined,
        filter: () => true,
        groupBy: () => undefined,
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
        clearHistoryType: parseActions(rawConfig.clearHistoryType, [ActionTypes.CLEAR_HISTORY])
    };
    const patchModeValue = config.patchMode;
    if (patchModeValue === 'immer' || patchModeValue === 'diff') {
        const patchReducer = patchModeReducer(reducer, rawConfig, patchModeValue);
        return ((state, action, ...slices) => {
            return patchReducer(state, action, ...slices);
        });
    }
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
                history = createHistory(start, config.ignoreInitialState ?? false);
                debug.log('do not set initialState on probe actions');
                debug.end(history);
                return history;
            }
            else if (isHistory(state)) {
                history = initialState = config.ignoreInitialState
                    ? state
                    : newHistory(state.past, state.present, state.future);
                debug.log('initialHistory initialized: initialState is a history', initialState);
            }
            else {
                history = initialState = createHistory(state, config.ignoreInitialState ?? false);
                debug.log('initialHistory initialized: initialState is not a history', initialState);
            }
        }
        else {
            history = state;
        }
        let res;
        const actionType = action?.type;
        switch (actionType) {
            case undefined:
                return history;
            case config.undoType:
                res = jump(history, -1);
                debug.log('perform undo');
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.redoType:
                res = jump(history, 1);
                debug.log('perform redo');
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.jumpToPastType:
                res = jumpToPast(history, action.index ?? 0);
                debug.log(`perform jumpToPast to ${action.index}`);
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.jumpToFutureType:
                res = jumpToFuture(history, action.index ?? 0);
                debug.log(`perform jumpToFuture to ${action.index}`);
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case config.jumpType:
                res = jump(history, action.index ?? 0);
                debug.log(`perform jump to ${action.index}`);
                debug.end(res);
                return skipReducer(res, action, ...slices);
            case actionTypeAmongClearHistoryType(actionType, config.clearHistoryType) ? actionType : undefined: {
                res = createHistory(history.present, config.ignoreInitialState ?? false);
                debug.log('perform clearHistory');
                debug.end(res);
                return skipReducer(res, action, ...slices);
            }
            default: {
                const newPresent = reducer(history.present, action, ...slices);
                res = {
                    ...history,
                    present: newPresent
                };
                const initTypes = config.initTypes ?? [];
                if (initTypes.includes(action.type)) {
                    debug.log('reset history due to init action');
                    debug.end(initialState);
                    return initialState;
                }
                if (history._latestUnfiltered === res.present) {
                    return history;
                }
                const filtered = typeof config.filter === 'function' && !config.filter(action, res.present, history);
                if (filtered) {
                    const filteredState = newHistory(history.past, res.present, history.future, history.group ?? undefined);
                    if (!config.syncFilter) {
                        filteredState._latestUnfiltered = history._latestUnfiltered;
                    }
                    debug.log('filter ignored action, not storing it in past');
                    debug.end(filteredState);
                    return filteredState;
                }
                const group = config.groupBy?.(action, res.present, history);
                if (group != null && group === history.group) {
                    const groupedState = newHistory(history.past, res.present, history.future, history.group ?? undefined);
                    debug.log('groupBy grouped the action with the previous action');
                    debug.end(groupedState);
                    return groupedState;
                }
                history = insert(history, res.present, config.limit, group ?? undefined);
                debug.log('inserted new state into history');
                debug.end(history);
                return history;
            }
        }
    };
}
//# sourceMappingURL=reducer.js.map