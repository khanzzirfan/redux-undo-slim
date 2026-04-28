export const ActionTypes = {
    UNDO: '@@redux-undo/UNDO',
    REDO: '@@redux-undo/REDO',
    JUMP_TO_FUTURE: '@@redux-undo/JUMP_TO_FUTURE',
    JUMP_TO_PAST: '@@redux-undo/JUMP_TO_PAST',
    JUMP: '@@redux-undo/JUMP',
    CLEAR_HISTORY: '@@redux-undo/CLEAR_HISTORY'
};
export function undo() {
    return { type: ActionTypes.UNDO };
}
export function redo() {
    return { type: ActionTypes.REDO };
}
export function jumpToFuture(index) {
    return { type: ActionTypes.JUMP_TO_FUTURE, index };
}
export function jumpToPast(index) {
    return { type: ActionTypes.JUMP_TO_PAST, index };
}
export function jump(index) {
    return { type: ActionTypes.JUMP, index };
}
export function clearHistory() {
    return { type: ActionTypes.CLEAR_HISTORY };
}
export const ActionCreators = {
    undo,
    redo,
    jumpToFuture,
    jumpToPast,
    jump,
    clearHistory
};
//# sourceMappingURL=actions.js.map