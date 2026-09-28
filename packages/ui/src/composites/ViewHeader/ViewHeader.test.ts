// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  makeDefaultFilter,
  makeDefaultSort,
  makeTask,
  type CustomFieldDef,
  type FilterState
} from '@dotpm/core'
import { ChipButton } from '#primitives/ChipButton'
import { renderBreadcrumb } from './Breadcrumb'
import { FilterBar } from './FilterBar'
import { openSavedViewsPopover } from './savedViewsPopover'
import { SearchBox } from './SearchBox'
import { openSortPopover } from './sortPopover'
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
    { id: 'v2', name: 'Roadmap' }
  ]
  const props = () => ({
    views,
    activeId: 'v2',
    canSave: true,
    onSelect: vi.fn<(id: string | null) => void>(),
    onSave: vi.fn<(name: string) => Promise<void>>(async () => {}),
    onUpdate: vi.fn<(id: string) => Promise<void>>(async () => {}),
    onDelete: vi.fn<(id: string) => Promise<void>>(async () => {})
  })

  it('lists the built-in view first and marks the active one', () => {
    openSavedViewsPopover(document.body.createEl('button'), props())
    const rows = document.body.findAll('.pm-saved-view-main')
    expect(rows.map((row) => row.find('.pm-pop-item-label')?.textContent)).toEqual(['All tasks', 'Mine', 'Roadmap'])
    expect(rows.map((row) => !row.find('.pm-pop-check')?.hasClass('pm-pop-check--hidden'))).toEqual([
      false,
      false,
      true
    ])
  })

  it('selects, updates and deletes through its callbacks', async () => {
    const p = props()
    openSavedViewsPopover(document.body.createEl('button'), p)
    document.body.findAll('.pm-saved-view-row')[1].findAll('.pm-saved-view-action')[1].click()
    await vi.waitFor(() => expect(p.onDelete).toHaveBeenCalledWith('v1'))

    openSavedViewsPopover(document.body.createEl('button'), p)
    document.body.findAll('.pm-saved-view-main')[0].click()
    expect(p.onSelect).toHaveBeenCalledWith(null)
  })

  it('saves the current state under the typed name', async () => {
    const p = props()
    openSavedViewsPopover(document.body.createEl('button'), p)
    document.body.querySelector<HTMLButtonElement>('.pm-saved-views-foot button')?.click()
    const input = document.body.querySelector<HTMLInputElement>('.pm-saved-views-foot input')
    if (!input) throw new Error('no name field')
    input.value = 'Urgent only'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await vi.waitFor(() => expect(p.onSave).toHaveBeenCalledWith('Urgent only'))
  })

  it('refuses to save while nothing differs from the defaults', () => {
    openSavedViewsPopover(document.body.createEl('button'), { ...props(), canSave: false })
    expect(document.body.querySelector<HTMLButtonElement>('.pm-saved-views-foot button')?.disabled).toBe(true)
  })
})

describe('sort popover', () => {
  it('changes the key and the direction in place', () => {
    const sort = makeDefaultSort()
    const onChange = vi.fn<() => void>()
    openSortPopover(document.body.createEl('button'), {
      fields: [
        { id: 'title', label: 'Task' },
        { id: 'status', label: 'Status' }
      ],
      sort,
      onChange
    })
    document.body.findAll('.pm-pop-list .pm-pop-item')[0].click()
    expect(sort.sortKey).toBe('title')
    document.body.findAll('.pm-sort-dir button')[1].click()
    expect(sort.sortDir).toBe('desc')
    expect(onChange).toHaveBeenCalledTimes(2)
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
