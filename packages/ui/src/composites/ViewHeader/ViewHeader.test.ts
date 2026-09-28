// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRIORITIES, DEFAULT_STATUSES, makeDefaultFilter, makeDefaultSort, type FilterState } from '@dotpm/core'
import { ChipButton } from '#primitives/ChipButton'
import { renderBreadcrumb } from './Breadcrumb'
import { FilterBar } from './FilterBar'
import { openSavedViewsPopover } from './savedViewsPopover'
import { SearchBox } from './SearchBox'
import { openSortPopover } from './sortPopover'
import { ViewHeader } from './ViewHeader'

function noop(): void {}

function mountBar(filter: FilterState, onChange = vi.fn<() => void>()): FilterBar {
  return new FilterBar(document.body.createDiv(), {
    filter,
    statuses: DEFAULT_STATUSES,
    priorities: DEFAULT_PRIORITIES,
    priorityIcons: 'chevrons',
    assignees: ['Ada'],
    tags: [],
    summary: '1 of 3 shown',
    onChange,
    onClose: noop
  })
}

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
  it('shows one chip per field with the values it holds', () => {
    const filter = { ...makeDefaultFilter(), statuses: ['todo', 'in-progress'], dueDateFilter: 'overdue' as const }
    const bar = mountBar(filter)
    const chips = bar.el.findAll('.pm-filter-chip')
    expect(chips.map((chip) => chip.find('.pm-filter-chip-op')?.textContent)).toEqual(['is any of', 'is'])
    expect(chips[0].find('.pm-filter-chip-value')?.textContent).toBe(
      `${DEFAULT_STATUSES[0].label}, ${DEFAULT_STATUSES[1].label}`
    )
    expect(bar.el.find('.pm-filter-bar-summary')?.textContent).toBe('1 of 3 shown')
  })

  it('removes a field and clears them all', () => {
    const onChange = vi.fn<() => void>()
    const filter = { ...makeDefaultFilter(), statuses: ['todo'], priorities: ['high'], showArchived: true }
    const bar = mountBar(filter, onChange)
    bar.el.find('.pm-filter-chip-remove')?.click()
    expect(filter.statuses).toEqual([])
    expect(bar.el.findAll('.pm-filter-chip').length).toBe(2)

    bar.el.find('.pm-filter-bar-clear')?.click()
    expect(filter.priorities).toEqual([])
    expect(filter.showArchived).toBe(false)
    expect(bar.el.findAll('.pm-filter-chip').length).toBe(0)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('offers every field in the picker and applies a due date from it', async () => {
    const filter = makeDefaultFilter()
    const bar = mountBar(filter)
    bar.openPicker()
    expect(menuTitles()).toEqual(['Status', 'Priority', 'Assignee', 'Due date', 'Include archived'])
    document.body.findAll('.menu .menu-item')[3].click()
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    document.body.findAll('.menu .menu-item')[0].click()
    expect(filter.dueDateFilter).toBe('overdue')
    expect(bar.el.find('.pm-filter-chip-value')?.textContent).toBe('Overdue')
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
