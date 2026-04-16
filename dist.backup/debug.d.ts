import type { AnyAction } from 'redux';
import type { HistoryState } from './types';
declare function start(action: AnyAction, state: HistoryState<unknown> | undefined): void;
declare function end(nextState: HistoryState<unknown>): void;
declare function log(...args: unknown[]): void;
declare function set(debug: boolean | undefined): void;
export { set, start, end, log };
//# sourceMappingURL=debug.d.ts.map