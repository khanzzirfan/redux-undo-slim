import { type Patch } from 'immer';
import type { PatchHistory } from './types';
export declare function applyUndo<T>(history: PatchHistory<T>): PatchHistory<T>;
export declare function applyRedo<T>(history: PatchHistory<T>): PatchHistory<T>;
export declare function insertOp<T>(history: PatchHistory<T>, patches: Patch[], inversePatches: Patch[], group: string | number | null | undefined, limit: number | undefined): PatchHistory<T>;
export declare function jumpOp<T>(history: PatchHistory<T>, n: number): PatchHistory<T>;
export declare function jumpToPastOp<T>(history: PatchHistory<T>, index: number): PatchHistory<T>;
export declare function jumpToFutureOp<T>(history: PatchHistory<T>, index: number): PatchHistory<T>;
//# sourceMappingURL=patch-helpers.d.ts.map