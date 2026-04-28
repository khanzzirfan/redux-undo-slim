import { applyPatches } from 'immer';
export function parseActions(rawActions, defaultValue = []) {
    if (Array.isArray(rawActions)) {
        return rawActions;
    }
    else if (typeof rawActions === 'string') {
        return [rawActions];
    }
    return defaultValue;
}
export function isHistory(history) {
    if (typeof history !== 'object' || history === null)
        return false;
    const h = history;
    return typeof h.present !== 'undefined' &&
        typeof h.future !== 'undefined' &&
        typeof h.past !== 'undefined' &&
        Array.isArray(h.future) &&
        Array.isArray(h.past);
}
export function includeAction(rawActions) {
    const actions = parseActions(rawActions);
    return (action) => actions.indexOf(action.type) >= 0;
}
export function excludeAction(rawActions) {
    const actions = parseActions(rawActions);
    return (action) => actions.indexOf(action.type) < 0;
}
export function combineFilters(...filters) {
    return (action, currentState, previousHistory) => {
        return filters.reduce((prev, curr) => prev && curr(action, currentState, previousHistory), true);
    };
}
export function groupByActionTypes(rawActions) {
    const actions = parseActions(rawActions);
    return (action) => actions.indexOf(action.type) >= 0 ? action.type : null;
}
export function newHistory(past, present, future, group = undefined) {
    return {
        past,
        present,
        future,
        group: group ?? undefined,
        _latestUnfiltered: present,
        index: past.length,
        limit: past.length + future.length + 1
    };
}
export function newPatchHistory(present, stack = [], cursor = 0) {
    return {
        present,
        stack,
        cursor,
        _latestUnfiltered: present
    };
}
export function isPatchHistory(state) {
    if (typeof state !== 'object' || state === null)
        return false;
    const s = state;
    return typeof s.present !== 'undefined' &&
        Array.isArray(s.stack) &&
        typeof s.cursor === 'number';
}
export function canUndo(history) {
    return history.cursor > 0;
}
export function canRedo(history) {
    return history.cursor < history.stack.length;
}
export function pastLength(history) {
    return history.cursor;
}
export function futureLength(history) {
    return history.stack.length - history.cursor;
}
export function materializeHistory(history, initialState) {
    if (!isHistory(history)) {
        const { present, stack, cursor } = history;
        const past = [];
        let currentState = initialState;
        for (let i = 0; i < cursor; i++) {
            const entry = stack[i];
            if (entry && entry.p) {
                currentState = applyPatches(currentState, entry.p);
            }
            past.push(currentState);
        }
        const future = [];
        currentState = present;
        for (let i = cursor; i < stack.length; i++) {
            const entry = stack[i];
            if (entry && entry.p) {
                future.push(applyPatches(currentState, entry.p));
                currentState = applyPatches(currentState, entry.p);
            }
        }
        return { past, present, future };
    }
    return { past: history.past, present: history.present, future: history.future };
}
//# sourceMappingURL=helpers.js.map