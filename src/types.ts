import type { EnablePatches } from 'immer';

export interface PatchHistory<S> {
  pastPatches: OpEntry<S>[];
  presentPatches: OpEntry<S>[];
  futurePatches: OpEntry<S>[];
}

export interface OpEntry<S> {
  state: S;
  patches: EnablePatches<S>[];
  inversePatches: EnablePatches<S>[];
}
