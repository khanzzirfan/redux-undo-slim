declare module 'redux-undo-slim' {
  import { Reducer, Action, AnyAction } from 'redux';
  import { Patch } from 'immer';

  export interface StateWithHistory<State> {
    past: State[];
    present: State;
    future: State[];
    _latestUnfiltered?: State;
    group?: any;
    index?: number;
    limit?: number;
  }

  export interface OpEntry {
    p: Patch[];
    ip: Patch[];
    src?: 'immer' | 'diff';
    g?: string | number;
  }

  export interface PatchHistory<State> {
    present: State;
    stack: OpEntry[];
    cursor: number;
    _latestUnfiltered?: State | null;
    group?: string | number;
  }

  export type HistoryState<State> = PatchHistory<State> | StateWithHistory<State>;

  export type PatchMode = 'snapshot' | 'immer' | 'diff';

  export type FilterFunction<S = any, A extends Action = AnyAction> = (action: A, currentState: S, previousHistory: HistoryState<S>) => boolean;
  export type GroupByFunction<S = any, A extends Action = AnyAction> = (action: A, currentState: S, previousHistory: HistoryState<S>) => any;
  export type CombineFilters = <S = any, A extends Action = AnyAction>(...filters: FilterFunction<S, A>[]) => FilterFunction<S, A>;

  export const ActionCreators: {
    undo: () => Action;
    redo: () => Action;
    jump: (index: number) => Action;
    jumpToPast: (index: number) => Action;
    jumpToFuture: (index: number) => Action;
    clearHistory: () => Action;
  };

  export const ActionTypes: {
    readonly UNDO: string;
    readonly REDO: string;
    readonly JUMP: string;
    readonly JUMP_TO_PAST: string;
    readonly JUMP_TO_FUTURE: string;
    readonly CLEAR_HISTORY: string;
  };

  export interface UndoableOptions<S = any, A extends Action = AnyAction> {
    /** Set history mode: snapshot (default), immer, or diff */
    patchMode?: PatchMode;

    /* Set a limit for the history */
    limit?: number;

    /** If you don't want to include every action in the undo/redo history, you can add a filter function to undoable */
    filter?: FilterFunction<S, A>;

    /** Groups actions together into one undo step */
    groupBy?: GroupByFunction<S, A>;

    /** Define a custom action type for this undo action */
    undoType?: string;
    /** Define a custom action type for this redo action */
    redoType?: string;

    /** Define custom action type for this jump action */
    jumpType?: string;

    /** Define custom action type for this jumpToPast action */
    jumpToPastType?: string;
    /** Define custom action type for this jumpToFuture action */
    jumpToFutureType?: string;

    /** Define custom action type for this clearHistory action */
    clearHistoryType?: string | string[];

    /** History will be (re)set upon init action type */
    initTypes?: string[];

    /** Set to `true` to turn on debugging */
    debug?: boolean;

    /** Set to `true` to prevent undoable from skipping the reducer on undo/redo **/
    neverSkipReducer?: boolean;

    /** Set to `true` to prevent the user from undoing to the initial state  **/
    ignoreInitialState?: boolean;

    /** Set to `true` to synchronize the _latestUnfiltered state with present when a excluded action is dispatched **/
    syncFilter?: boolean;
  }

  interface Undoable {
    <State, A extends Action = AnyAction>(reducer: Reducer<State, A>, options?: UndoableOptions<State, A>): Reducer<PatchHistory<State> | StateWithHistory<State>>;
  }

  type IncludeAction = <S = any, A extends Action = AnyAction>(actions: A['type'] | A['type'][]) => FilterFunction<S, A>;
  type ExcludeAction = IncludeAction;
  type GroupByActionTypes = <S = any, A extends Action = AnyAction>(actions: A['type'] | A['type'][]) => GroupByFunction<S, A>;
  type NewHistory = <State>(past: State[], present: State, future: State[], group?: any) => StateWithHistory<State>;
  type NewPatchHistory = <State>(present: State, stack?: OpEntry[], cursor?: number) => PatchHistory<State>;

  const undoable: Undoable;

  export default undoable;

  export const includeAction: IncludeAction;
  export const excludeAction: ExcludeAction;
  export const combineFilters: CombineFilters;
  export const groupByActionTypes: GroupByActionTypes;
  export const newHistory: NewHistory;
  export const newPatchHistory: NewPatchHistory;

  export function canUndo(history: PatchHistory<unknown>): boolean;
  export function canRedo(history: PatchHistory<unknown>): boolean;
  export function pastLength(history: PatchHistory<unknown>): number;
  export function futureLength(history: PatchHistory<unknown>): number;
  export function isPatchHistory<T>(state: unknown): state is PatchHistory<T>;
  export function materializeHistory<T>(history: HistoryState<T>, initialState?: T): { past: T[]; present: T; future: T[] };

  export function applyUndo<T>(history: PatchHistory<T>): PatchHistory<T>;
  export function applyRedo<T>(history: PatchHistory<T>): PatchHistory<T>;
  export function insertOp<T>(history: PatchHistory<T>, patches: Patch[], inversePatches: Patch[], group: string | number | null | undefined, limit: number | undefined, src?: 'immer' | 'diff'): PatchHistory<T>;
  export function jumpOp<T>(history: PatchHistory<T>, n: number): PatchHistory<T>;
  export function jumpToPastOp<T>(history: PatchHistory<T>, index: number): PatchHistory<T>;
  export function jumpToFutureOp<T>(history: PatchHistory<T>, index: number): PatchHistory<T>;
}
