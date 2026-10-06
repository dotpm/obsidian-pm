import { describe, expect, it } from 'vitest'
import type { CustomFieldDef, ViewFields } from '../types'
import {
  availableFields,
  columnWidth,
  defaultFields,
  hiddenFields,
  legacyBoardFields,
  shownFields,
  tidyFields,
  viewFieldLabel,
  withFieldShown
} from './ViewFields'

const client: CustomFieldDef = { id: 'client', name: 'Client', type: 'text' }
const one = { customFields: [client], multi: false }
const many = { customFields: [client], multi: true }

describe('view fields', () => {
  it('offers the project only while a view spans projects', () => {
    expect(availableFields('table', one)).not.toContain('project')
    expect(availableFields('table', many)).toContain('project')
    expect(availableFields('table', one).at(-1)).toBe('cf:client')
  })

  it('shows custom fields by default in a table only', () => {
    expect(defaultFields('table', one)).toContain('cf:client')
    expect(defaultFields('kanban', one)).not.toContain('cf:client')
    expect(defaultFields('kanban', one)).not.toContain('description')
    expect(defaultFields('gantt', one)).toEqual(['title'])
  })

  it('keeps the title first and drops fields that no longer exist', () => {
    const fields: ViewFields = { table: { visible: ['due', 'cf:gone', 'title', 'status'] } }
    expect(shownFields(fields, 'table', one)).toEqual(['title', 'due', 'status'])
    expect(hiddenFields(fields, 'table', one)).toEqual(['priority', 'assignees', 'progress', 'time', 'cf:client'])
  })

  it('keeps the title in a table even when every field is hidden', () => {
    expect(shownFields({ table: { visible: [] } }, 'table', one)).toEqual(['title'])
    expect(shownFields({ kanban: { visible: [] } }, 'kanban', one)).toEqual([])
  })

  it('reads a dragged width over the default and lets the title fill', () => {
    const fields: ViewFields = { table: { visible: ['title', 'due'], widths: { due: 80 } } }
    expect(columnWidth(fields, 'due')).toBe(80)
    expect(columnWidth(fields, 'status')).toBe(130)
    expect(columnWidth(fields, 'cf:client')).toBe(120)
    expect(columnWidth(fields, 'title')).toBeUndefined()
  })

  it('forgets a mode put back to its defaults', () => {
    const fields: ViewFields = {
      table: { visible: defaultFields('table', one), widths: {} },
      kanban: { visible: ['due'] }
    }
    tidyFields(fields, one)
    expect(fields).toEqual({ kanban: { visible: ['due'] } })
  })

  it('keeps a mode that only changed widths', () => {
    const fields: ViewFields = { table: { visible: defaultFields('table', one), widths: { due: 90 } } }
    tidyFields(fields, one)
    expect(fields.table?.widths).toEqual({ due: 90 })
  })

  it('turns the old board settings into card fields', () => {
    expect(legacyBoardFields(false, false)).toEqual({})
    const shown = shownFields(legacyBoardFields(true, true), 'kanban', one)
    expect(shown).toContain('subtasks')
    expect(shown).toContain('description')
    expect(shownFields(legacyBoardFields(false, true), 'kanban', one)).not.toContain('subtasks')
  })

  it('names custom fields by their name', () => {
    expect(viewFieldLabel('cf:client', [client])).toBe('Client')
    expect(viewFieldLabel('due', [])).toBe('Due')
  })
})

describe('withFieldShown', () => {
  const order = ['a', 'b', 'c', 'd']

  it('puts a field back between the ones around it in the order', () => {
    expect(withFieldShown(['a', 'c', 'd'], 'b', order)).toEqual(['a', 'b', 'c', 'd'])
    expect(withFieldShown(['b', 'c'], 'a', order)).toEqual(['a', 'b', 'c'])
    expect(withFieldShown(['a', 'b'], 'd', order)).toEqual(['a', 'b', 'd'])
  })

  it('keeps a reordered list as it is around the field', () => {
    expect(withFieldShown(['d', 'a'], 'c', order)).toEqual(['c', 'd', 'a'])
    expect(withFieldShown([], 'b', order)).toEqual(['b'])
  })
})
