import { describe, expect, it } from 'vitest'
import { makeDefaultFilter, makeDefaultGroup, makeDefaultSort, type SavedView } from '../types'
import { sameValue, viewDifferences, type ViewState } from './ViewState'

const view: SavedView = {
  id: 'v1',
  name: 'Sprint',
  filter: { showArchived: false, conditions: [{ field: 'status', op: 'any', value: ['todo'] }] },
  sort: [{ key: 'due', dir: 'asc' }],
  viewMode: 'table',
  ganttGranularity: 'week'
}

function state(overrides: Partial<ViewState> = {}): ViewState {
  return {
    filter: structuredClone(view.filter),
    sort: structuredClone(view.sort),
    group: makeDefaultGroup(),
    fields: {},
    mode: 'table',
    granularity: 'week',
    ...overrides
  }
}

describe('viewDifferences', () => {
  it('finds nothing when the state is the view', () => {
    expect(viewDifferences(view, state())).toEqual([])
  })

  it('ignores the order keys were written in', () => {
    const filter = { conditions: [{ value: ['todo'], op: 'any' as const, field: 'status' }], showArchived: false }
    expect(viewDifferences(view, state({ filter }))).toEqual([])
  })

  it('names each part that differs', () => {
    const changed = state({
      filter: makeDefaultFilter(),
      sort: makeDefaultSort(),
      mode: 'kanban',
      granularity: 'month'
    })
    expect(viewDifferences(view, changed)).toEqual(['filter', 'sort', 'mode', 'scale'])
  })

  it('compares the grouping only when the view saved one', () => {
    const byPriority = { field: 'priority', columns: { priority: { hidden: ['low'] } } }
    expect(viewDifferences(view, state({ group: byPriority }))).toEqual([])
    const grouped: SavedView = { ...view, group: makeDefaultGroup() }
    expect(viewDifferences(grouped, state({ group: byPriority }))).toEqual(['group'])
  })

  it('compares the fields only when the view saved them', () => {
    const narrow = { table: { visible: ['title'] } }
    expect(viewDifferences(view, state({ fields: narrow }))).toEqual([])
    expect(viewDifferences({ ...view, fields: {} }, state({ fields: narrow }))).toEqual(['fields'])
    expect(viewDifferences({ ...view, fields: narrow }, state({ fields: { table: { visible: ['title'] } } }))).toEqual(
      []
    )
  })

  it('does not care about a mode or scale the view never named', () => {
    const loose: SavedView = { ...view, viewMode: undefined, ganttGranularity: undefined }
    expect(viewDifferences(loose, state({ mode: 'gantt', granularity: 'year' }))).toEqual([])
  })

  it('counts a different order of sort keys as a change', () => {
    const two: SavedView = {
      ...view,
      sort: [
        { key: 'due', dir: 'asc' },
        { key: 'title', dir: 'asc' }
      ]
    }
    const swapped = state({ sort: [two.sort[1], two.sort[0]] })
    expect(viewDifferences(two, swapped)).toEqual(['sort'])
  })
})

describe('sameValue', () => {
  it('compares nested values by content', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(sameValue([1, 2], [2, 1])).toBe(false)
  })
})
