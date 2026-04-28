import type { AnyAction } from 'redux'
import type { HistoryState } from './types'

let __DEBUG__ = false
let displayBuffer: DisplayBuffer

interface DisplayBuffer {
  header: unknown[]
  prev: unknown[]
  action: unknown[]
  next: unknown[]
  msgs: unknown[]
}

const colors = {
  prevState: '#9E9E9E',
  action: '#03A9F4',
  nextState: '#4CAF50'
}

function initBuffer (): void {
  displayBuffer = {
    header: [],
    prev: [],
    action: [],
    next: [],
    msgs: []
  }
}

function printBuffer (): void {
  const { header, prev, next, action, msgs } = displayBuffer
  if (typeof console.group === 'function') {
    console.groupCollapsed(...(header as [string, ...unknown[]]))
    console.log(...prev)
    console.log(...action)
    console.log(...next)
    console.log(...msgs)
    console.groupEnd()
  } else {
    console.log(...header)
    console.log(...prev)
    console.log(...action)
    console.log(...next)
    console.log(...msgs)
  }
}

function colorFormat (text: string, color: string, obj: unknown): [string, string, unknown] {
  return [
    `%c${text}`,
    `color: ${color}; font-weight: bold`,
    obj
  ]
}

function start (action: AnyAction, state: HistoryState<unknown> | undefined): void {
  initBuffer()
  if (__DEBUG__) {
    if (typeof console.group === 'function') {
      displayBuffer.header = ['%credux-undo', 'font-style: italic', 'action', action.type]
      displayBuffer.action = colorFormat('action', colors.action, action)
      displayBuffer.prev = colorFormat('prev history', colors.prevState, state)
    } else {
      displayBuffer.header = ['redux-undo action', action.type]
      displayBuffer.action = ['action', action]
      displayBuffer.prev = ['prev history', state]
    }
  }
}

function end (nextState: HistoryState<unknown>): void {
  if (__DEBUG__) {
    if (typeof console.group === 'function') {
      displayBuffer.next = colorFormat('next history', colors.nextState, nextState)
    } else {
      displayBuffer.next = ['next history', nextState]
    }
    printBuffer()
  }
}

function log (...args: unknown[]): void {
  if (__DEBUG__) {
    displayBuffer.msgs = displayBuffer.msgs
      .concat([...args, '\n'])
  }
}

function set (debug: boolean | undefined): void {
  __DEBUG__ = debug ?? false
}

export { set, start, end, log }
