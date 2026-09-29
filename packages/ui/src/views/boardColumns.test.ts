import { describe, expect, it } from 'vitest'
import { DEFAULT_PRIORITIES, DEFAULT_STATUSES, makeDefaultFilter, makeTask, type GroupState } from '@dotpm/core'
import type { FilterSetup } from '../composites/ViewHeader/filterPopover'
import { boardColumns, boardField, groupableFields } from './boardColumns'

const tasks = [
  makeTask({ id: 'a', status: 'todo', priority: 'high', assignees: ['Ada'], tags: ['web'] }),
  makeTask({ id: 'b', status: 'todo', priority: 'low', assignees: ['Ada', 'Bo'] }),
  makeTask({ id: 'c', status: 'done', priority: 'high', customFields: { client: 'Acme' } })
]

const setup: FilterSetup = {
  filter: makeDefaultFilter(),
  tasks,
  ctx: {
    statuses: DEFAULT_STATUSES,
    customFields: [
      { id: 'client', name: 'Client', type: 'select', options: ['Acme', 'Globex'] },
      { id: 'estimate', name: 'Estimate', type: 'number' }
    ]
  },
  priorities: DEFAULT_PRIORITIES,
  priorityIcons: 'chevrons',
  projects: []
}

const ids = (group: GroupState) =>
  boardColumns(setup, group, tasks).map((column) => [column.id, column.tasks.map((t) => t.id).join(''), column.hidden])

describe('boardColumns', () => {
  it('makes one column per status, in the palette order, with no column for tasks without one', () => {
    const columns = boardColumns(setup, { field: 'status' }, tasks)
    expect(columns.map((c) => c.id)).toEqual(DEFAULT_STATUSES.map((s) => s.id))
    expect(columns[0].tasks.map((t) => t.id)).toEqual(['a', 'b'])
    expect(columns[0].color).toBe(DEFAULT_STATUSES[0].color)
  })

  it('puts a task with several values in each of their columns, and the rest under none', () => {
    expect(ids({ field: 'assignee' })).toEqual([
      ['Ada', 'ab', false],
      ['Bo', 'b', false],
      ['', 'c', false]
    ])
  })

  it('falls back to status columns when the field is a custom field this scope no longer has', () => {
    const group: GroupState = { field: 'cf:removed', columns: { status: { hidden: ['done'] } } }
    expect(boardField(setup, group)).toBe('status')
    const columns = boardColumns(setup, group, tasks)
    expect(columns.map((c) => c.id)).toEqual(DEFAULT_STATUSES.map((s) => s.id))
    expect(columns.find((c) => c.id === 'done')?.hidden).toBe(true)
    expect(boardField(setup, { field: 'cf:client' })).toBe('cf:client')
  })

  it('offers every option of a custom select, plus a column for tasks without a value', () => {
    expect(ids({ field: 'cf:client' })).toEqual([
      ['Acme', 'c', false],
      ['Globex', '', false],
      ['', 'ab', false]
    ])
  })

  it('follows the saved order and flags hidden and empty columns without dropping them', () => {
    const group: GroupState = {
      field: 'priority',
      hideEmpty: true,
      columns: { priority: { order: ['low', 'high'], hidden: ['low'] }, status: { hidden: ['todo'] } }
    }
    expect(ids(group)).toEqual([
      ['low', 'b', true],
      ['high', 'ac', false],
      ['critical', '', true],
      ['medium', '', true]
    ])
  })

  it('groups only by fields with a list of values', () => {
    expect(groupableFields(setup)).toEqual(['status', 'priority', 'assignee', 'tag', 'type', 'cf:client'])
  })
})
