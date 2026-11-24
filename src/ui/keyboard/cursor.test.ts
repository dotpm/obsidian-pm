import { describe, expect, it } from 'vitest'
import { FocusCursor } from './cursor'
import type { KeyboardSurface } from './types'

interface Fake {
  surface: KeyboardSurface
  active(): string | null
  selected: Set<string>
}

function fake(groups: string[][], pageSize = 2): Fake {
  let active: string | null = null
  const selected = new Set<string>()
  const surface: KeyboardSurface = {
    context: 'table',
    groups: () => groups,
    activeId: () => active,
    setActive: (id) => {
      active = id
    },
    selection: () => ({
      ids: () => selected,
      set: (ids) => {
        selected.clear()
        for (const id of ids) selected.add(id)
      },
      onChange: () => {}
    }),
    pageSize: () => pageSize
  }
  return { surface, active: () => active, selected }
}

describe('FocusCursor', () => {
  it('starts at the first item going down and the last going up', () => {
    const state = fake([['a', 'b', 'c']])
    const cursor = new FocusCursor(state.surface)
    cursor.move(1)
    expect(state.active()).toBe('a')
    cursor.clearActive()
    cursor.move(-1)
    expect(state.active()).toBe('c')
  })

  it('steps over empty groups and crosses into the next one', () => {
    const state = fake([['a', 'b'], [], ['c', 'd']])
    const cursor = new FocusCursor(state.surface)
    state.surface.setActive('b')
    cursor.move(1)
    expect(state.active()).toBe('c')
    cursor.move(-1)
    expect(state.active()).toBe('b')
  })

  it('moves by column and keeps the row where it fits', () => {
    const state = fake([
      ['a', 'b', 'c'],
      ['d', 'e'],
      ['f', 'g', 'h']
    ])
    const cursor = new FocusCursor(state.surface)
    state.surface.setActive('c')
    cursor.moveGroup(1)
    expect(state.active()).toBe('e')
    cursor.moveGroup(1)
    expect(state.active()).toBe('g')
    cursor.moveGroup(-1)
    expect(state.active()).toBe('e')
  })

  it('jumps to the ends and by a page', () => {
    const state = fake([['a', 'b', 'c', 'd', 'e']], 2)
    const cursor = new FocusCursor(state.surface)
    cursor.first()
    expect(state.active()).toBe('a')
    cursor.page(1)
    expect(state.active()).toBe('c')
    cursor.last()
    expect(state.active()).toBe('e')
    cursor.page(1)
    expect(state.active()).toBe('e')
  })

  it('snaps to the nearest survivor after its item leaves', () => {
    const groups = [['a', 'b', 'c']]
    const state = fake(groups)
    const cursor = new FocusCursor(state.surface)
    cursor.activate('b')
    groups.splice(0, groups.length, ['a', 'c'])
    cursor.reconcile()
    expect(state.active()).toBe('c')
  })

  it('keeps the cursor in place when its item is still there', () => {
    const groups = [['a', 'b', 'c']]
    const state = fake(groups)
    const cursor = new FocusCursor(state.surface)
    state.surface.setActive('b')
    groups.splice(0, groups.length, ['x', 'a', 'b', 'c'])
    cursor.reconcile()
    expect(state.active()).toBe('b')
  })

  it('extends a range from the anchor', () => {
    const state = fake([['a', 'b', 'c', 'd']])
    const cursor = new FocusCursor(state.surface)
    state.surface.setActive('b')
    cursor.extend(1)
    expect([...state.selected]).toEqual(['b', 'c'])
    cursor.extend(1)
    expect([...state.selected]).toEqual(['b', 'c', 'd'])
  })

  it('toggles the active item and moves on', () => {
    const state = fake([['a', 'b']])
    const cursor = new FocusCursor(state.surface)
    cursor.toggleSelect()
    expect([...state.selected]).toEqual(['a'])
    expect(state.active()).toBe('b')
  })

  it('selects everything and clears again', () => {
    const state = fake([['a'], ['b']])
    const cursor = new FocusCursor(state.surface)
    cursor.selectAll()
    expect([...state.selected].sort()).toEqual(['a', 'b'])
    expect(cursor.clearSelection()).toBe(true)
    expect(state.selected.size).toBe(0)
  })

  it('visits every occurrence when an id sits in two groups', () => {
    const state = fake([
      ['a', 'b'],
      ['b', 'c']
    ])
    const cursor = new FocusCursor(state.surface)
    cursor.activate('b')
    cursor.move(1)
    expect(state.active()).toBe('b')
    cursor.move(1)
    expect(state.active()).toBe('c')
  })

  it('visits every occurrence inside one group', () => {
    const state = fake([['a', 'b', 'a', 'c']])
    const cursor = new FocusCursor(state.surface)
    cursor.activate('a')
    cursor.move(1)
    expect(state.active()).toBe('b')
    cursor.move(1)
    expect(state.active()).toBe('a')
    cursor.move(1)
    expect(state.active()).toBe('c')
  })

  it('follows the occurrence the surface actually painted', () => {
    let active: string | null = 'b'
    const surface: KeyboardSurface = {
      context: 'table',
      groups: () => [
        ['a', 'b'],
        ['b', 'c']
      ],
      activeId: () => active,
      setActive: (id) => {
        active = id
      },
      activePosition: () => ({ group: 1, index: 0 })
    }
    const cursor = new FocusCursor(surface)
    cursor.reconcile()
    cursor.move(1)
    expect(active).toBe('c')
  })

  it('asks the surface to paint the occurrence it is on', () => {
    const calls: [string, number, number][] = []
    const state = fake([
      ['a', 'b'],
      ['b', 'c']
    ])
    state.surface.setActiveAt = (id, group, index) => {
      if (id) calls.push([id, group, index])
      state.surface.setActive(id)
    }
    const cursor = new FocusCursor(state.surface)
    cursor.activate('b')
    cursor.move(1)
    expect(calls).toEqual([
      ['b', 0, 1],
      ['b', 1, 0]
    ])
  })

  it('moves by column from a standing start', () => {
    const state = fake([['a'], ['b'], ['c']])
    const cursor = new FocusCursor(state.surface)
    cursor.moveGroup(1)
    expect(state.active()).toBe('a')
    cursor.clearActive()
    cursor.moveGroup(-1)
    expect(state.active()).toBe('c')
  })

  it('carries the cursor to an id that exists', () => {
    const state = fake([['a'], ['b']])
    const cursor = new FocusCursor(state.surface)
    expect(cursor.activate('b')).toBe(true)
    expect(state.active()).toBe('b')
    expect(cursor.activate('missing')).toBe(false)
  })

  it('targets the selection first, then the active item', () => {
    const state = fake([['a', 'b']])
    const cursor = new FocusCursor(state.surface)
    state.surface.setActive('b')
    expect(cursor.targetIds()).toEqual(['b'])
    state.selected.add('a')
    expect(cursor.targetIds()).toEqual(['a'])
  })
})
