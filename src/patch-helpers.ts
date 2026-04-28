import { type Patch } from 'immer'
import type { PatchHistory, OpEntry } from './types'
import { applyPatchEntry } from './apply-patch'

export function applyUndo<T> (history: PatchHistory<T>): PatchHistory<T> {
  if (history.cursor <= 0) {
    return history
  }
  const entry = history.stack[history.cursor - 1]
  if (!entry || !entry.ip) {
    return history
  }
  const src = entry.src ?? 'immer'
  const newPresent = applyPatchEntry(history.present, entry.ip, src)
  return {
    ...history,
    present: newPresent,
    cursor: history.cursor - 1
  }
}

export function applyRedo<T> (history: PatchHistory<T>): PatchHistory<T> {
  if (history.cursor >= history.stack.length) {
    return history
  }
  const entry = history.stack[history.cursor]
  if (!entry || !entry.p) {
    return history
  }
  const src = entry.src ?? 'immer'
  const newPresent = applyPatchEntry(history.present, entry.p, src)
  return {
    ...history,
    present: newPresent,
    cursor: history.cursor + 1
  }
}

export function insertOp<T> (
  history: PatchHistory<T>,
  patches: Patch[],
  inversePatches: Patch[],
  group: string | number | null | undefined,
  limit: number | undefined,
  src: 'immer' | 'diff' = 'immer'
): PatchHistory<T> {
  const slicedStack = history.stack.slice(0, history.cursor)
  const newEntry: OpEntry = {
    p: patches,
    ip: inversePatches,
    src,
    ...(group != null && { g: group })
  }
  let newStack: OpEntry<T>[] = [...slicedStack, newEntry]
  let newCursor = history.cursor + 1

  if (limit && newStack.length > limit) {
    newStack = newStack.slice(newStack.length - limit)
    newCursor = newStack.length
  }

  return {
    ...history,
    stack: newStack,
    cursor: newCursor
  }
}

function composePatches (patchesList: Patch[][]): Patch[] {
  return patchesList.flat()
}

export function jumpOp<T> (history: PatchHistory<T>, n: number): PatchHistory<T> {
  if (n === 0) {
    return history
  }
  const { cursor, stack, present } = history
  const maxStep = stack.length - cursor
  const minStep = -cursor

  const clampedN = Math.max(minStep, Math.min(maxStep, n))

  if (clampedN === 0) {
    return history
  }

  let newPresent = present
  let newCursor = cursor

  if (clampedN > 0) {
    for (let i = cursor; i < cursor + clampedN; i++) {
      const entry = stack[i]
      if (entry && entry.p) {
        const src = entry.src ?? 'immer'
        newPresent = applyPatchEntry(newPresent, entry.p, src)
      }
    }
    newCursor = cursor + clampedN
  } else {
    for (let i = cursor - 1; i >= cursor + clampedN; i--) {
      const entry = stack[i]
      if (entry && entry.ip) {
        const src = entry.src ?? 'immer'
        newPresent = applyPatchEntry(newPresent, entry.ip, src)
      }
    }
    newCursor = cursor + clampedN
  }

  return {
    ...history,
    present: newPresent,
    cursor: newCursor
  }
}

export function jumpToPastOp<T> (history: PatchHistory<T>, index: number): PatchHistory<T> {
  if (index < 0 || index >= history.cursor) {
    return history
  }
  return jumpOp(history, index - history.cursor)
}

export function jumpToFutureOp<T> (history: PatchHistory<T>, index: number): PatchHistory<T> {
  if (index < 0 || index >= history.stack.length - history.cursor) {
    return history
  }
  return jumpOp(history, index + 1)
}
