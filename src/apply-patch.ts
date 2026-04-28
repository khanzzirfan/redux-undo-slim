import type { Patch } from 'immer'
import { applyPatches } from 'immer'
import type { Operation } from 'fast-json-patch'

let fastJsonPatch: typeof import('fast-json-patch') | null = null
try {
  fastJsonPatch = require('fast-json-patch')
} catch {
  fastJsonPatch = null
}

export function applyPatchEntry<T>(present: T, patches: Patch[], src: 'immer' | 'diff'): T {
  if (src === 'diff') {
    if (!fastJsonPatch) {
      throw new Error('redux-undo-slim: patchMode "diff" requires fast-json-patch to be installed')
    }
    let state = JSON.parse(JSON.stringify(present)) as T
    for (const op of patches) {
      fastJsonPatch.applyOperation(state, op as Operation, true, true)
    }
    return state
  }
  return applyPatches(present, patches) as T
}
