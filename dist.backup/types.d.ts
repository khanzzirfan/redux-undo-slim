import type { Patch } from 'immer';
import type { AnyAction } from 'redux';
export interface OpEntry {
    p: Patch[];
    ip: Patch[];
    g?: string | number;
}
export interface PatchHistory<T> {
    present: T;
    stack: OpEntry[];
    cursor: number;
    _latestUnfiltered: T | null;
    group?: string | number;
}
export interface History<T> {
    past: T[];
    present: T;
    future: T[];
    group?: string | number;
    _latestUnfiltered: T | null;
    index: number;
    limit: number;
}
export type HistoryState<T> = PatchHistory<T> | History<T>;
export declare const ActionTypes: {
    readonly UNDO: "@@redux-undo/UNDO";
    readonly REDO: "@@redux-undo/REDO";
    readonly JUMP_TO_FUTURE: "@@redux-undo/JUMP_TO_FUTURE";
    readonly JUMP_TO_PAST: "@@redux-undo/JUMP_TO_PAST";
    readonly JUMP: "@@redux-undo/JUMP";
    readonly CLEAR_HISTORY: "@@redux-undo/CLEAR_HISTORY";
};
export type UndoAction = {
    type: typeof ActionTypes.UNDO;
};
export type RedoAction = {
    type: typeof ActionTypes.REDO;
};
export type JumpToFutureAction = {
    type: typeof ActionTypes.JUMP_TO_FUTURE;
    index: number;
};
export type JumpToPastAction = {
    type: typeof ActionTypes.JUMP_TO_PAST;
    index: number;
};
export type JumpAction = {
    type: typeof ActionTypes.JUMP;
    index: number;
};
export type ClearHistoryAction = {
    type: typeof ActionTypes.CLEAR_HISTORY;
};
export type CreateHistoryAction = {
    type: '@@redux-undo/CREATE_HISTORY';
};
export type UndoableAction = UndoAction | RedoAction | JumpToFutureAction | JumpToPastAction | JumpAction | ClearHistoryAction | CreateHistoryAction;
export interface ActionCreators {
    undo: () => UndoAction;
    redo: () => RedoAction;
    jumpToFuture: (index: number) => JumpToFutureAction;
    jumpToPast: (index: number) => JumpToPastAction;
    jump: (index: number) => JumpAction;
    clearHistory: () => ClearHistoryAction;
}
export type FilterFunction<T = unknown> = (action: AnyAction, currentState: T, previousHistory: HistoryState<T>) => boolean;
export type GroupByFunction<T = unknown> = (action: AnyAction, currentState: T, previousHistory: HistoryState<T>) => string | number | null | undefined;
export type PatchMode = 'snapshot' | 'immer' | 'diff';
export interface UndoableConfig<T = unknown> {
    limit?: number;
    filter?: FilterFunction<T>;
    groupBy?: GroupByFunction<T>;
    undoType?: string | string[];
    redoType?: string | string[];
    jumpToPastType?: string | string[];
    jumpToFutureType?: string | string[];
    jumpType?: string | string[];
    neverSkipReducer?: boolean;
    ignoreInitialState?: boolean;
    syncFilter?: boolean;
    patchMode?: PatchMode;
    initTypes?: string | string[];
    clearHistoryType?: string | string[];
    debug?: boolean;
}
export interface UndoableReducer<S = unknown, A extends AnyAction = AnyAction> {
    (state: S | undefined, action: A, ...slices: unknown[]): S;
}
export type { Patch };
//# sourceMappingURL=types.d.ts.map