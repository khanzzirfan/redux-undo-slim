import type { UndoAction, RedoAction, JumpToFutureAction, JumpToPastAction, JumpAction, ClearHistoryAction, ActionCreators } from './types';
export type { UndoAction, RedoAction, JumpToFutureAction, JumpToPastAction, JumpAction, ClearHistoryAction };
export declare const ActionTypes: {
    readonly UNDO: "@@redux-undo/UNDO";
    readonly REDO: "@@redux-undo/REDO";
    readonly JUMP_TO_FUTURE: "@@redux-undo/JUMP_TO_FUTURE";
    readonly JUMP_TO_PAST: "@@redux-undo/JUMP_TO_PAST";
    readonly JUMP: "@@redux-undo/JUMP";
    readonly CLEAR_HISTORY: "@@redux-undo/CLEAR_HISTORY";
};
export declare function undo(): UndoAction;
export declare function redo(): RedoAction;
export declare function jumpToFuture(index: number): JumpToFutureAction;
export declare function jumpToPast(index: number): JumpToPastAction;
export declare function jump(index: number): JumpAction;
export declare function clearHistory(): ClearHistoryAction;
export declare const ActionCreators: ActionCreators;
//# sourceMappingURL=actions.d.ts.map