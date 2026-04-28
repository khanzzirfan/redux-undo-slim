import type { Patch } from 'immer';

export interface PatchHistory<S> {
  present: S;
  stack: OpEntry[];
  cursor: number;
  group?: string | number;
  _latestUnfiltered?: S | null;
}

export interface OpEntry {
  p: Patch[];
  ip: Patch[];
  src?: 'immer' | 'diff';
  g?: string | number;
}
