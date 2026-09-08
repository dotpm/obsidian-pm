// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATUSES, makeTask } from '@dotpm/core'
import { KanbanCard } from './KanbanCard'
import { renderStatusBadge } from '../StatusBadge'

function noop(): void {}

describe('KanbanCard outside Obsidian', () => {
  it('renders the task with the plain DOM platform', () => {
    const host = document.body.createDiv()
    const onClick = vi.fn<() => void>()
    const card = new KanbanCard(host, {
      people: [],
      task: makeTask({ id: 't1', title: 'Write the spec', due: '2030-01-01', tags: ['docs'] }),
      priorityColor: 'red',
      parentTitle: 'Launch',
      loggedHours: 0,
      overdue: false,
      showTagColors: false,
      onClick,
      onContextMenu: noop,
      onDragStart: noop,
      onDragEnd: noop
    })
    expect(card.el.dataset.taskId).toBe('t1')
    expect(card.el.find('.pm-kanban-card-title')?.textContent).toBe('Write the spec')
    expect(card.el.find('.pm-kanban-card-parent')?.textContent).toBe('Launch')
    expect(card.el.find('.pm-kanban-card-priority-bar')).not.toBeNull()
    card.el.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('status badge outside Obsidian', () => {
  it('opens a menu of statuses and reports the pick', () => {
    const host = document.body.createDiv()
    const onChange = vi.fn<(status: string) => void>()
    const task = makeTask({ title: 'Pick me', status: DEFAULT_STATUSES[0].id })
    const badge = renderStatusBadge(host, task, DEFAULT_STATUSES, onChange)
    expect(badge.textContent).toContain(DEFAULT_STATUSES[0].label)

    badge.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 20 }))
    const items = document.body.findAll('.menu .menu-item')
    expect(items.map((item) => item.find('.menu-item-title')?.textContent)).toEqual(
      DEFAULT_STATUSES.map((status) => status.label)
    )
    expect(items[0].hasClass('mod-checked')).toBe(true)

    items[1].click()
    expect(onChange).toHaveBeenCalledWith(DEFAULT_STATUSES[1].id)
    expect(document.body.find('.menu')).toBeNull()
  })
})
