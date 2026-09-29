// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  makeDefaultFilter,
  makeTask,
  type CustomFieldDef,
  type GroupState,
  type SortRule,
  type FilterState,
  type NonWorkingDays,
  type ProjectListFilter,
  type ViewFields
} from '@dotpm/core'
import { ChipButton } from '#primitives/ChipButton'
import { renderBreadcrumb } from './Breadcrumb'
import { FilterBar } from './FilterBar'
import { openFieldsPopover } from './fieldsPopover'
import { openGroupPopover } from './groupPopover'
import { openNonWorkingDaysPopover } from './nonWorkingDaysPopover'
import { openProjectFilterPopover } from './projectFilterPopover'
import { openSavedViewsPopover, type SavedViewsProps } from './savedViewsPopover'
import type { BoardColumn } from '../../views/boardColumns'
import { SearchBox } from './SearchBox'
import { openSortPopover, type SortField } from './sortPopover'
import { ViewHeader } from './ViewHeader'

function noop(): void {}

const FIELDS: CustomFieldDef[] = [
  { id: 'estimate', name: 'Estimate', type: 'number' },
  { id: 'secret', name: 'Secret', type: 'text', filterable: false }
]

const TASKS = [
  makeTask({ id: 'a', status: 'todo', assignees: ['Ada'] }),
  makeTask({ id: 'b', status: 'todo' }),
  makeTask({ id: 'c', status: 'done', archived: true })
]

function mountBar(filter: FilterState, onChange = vi.fn<() => void>()): FilterBar {
  return new FilterBar(document.body.createDiv(), {
    filter,
    tasks: TASKS,
    ctx: { statuses: DEFAULT_STATUSES, customFields: FIELDS },
    priorities: DEFAULT_PRIORITIES,
    priorityIcons: 'chevrons',
    projects: [],
    summary: '1 of 3 shown',
    onChange,
    onClose: noop
  })
}

const visibleChips = (bar: FilterBar): HTMLElement[] => bar.el.findAll('.pm-filter-chip:not(.pm-hidden)')

const menuTitles = (): string[] => document.body.findAll('.menu .menu-item-title').map((item) => item.textContent ?? '')

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  document.body.empty()
})

describe('ChipButton', () => {
  it('keeps icon, label, badge and chevron in that order whatever order they are set in', () => {
    const button = new ChipButton(document.body)
      .setChevron(true)
      .setBadge('2')
      .setLabel('Filter')
      .setIcon('list-filter')
    expect(Array.from(button.el.children).map((child) => child.className)).toEqual([
      'pm-chip-btn-icon',
      'pm-chip-btn-label',
      'pm-chip-btn-badge',
      'pm-chip-btn-chevron'
    ])
    button.setBadge('')
    expect(button.el.find('.pm-chip-btn-badge')).toBeNull()
  })
})

describe('FilterBar', () => {
  it('describes each condition as field, operator and value', () => {
    const filter: FilterState = {
      showArchived: false,
      conditions: [
        { field: 'status', op: 'any', value: ['todo', 'in-progress'] },
        { field: 'due', op: 'bucket', value: 'overdue' },
        { field: 'cf:estimate', op: 'between', value: [2, 8] },
        { field: 'tag', op: 'empty' }
      ]
    }
    const bar = mountBar(filter)
    const chips = visibleChips(bar)
    expect(chips.map((chip) => chip.find('.pm-filter-chip-op')?.textContent)).toEqual([
      'is any of',
      'is',
      'is between',
      'is empty'
    ])
    expect(chips.map((chip) => chip.find('.pm-filter-chip-value')?.textContent)).toEqual([
      `${DEFAULT_STATUSES[0].label}, ${DEFAULT_STATUSES[1].label}`,
      'Overdue',
      '2 to 8',
      ''
    ])
    expect(chips[3].find('.pm-filter-chip-value')?.hasClass('pm-hidden')).toBe(true)
    expect(bar.el.find('.pm-filter-bar-summary')?.textContent).toBe('1 of 3 shown')
  })

  it('removes a condition and clears them all', () => {
    const onChange = vi.fn<() => void>()
    const filter: FilterState = {
      showArchived: true,
      conditions: [
        { field: 'status', op: 'any', value: ['todo'] },
        { field: 'priority', op: 'any', value: ['high'] }
      ]
    }
    const bar = mountBar(filter, onChange)
    expect(visibleChips(bar).length).toBe(3)
    bar.el.find('.pm-filter-chip-remove')?.click()
    expect(filter.conditions.map((c) => c.field)).toEqual(['priority'])
    expect(visibleChips(bar).length).toBe(2)

    bar.el.find('.pm-filter-bar-clear')?.click()
    expect(filter.conditions).toEqual([])
    expect(filter.showArchived).toBe(false)
    expect(visibleChips(bar).length).toBe(0)
    expect(bar.el.find('.pm-filter-bar-clear')?.hasClass('pm-hidden')).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('offers the built-in fields and every custom field not opted out', () => {
    mountBar(makeDefaultFilter()).openPicker()
    const labels = document.body.findAll('.pm-filter-pop .pm-pop-item-label').map((el) => el.textContent)
    expect(labels).toEqual([
      'Status',
      'Priority',
      'Assignee',
      'Tag',
      'Due date',
      'Start date',
      'Type',
      'Title',
      'Estimate',
      'Include archived'
    ])
  })

  it('adds a condition from the value list, with counts that leave archived tasks out', () => {
    const filter = makeDefaultFilter()
    const bar = mountBar(filter)
    bar.openPicker()
    document.body.findAll('.pm-filter-pop .pm-pop-item')[0].click()
    const rows = document.body.findAll('.pm-filter-pop-value .pm-pop-item')
    const todo = rows.find((row) => row.find('.pm-pop-item-label')?.textContent === DEFAULT_STATUSES[0].label)
    const done = rows.find((row) => row.find('.pm-pop-item-label')?.textContent === 'Done')
    expect(todo?.find('.pm-pop-item-note')?.textContent).toBe('2')
    expect(done?.find('.pm-pop-item-note')?.textContent).toBe('0')
    todo?.click()
    expect(filter.conditions).toEqual([{ field: 'status', op: 'any', value: ['todo'] }])
    expect(visibleChips(bar).length).toBe(1)
  })

  it('edits a condition in place from its chip', () => {
    const filter: FilterState = { showArchived: false, conditions: [{ field: 'status', op: 'any', value: ['todo'] }] }
    const bar = mountBar(filter)
    visibleChips(bar)[0].querySelector<HTMLButtonElement>('.pm-filter-chip-op')?.click()
    const ops = document.body.findAll('.pm-filter-pop-op')
    ops.find((op) => op.textContent === 'is none of')?.click()
    expect(filter.conditions).toEqual([{ field: 'status', op: 'none', value: ['todo'] }])
    expect(visibleChips(bar)[0].find('.pm-filter-chip-op')?.textContent).toBe('is not')
  })

  it('drops a condition whose values are cleared', () => {
    const filter: FilterState = { showArchived: false, conditions: [{ field: 'status', op: 'any', value: ['todo'] }] }
    const bar = mountBar(filter)
    visibleChips(bar)[0].querySelector<HTMLButtonElement>('.pm-filter-chip-value')?.click()
    document.body
      .findAll('.pm-filter-pop-value .pm-pop-item')
      .find((row) => row.find('.pm-pop-item-label')?.textContent === DEFAULT_STATUSES[0].label)
      ?.click()
    expect(filter.conditions).toEqual([])
    expect(visibleChips(bar).length).toBe(0)
  })

  it('filters by text as it is typed', () => {
    const filter = makeDefaultFilter()
    const bar = mountBar(filter)
    bar.openPicker()
    document.body
      .findAll('.pm-filter-pop .pm-pop-item')
      .find((row) => row.find('.pm-pop-item-label')?.textContent === 'Title')
      ?.click()
    const input = document.body.querySelector<HTMLInputElement>('.pm-filter-pop-value input')
    if (!input) throw new Error('no text field')
    input.value = 'copy'
    input.dispatchEvent(new Event('input'))
    expect(filter.conditions).toEqual([{ field: 'title', op: 'contains', value: 'copy' }])
  })
})

describe('saved views popover', () => {
  const views = [
    { id: 'v1', name: 'Mine', modeIcon: 'table' },
    { id: 'v2', name: 'Roadmap', isDefault: true }
  ]
  const props = (overrides: Partial<SavedViewsProps> = {}): SavedViewsProps => ({
    views,
    activeId: 'v2',
    changes: [],
    canSave: true,
    storageNote: 'Kept in the note of Alpha.',
    onSelect: vi.fn<(id: string | null) => void>(),
    onSave: vi.fn<(name: string, isDefault: boolean) => Promise<void>>(async () => {}),
    onUpdate: vi.fn<(id: string) => Promise<void>>(async () => {}),
    onRevert: vi.fn<() => void>(),
    onRename: vi.fn<(id: string, name: string) => Promise<void>>(async () => {}),
    onDelete: vi.fn<(id: string) => Promise<void>>(async () => {}),
    onReorder: vi.fn<(ids: string[]) => Promise<void>>(async () => {}),
    onSetDefault: vi.fn<(id: string | null) => Promise<void>>(async () => {}),
    ...overrides
  })
  const rows = (): HTMLElement[] => document.body.findAll('.pm-saved-view-row')
  const action = (row: HTMLElement, label: string): HTMLButtonElement | null =>
    row.querySelector<HTMLButtonElement>(`.pm-saved-view-action[aria-label="${label}"]`)

  it('lists the built-in view first, marks the active one and stars the default', () => {
    openSavedViewsPopover(document.body.createEl('button'), props())
    const mains = document.body.findAll('.pm-saved-view-main')
    expect(mains.map((row) => row.find('.pm-pop-item-label')?.textContent)).toEqual(['All tasks', 'Mine', 'Roadmap'])
    expect(mains.map((row) => !row.find('.pm-pop-check')?.hasClass('pm-pop-check--hidden'))).toEqual([
      false,
      false,
      true
    ])
    expect(action(rows()[2], 'Opens with this view')?.hasClass('is-default')).toBe(true)
    expect(document.body.find('.pm-saved-views-dirty')).toBeNull()
  })

  it('offers update, save as new and revert while the active view has unsaved changes', async () => {
    const p = props({ changes: ['Filter', 'Sort'] })
    openSavedViewsPopover(document.body.createEl('button'), p)
    expect(document.body.find('.pm-saved-views-dirty-note')?.textContent).toBe('Unsaved changes: Filter, Sort')
    document.body.find('.pm-saved-views-dirty-actions .mod-cta')?.click()
    await vi.waitFor(() => expect(p.onUpdate).toHaveBeenCalledWith('v2'))

    openSavedViewsPopover(document.body.createEl('button'), p)
    document.body
      .querySelector<HTMLButtonElement>('.pm-saved-views-dirty-actions [aria-label="Revert changes"]')
      ?.click()
    expect(p.onRevert).toHaveBeenCalled()
  })

  it('selects, stars and deletes through its callbacks', async () => {
    const p = props()
    openSavedViewsPopover(document.body.createEl('button'), p)
    action(rows()[1], 'Delete view')?.click()
    await vi.waitFor(() => expect(p.onDelete).toHaveBeenCalledWith('v1'))

    openSavedViewsPopover(document.body.createEl('button'), p)
    action(rows()[1], 'Open with this view')?.click()
    await vi.waitFor(() => expect(p.onSetDefault).toHaveBeenCalledWith('v1'))

    openSavedViewsPopover(document.body.createEl('button'), p)
    action(rows()[2], 'Opens with this view')?.click()
    await vi.waitFor(() => expect(p.onSetDefault).toHaveBeenCalledWith(null))

    openSavedViewsPopover(document.body.createEl('button'), p)
    document.body.findAll('.pm-saved-view-main')[0].click()
    expect(p.onSelect).toHaveBeenCalledWith(null)
  })

  it('renames a view in place', async () => {
    const p = props()
    openSavedViewsPopover(document.body.createEl('button'), p)
    action(rows()[1], 'Rename view')?.click()
    const input = document.body.querySelector<HTMLInputElement>('.pm-saved-view-rename')
    if (!input) throw new Error('no rename field')
    expect(input.value).toBe('Mine')
    input.value = 'Only mine'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await vi.waitFor(() => expect(p.onRename).toHaveBeenCalledWith('v1', 'Only mine'))
  })

  it('reorders by dragging one view onto another', async () => {
    const p = props()
    openSavedViewsPopover(document.body.createEl('button'), p)
    rows()[2].dispatchEvent(new Event('dragstart'))
    rows()[1].dispatchEvent(new Event('drop'))
    await vi.waitFor(() => expect(p.onReorder).toHaveBeenCalledWith(['v2', 'v1']))
  })

  it('saves the current state under the typed name, as the default when asked', async () => {
    const p = props()
    openSavedViewsPopover(document.body.createEl('button'), p)
    document.body.querySelector<HTMLButtonElement>('.pm-saved-views-foot button')?.click()
    expect(document.body.find('.pm-saved-views-storage')?.textContent).toBe('Kept in the note of Alpha.')
    const input = document.body.querySelector<HTMLInputElement>('.pm-saved-views-foot input.pm-pop-field')
    const star = document.body.querySelector<HTMLInputElement>('.pm-saved-views-check input')
    if (!input || !star) throw new Error('no save form')
    input.value = 'Urgent only'
    star.checked = true
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await vi.waitFor(() => expect(p.onSave).toHaveBeenCalledWith('Urgent only', true))
  })

  it('refuses to save while nothing differs from the defaults', () => {
    openSavedViewsPopover(document.body.createEl('button'), props({ canSave: false }))
    expect(document.body.querySelector<HTMLButtonElement>('.pm-saved-views-foot button')?.disabled).toBe(true)
  })
})

describe('sort popover', () => {
  const fields: SortField[] = [
    { id: 'title', label: 'Task' },
    { id: 'status', label: 'Status', ends: ['To Do', 'Cancelled'] },
    { id: 'due', label: 'Due' }
  ]
  const open = (sort: SortRule[], onReset = vi.fn<() => void>()) => {
    const onChange = vi.fn<() => void>()
    openSortPopover(document.body.createEl('button'), { fields, sort, onChange, onReset })
    return onChange
  }
  const selects = (cls: string): HTMLSelectElement[] =>
    Array.from(document.body.querySelectorAll<HTMLSelectElement>(`select.${cls}`))

  it('adds keys up to the limit and names directions by field', () => {
    const sort: SortRule[] = [{ key: 'status', dir: 'asc' }]
    const onChange = open(sort)
    const add = (): void => document.body.querySelector<HTMLButtonElement>('.pm-sort-add')?.click()
    add()
    add()
    expect(sort.map((rule) => rule.key)).toEqual(['status', 'title', 'due'])
    expect(document.body.querySelector<HTMLButtonElement>('.pm-sort-add')?.disabled).toBe(true)
    expect(document.body.find('.pm-sort-pop-count')?.textContent).toBe('3 of 3')
    expect(Array.from(selects('pm-sort-dir')[2].options).map((o) => o.text)).toEqual(['Earliest first', 'Latest first'])
    expect(Array.from(selects('pm-sort-dir')[0].options).map((o) => o.text)).toEqual(['To Do first', 'Cancelled first'])
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('changes the field and the direction of a key, and removes one', () => {
    const sort: SortRule[] = [
      { key: 'status', dir: 'asc' },
      { key: 'title', dir: 'asc' }
    ]
    open(sort)
    const field = selects('pm-sort-field')[1]
    expect(Array.from(field.options).map((o) => o.value)).toEqual(['title', 'due'])
    field.value = 'due'
    field.dispatchEvent(new Event('change'))
    const dir = selects('pm-sort-dir')[0]
    dir.value = 'desc'
    dir.dispatchEvent(new Event('change'))
    expect(sort).toEqual([
      { key: 'status', dir: 'desc' },
      { key: 'due', dir: 'asc' }
    ])
    document.body.querySelector<HTMLButtonElement>('.pm-sort-remove')?.click()
    expect(sort).toEqual([{ key: 'due', dir: 'asc' }])
  })

  it('moves a key to another rank by dragging it', () => {
    const sort: SortRule[] = [
      { key: 'status', dir: 'asc' },
      { key: 'title', dir: 'asc' }
    ]
    open(sort)
    const rows = document.body.findAll('.pm-sort-row')
    rows[1].dispatchEvent(new Event('dragstart'))
    rows[0].dispatchEvent(new Event('drop'))
    expect(sort.map((rule) => rule.key)).toEqual(['title', 'status'])
  })

  it('resets through the view', () => {
    const onReset = vi.fn<() => void>()
    open([], onReset)
    expect(document.body.find('.pm-sort-pop .pm-pop-empty')).not.toBeNull()
    document.body.querySelector<HTMLButtonElement>('.pm-sort-pop-reset')?.click()
    expect(onReset).toHaveBeenCalled()
  })
})

describe('group popover', () => {
  const columns = (group: GroupState): BoardColumn[] =>
    ['todo', 'doing', 'done'].map((id, index) => ({
      id,
      label: id,
      tasks: index === 2 ? [] : [makeTask({ id })],
      hidden: group.columns?.[group.field]?.hidden?.includes(id) ?? false
    }))
  const open = (group: GroupState) => {
    const onChange = vi.fn<() => void>()
    openGroupPopover(document.body.createEl('button'), {
      fields: [
        { id: 'status', label: 'Status' },
        { id: 'priority', label: 'Priority' }
      ],
      group,
      columns: () => columns(group),
      onChange
    })
    return onChange
  }

  it('switches the field, hides empty columns and hides one by its eye', () => {
    const group: GroupState = { field: 'status' }
    const onChange = open(group)
    const row = document.body.findAll('.pm-vis-row')
    expect(row.map((r) => r.find('.pm-vis-detail')?.textContent)).toEqual(['1', '1', 'empty'])
    row[1].querySelector<HTMLButtonElement>('.pm-vis-eye')?.click()
    expect(group.columns?.status?.hidden).toEqual(['doing'])
    document.body.querySelector<HTMLInputElement>('.pm-group-pop input[type=checkbox]')?.click()
    expect(group.hideEmpty).toBe(true)
    const field = document.body.querySelector<HTMLSelectElement>('select.pm-group-field')
    if (!field) throw new Error('no field picker')
    field.value = 'priority'
    field.dispatchEvent(new Event('change'))
    expect(group.field).toBe('priority')
    expect(group.columns?.status?.hidden).toEqual(['doing'])
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('shows every hidden column again and reorders by dragging', () => {
    const group: GroupState = { field: 'status', columns: { status: { hidden: ['todo'] } } }
    open(group)
    document.body.querySelector<HTMLButtonElement>('.pm-group-head button')?.click()
    expect(group.columns?.status?.hidden).toBeUndefined()
    const rows = document.body.findAll('.pm-vis-row')
    rows[2].dispatchEvent(new Event('dragstart'))
    rows[0].dispatchEvent(new Event('drop'))
    expect(group.columns?.status?.order).toEqual(['done', 'todo', 'doing'])
  })
})

describe('fields popover', () => {
  const catalog = { customFields: [{ id: 'client', name: 'Client', type: 'text' as const }], multi: false }
  const open = (fields: ViewFields, mode: 'table' | 'kanban' = 'table') => {
    const onChange = vi.fn<() => void>()
    openFieldsPopover(document.body.createEl('button'), { mode, fields, catalog, onChange })
    return onChange
  }
  const labels = (): (string | undefined)[] =>
    document.body.findAll('.pm-fields-body > .pm-vis-list:first-child .pm-vis-label').map((el) => el.textContent ?? '')

  it('lists the table columns with their widths, the title locked', () => {
    open({})
    expect(labels()).toEqual(['Task', 'Status', 'Priority', 'Assignees', 'Due', 'Progress', 'Time', 'Client'])
    const first = document.body.find('.pm-vis-row')
    expect(first?.find('.pm-vis-lock')).not.toBeNull()
    expect(first?.find('.pm-vis-detail')?.textContent).toBe('fill')
    expect(document.body.findAll('.pm-vis-detail')[1].textContent).toBe('130')
  })

  it('hides a field by its eye and shows it again at the end', () => {
    const fields: ViewFields = {}
    const onChange = open(fields)
    document.body.findAll('.pm-vis-row')[1].querySelector<HTMLButtonElement>('.pm-vis-eye')?.click()
    expect(fields.table?.visible).not.toContain('status')
    expect(document.body.find('.pm-fields-hidden-head')).not.toBeNull()
    document.body.find('.pm-vis-row.is-hidden')?.querySelector<HTMLButtonElement>('.pm-vis-eye')?.click()
    expect(fields.table?.visible.at(-1)).toBe('status')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('forgets a list put back to the defaults', () => {
    const fields: ViewFields = { kanban: { visible: ['priority', 'time', 'tags', 'progress', 'assignees'] } }
    open(fields, 'kanban')
    const due = document.body.findAll('.pm-vis-row.is-hidden').find((row) => row.dataset.id === 'due')
    due?.querySelector<HTMLButtonElement>('.pm-vis-eye')?.click()
    expect(fields.kanban).toBeUndefined()
  })

  it('reorders by dragging, hides all and resets widths', () => {
    const fields: ViewFields = { table: { visible: ['title', 'status', 'due'], widths: { due: 70 } } }
    open(fields)
    const rows = document.body.findAll('.pm-vis-row')
    rows[2].dispatchEvent(new Event('dragstart'))
    rows[1].dispatchEvent(new Event('drop'))
    expect(fields.table?.visible).toEqual(['due', 'status'])
    const [reset, hideAll] = document.body.findAll('.pm-fields-foot button') as HTMLButtonElement[]
    reset.click()
    expect(fields.table?.widths).toBeUndefined()
    hideAll.click()
    expect(fields.table?.visible).toEqual([])
    expect(labels()).toEqual(['Task'])
  })

  it('switches to another presentation by its tab', () => {
    open({})
    document.body.findAll('.pm-fields-tabs button')[2].click()
    expect(labels()).toEqual(['Task'])
    expect(document.body.find('.pm-vis-detail')).toBeNull()
  })
})

describe('non-working days popover', () => {
  it('toggles weekends and holidays and edits the holiday list', () => {
    const days: NonWorkingDays = {}
    const onChange = vi.fn<() => void>()
    const onHolidaysChange = vi.fn<(holidays: string[]) => void>()
    openNonWorkingDaysPopover(document.body.createEl('button'), {
      days,
      holidays: ['2026-12-25', '2026-12-24'],
      onChange,
      onHolidaysChange
    })
    const boxes = document.body.findAll('.pm-days-pop input[type=checkbox]') as HTMLInputElement[]
    boxes[0].click()
    expect(days).toEqual({ weekends: true })
    boxes[0].click()
    boxes[1].click()
    expect(days).toEqual({ holidays: true })
    expect(onChange).toHaveBeenCalledTimes(3)

    expect(document.body.findAll('.pm-days-chip')).toHaveLength(2)
    document.body.find('.pm-days-chip .pm-chip-rm')?.click()
    expect(onHolidaysChange).toHaveBeenLastCalledWith(['2026-12-24'])

    document.body.find('.pm-days-list .pm-prop-add')?.click()
    const input = document.body.find('.pm-days-input') as HTMLInputElement
    input.value = '2026-12-31'
    input.dispatchEvent(new Event('change'))
    expect(onHolidaysChange).toHaveBeenLastCalledWith(['2026-12-24', '2026-12-31'])
    expect(document.body.findAll('.pm-days-chip')).toHaveLength(2)
  })
})

describe('project filter popover', () => {
  it('checks progress stages and tags, then clears them', () => {
    const filter: ProjectListFilter = {}
    const onChange = vi.fn<() => void>()
    openProjectFilterPopover(document.body.createEl('button'), {
      filter,
      progress: { 'not-started': 2, 'in-progress': 5, complete: 1 },
      tags: [{ tag: 'client', count: 3 }],
      onChange
    })
    const rows = (): HTMLElement[] => document.body.findAll('.pm-project-filter .pm-pop-item')
    expect(rows().map((row) => row.find('.pm-pop-item-note')?.textContent)).toEqual(['2', '5', '1', '3'])
    rows()[2].click()
    rows()[3].click()
    expect(filter).toEqual({ progress: ['complete'], tags: ['client'] })
    rows()[3].click()
    expect(filter).toEqual({ progress: ['complete'] })
    document.body.find('.pm-project-filter .pm-sort-pop-reset')?.click()
    expect(filter).toEqual({})
    expect(onChange).toHaveBeenCalledTimes(4)
  })
})

describe('breadcrumb', () => {
  it('opens an ancestor, the switcher and the mode menu', () => {
    const onOpen = vi.fn<(newTab: boolean) => void>()
    const onSwitch = vi.fn<(anchor: HTMLElement) => void>()
    const onMode = vi.fn<(anchor: HTMLElement) => void>()
    const nav = renderBreadcrumb(document.body, {
      ancestors: [{ title: 'Acme', onOpen }],
      title: 'Website',
      onSwitch,
      foldLabel: 'Parent projects',
      mode: { icon: 'table', label: 'Table', tooltip: 'View mode: Table', onOpen: onMode }
    })
    nav
      .querySelector<HTMLButtonElement>('.pm-crumb--ancestor')
      ?.dispatchEvent(new MouseEvent('click', { ctrlKey: true }))
    expect(onOpen).toHaveBeenCalledWith(true)
    nav.querySelector<HTMLButtonElement>('.pm-crumb--current')?.click()
    expect(onSwitch).toHaveBeenCalled()
    nav.querySelector<HTMLButtonElement>('.pm-crumb--mode')?.click()
    expect(onMode).toHaveBeenCalled()
  })

  it('lists the folded ancestors in a menu', () => {
    const onOpen = vi.fn<(newTab: boolean) => void>()
    const nav = renderBreadcrumb(document.body, {
      ancestors: [
        { title: 'Clients', onOpen: noop },
        { title: 'Acme', onOpen }
      ],
      title: 'Website',
      foldLabel: 'Parent projects'
    })
    nav.querySelector<HTMLButtonElement>('.pm-crumb-fold')?.click()
    expect(menuTitles()).toEqual(['Clients', 'Acme'])
    document.body.findAll('.menu .menu-item')[1].click()
    expect(onOpen).toHaveBeenCalledWith(false)
  })

  it('leaves a title without a switcher inert', () => {
    const nav = renderBreadcrumb(document.body, { ancestors: [], title: 'All projects', foldLabel: '' })
    expect(nav.querySelector<HTMLButtonElement>('.pm-crumb--current')?.disabled).toBe(true)
    expect(nav.find('.pm-crumb-fold')).toBeNull()
  })
})

describe('SearchBox', () => {
  it('clears on the first Escape and closes on the second', () => {
    const onChange = vi.fn<(value: string) => void>()
    const box = new SearchBox(document.body, {
      value: 'checkout',
      label: 'Search',
      placeholder: 'Search tasks',
      clearLabel: 'Clear',
      onChange
    })
    expect(box.el.hasClass('is-open')).toBe(true)
    const input = box.el.querySelector<HTMLInputElement>('input')
    if (!input) throw new Error('no input')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(input.value).toBe('')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(box.el.hasClass('is-open')).toBe(false)
  })
})

describe('ViewHeader', () => {
  it('steps through the compact levels until the row fits', () => {
    const header = new ViewHeader(document.body)
    const row = header.el.find('.pm-vh-row')
    if (!row) throw new Error('no row')
    Object.defineProperty(row, 'clientWidth', { value: 400 })
    Object.defineProperty(row, 'scrollWidth', {
      get: () => (header.el.hasClass('pm-vh--terse') ? 380 : header.el.hasClass('pm-vh--icons') ? 450 : 600)
    })
    header.fit()
    expect(header.el.hasClass('pm-vh--icons')).toBe(true)
    expect(header.el.hasClass('pm-vh--terse')).toBe(true)
    expect(header.el.hasClass('pm-vh--folded')).toBe(false)
    expect(header.el.hasClass('pm-vh--measuring')).toBe(false)
    header.destroy()
  })

  it('stays at full labels when everything fits', () => {
    const header = new ViewHeader(document.body)
    header.fit()
    expect(header.el.hasClass('pm-vh--icons')).toBe(false)
    header.destroy()
  })
})
