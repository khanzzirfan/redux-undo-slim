import { describe, expect, it } from 'vitest'
import { canUndo, canRedo, newPatchHistory } from '../src/index'

describe('canUndo', () => {
  it('returns false when cursor is 0', () => {
    const history = newPatchHistory({ count: 5 }, [], 0)
    expect(canUndo(history)).to.equal(false)
  })

  it('returns true when cursor > 0', () => {
    const history = newPatchHistory({ count: 3 }, [{ p: [], ip: [] }, { p: [], ip: [] }], 1)
    expect(canUndo(history)).to.equal(true)
  })
})

describe('canRedo', () => {
  it('returns false when cursor equals stack.length', () => {
    const history = newPatchHistory({ count: 5 }, [{ p: [], ip: [] }], 1)
    expect(canRedo(history)).to.equal(false)
  })

  it('returns true when cursor < stack.length', () => {
    const history = newPatchHistory({ count: 5 }, [{ p: [], ip: [] }, { p: [], ip: [] }], 0)
    expect(canRedo(history)).to.equal(true)
  })
})