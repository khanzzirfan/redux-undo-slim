import type { AnyAction, Reducer } from 'redux';
import type { PatchHistory, UndoableConfig } from './types';
export default function patchModeReducer<S, A extends AnyAction = AnyAction>(reducer: Reducer<S, A>, rawConfig?: UndoableConfig<S>, patchMode?: 'immer' | 'diff'): (state: PatchHistory<S> | undefined, action: A, ...slices: unknown[]) => PatchHistory<S>;
//# sourceMappingURL=patch-reducer.d.ts.map