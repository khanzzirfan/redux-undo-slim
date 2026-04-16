import type { AnyAction } from 'redux';
import type { History, PatchHistory, HistoryState } from './types';
export declare function parseActions(rawActions: string | string[] | undefined, defaultValue?: string[]): string[];
export declare function isHistory(history: unknown): history is History<unknown>;
export declare function includeAction(rawActions: string | string[]): (action: AnyAction) => boolean;
export declare function excludeAction(rawActions: string | string[]): (action: AnyAction) => boolean;
export declare function combineFilters<T = unknown>(...filters: Array<(action: AnyAction, currentState: T, previousHistory: HistoryState<T>) => boolean>): (action: AnyAction, currentState: T, previousHistory: HistoryState<T>) => boolean;
export declare function groupByActionTypes(rawActions: string | string[]): (action: AnyAction) => string | null;
export declare function newHistory<T>(past: T[], present: T, future: T[], group?: string | number | undefined): History<T>;
export declare function newPatchHistory<T>(present: T, stack?: import('./types').OpEntry[], cursor?: number): PatchHistory<T>;
export declare function isPatchHistory<T>(state: unknown): state is PatchHistory<T>;
export declare function canUndo(history: PatchHistory<unknown>): boolean;
export declare function canRedo(history: PatchHistory<unknown>): boolean;
export declare function pastLength(history: PatchHistory<unknown>): number;
export declare function futureLength(history: PatchHistory<unknown>): number;
export declare function materializeHistory<T>(history: HistoryState<T>, initialState: T): {
    past: T[];
    present: T;
    future: T[];
};
//# sourceMappingURL=helpers.d.ts.map