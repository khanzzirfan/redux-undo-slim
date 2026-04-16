import type { AnyAction, Reducer } from 'redux';
import type { History, UndoableConfig } from './types';
export default function undoable<S, A extends AnyAction = AnyAction>(reducer: Reducer<S, A>, rawConfig?: UndoableConfig<S>): (state: History<S> | undefined, action: A, ...slices: unknown[]) => History<S>;
//# sourceMappingURL=reducer.d.ts.map