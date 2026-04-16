import { applyPatches } from 'immer';
export function applyUndo(history) {
    if (history.cursor <= 0) {
        return history;
    }
    const entry = history.stack[history.cursor - 1];
    if (!entry || !entry.ip) {
        return history;
    }
    const newPresent = applyPatches(history.present, entry.ip);
    return {
        ...history,
        present: newPresent,
        cursor: history.cursor - 1
    };
}
export function applyRedo(history) {
    if (history.cursor >= history.stack.length) {
        return history;
    }
    const entry = history.stack[history.cursor];
    if (!entry || !entry.p) {
        return history;
    }
    const newPresent = applyPatches(history.present, entry.p);
    return {
        ...history,
        present: newPresent,
        cursor: history.cursor + 1
    };
}
export function insertOp(history, patches, inversePatches, group, limit) {
    const slicedStack = history.stack.slice(0, history.cursor);
    const newEntry = {
        p: patches,
        ip: inversePatches,
        ...(group != null && { g: group })
    };
    let newStack = [...slicedStack, newEntry];
    let newCursor = history.cursor + 1;
    if (limit && newStack.length > limit) {
        newStack = newStack.slice(newStack.length - limit);
        newCursor = newStack.length;
    }
    return {
        ...history,
        stack: newStack,
        cursor: newCursor
    };
}
function composePatches(patchesList) {
    return patchesList.flat();
}
export function jumpOp(history, n) {
    if (n === 0) {
        return history;
    }
    const { cursor, stack, present } = history;
    const maxStep = stack.length - cursor;
    const minStep = -cursor;
    const clampedN = Math.max(minStep, Math.min(maxStep, n));
    if (clampedN === 0) {
        return history;
    }
    let newPresent = present;
    let newCursor = cursor;
    if (clampedN > 0) {
        const forwardPatches = [];
        for (let i = cursor; i < cursor + clampedN; i++) {
            const entry = stack[i];
            if (entry && entry.p) {
                forwardPatches.push(entry.p);
            }
        }
        newPresent = applyPatches(newPresent, composePatches(forwardPatches));
        newCursor = cursor + clampedN;
    }
    else {
        const inversePatches = [];
        for (let i = cursor + clampedN; i < cursor; i++) {
            const entry = stack[i];
            if (entry && entry.ip) {
                inversePatches.unshift(entry.ip);
            }
        }
        newPresent = applyPatches(newPresent, composePatches(inversePatches));
        newCursor = cursor + clampedN;
    }
    return {
        ...history,
        present: newPresent,
        cursor: newCursor
    };
}
export function jumpToPastOp(history, index) {
    if (index < 0 || index >= history.cursor) {
        return history;
    }
    return jumpOp(history, index - history.cursor);
}
export function jumpToFutureOp(history, index) {
    if (index < 0 || index >= history.stack.length - history.cursor) {
        return history;
    }
    return jumpOp(history, index + 1);
}
//# sourceMappingURL=patch-helpers.js.map