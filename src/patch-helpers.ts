import { applyPatches, type Patch } from 'immer'
import type { PatchHistory, OpEntry } from './types'

export function applyUndo<T> (history: PatchHistory<T>): PatchHistory<T> {
  if (history.cursor <= 0) {
    return history
  }
  const entry = history.stack[history.cursor - 1]
  if (!entry || !entry.ip) {
    return history
  }
  const newPresent = applyPatches(history.present, entry.ip)
  return {
    ...history,
    present: newPresent as T,
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
  const newPresent = applyPatches(history.present, entry.p)
  return {
    ...history,
    present: newPresent as T,
    cursor: history.cursor + 1
  }
}

export function insertOp<T> (
  history: PatchHistory<T>,
  patches: Patch[],
  inversePatches: Patch[],
  group: string | number | null | undefined,
  limit: number | undefined
): PatchHistory<T> {
  const slicedStack = history.stack.slice(0, history.cursor)
  const newEntry: OpEntry = {
    p: patches,
    ip: inversePatches,
    ...(group != null && { g: group })
  }
  let newStack: OpEntry[] = [...slicedStack, newEntry]
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
    const forwardPatches: Patch[][] = []
    for (let i = cursor; i < cursor + clampedN; i++) {
      const entry = stack[i]
      if (entry && entry.p) {
        forwardPatches.push(entry.p)
      }
    }
    newPresent = applyPatches(newPresent, composePatches(forwardPatches)) as T
    newCursor = cursor + clampedN
  } else {
    const inversePatches: Patch[][] = []
    for (let i = cursor + clampedN; i < cursor; i++) {
      const entry = stack[i]
      if (entry && entry.ip) {
        inversePatches.unshift(entry.ip)
      }
    }
    newPresent = applyPatches(newPresent, composePatches(inversePatches)) as T
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
