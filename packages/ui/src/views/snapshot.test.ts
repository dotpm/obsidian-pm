// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  makeDefaultFilter,
  makeTask,
  type ResolvedProjectConfig
} from '@dotpm/core'
import type { ViewModel } from './model'
import { renderSnapshotGantt } from './snapshotGantt'
import { renderSnapshotKanban } from './snapshotKanban'
import { renderSnapshotTable, tableRows } from './snapshotTable'

const CONFIG: ResolvedProjectConfig = {
  statuses: DEFAULT_STATUSES,
  priorities: DEFAULT_PRIORITIES,
  priorityIcons: 'chevrons',
  customFields: [{ id: 'sprint', name: 'Sprint', type: 'text' }],
  defaultView: 'table',
  autoSchedule: false,
  pullForwardOnEarlyFinish: false,
  autoArchiveDays: 0,
  showSubtreeConnections: true,
  lineBorders: 'none',
  kanbanShowSubtasks: false,
  kanbanShowDescriptionPreview: false
}

function model(overrides: Partial<ViewModel> = {}): ViewModel {
  const child = makeTask({
    id: 'c',
    title: 'Child',
    status: 'in-progress',
    start: '2030-01-03',
    due: '2030-01-05',
    dependencies: ['a']
  })
  return {
    projects: [
      {
        id: 'p1',
        title: 'Alpha',
        color: '#8b72be',
        icon: '🚀',
        config: CONFIG,
        tasks: [
          makeTask({
            id: 'a',
            title: 'Parent',
            start: '2030-01-01',
            due: '2030-01-10',
            progress: 40,
            subtasks: [child],
            customFields: { sprint: 'S1' }
          }),
          makeTask({ id: 'm', title: 'Launch', type: 'milestone', due: '2030-01-12' }),
          makeTask({ id: 'z', title: 'Old', status: 'done', archived: true })
        ]
      },
      {
        id: 'p2',
        title: 'Beta',
        color: '#767491',
        icon: '📦',
        config: CONFIG,
        tasks: [makeTask({ id: 'b', title: 'Beta task', status: 'done', due: '2030-02-01' })]
      }
    ],
    settings: {
      priorityIcons: 'chevrons',
      showTagColors: true,
      showSubtreeConnections: true,
      lineBorders: 'none',
      kanbanShowSubtasks: false,
      ganttWeekLabel: 'weekNumber',
      ganttGranularity: 'week'
    },
    filter: makeDefaultFilter(),
    sortKey: 'title',
    sortDir: 'asc',
    ...overrides
  }
}

describe('snapshot table', () => {
  it('lists the tree in order with a project column for several projects', () => {
    const host = document.body.createDiv()
    renderSnapshotTable(host, model())
    const headers = Array.from(host.querySelectorAll('thead th')).map((th) => th.textContent?.trim())
    expect(headers).toEqual([
      '',
      'Task ↑',
      'Project',
      'Status',
      'Priority',
      'Assignees',
      'Due',
      'Progress',
      'Time',
      'Sprint'
    ])
    const rows = Array.from(host.querySelectorAll('tbody tr')).map((tr) => (tr as HTMLElement).dataset.taskId)
    expect(rows).toEqual(['b', 'm', 'a', 'c'])
    expect(host.querySelector('tr[data-task-id="a"] .pm-task-title-text')?.textContent).toBe('Parent')
    expect(host.querySelector('tr[data-task-id="b"]')?.classList.contains('pm-table-row--done')).toBe(true)
  })

  it('shows archived rows only when the filter asks', () => {
    expect(tableRows(model()).map((r) => r.task.id)).not.toContain('z')
    const withArchived = model({ filter: { ...makeDefaultFilter(), showArchived: true } })
    expect(tableRows(withArchived).map((r) => r.task.id)).toContain('z')
  })
})

describe('snapshot kanban', () => {
  it('puts each task in its status column', () => {
    const host = document.body.createDiv()
    renderSnapshotKanban(host, model())
    const columns = host.querySelectorAll('.pm-kanban-col')
    expect(columns.length).toBe(DEFAULT_STATUSES.length)
    const byColumn = Array.from(columns).map((col) =>
      Array.from(col.querySelectorAll('.pm-kanban-card')).map((card) => (card as HTMLElement).dataset.taskId)
    )
    expect(byColumn[0]).toEqual(['a', 'm'])
    expect(byColumn.flat()).toContain('b')
    expect(byColumn.flat()).not.toContain('c')
  })
})

describe('snapshot gantt', () => {
  it('draws a label, a bar or diamond per row, and arrows for dependencies', () => {
    const host = document.body.createDiv()
    renderSnapshotGantt(host, model())
    const labels = Array.from(host.querySelectorAll('.pm-gantt-label-row')).map(
      (el) => (el as HTMLElement).dataset.taskId
    )
    expect(labels).toEqual(['a', 'c', 'm', 'b'])
    expect(host.querySelectorAll('.pm-gantt-bar').length).toBe(3)
    expect(host.querySelectorAll('.pm-gantt-milestone').length).toBe(1)
    expect(host.querySelectorAll('.pm-gantt-arrow').length).toBe(1)
    expect(host.querySelector('.pm-gantt-header-svg text')).not.toBeNull()
    const buttons = Array.from(host.querySelectorAll('.pm-gantt-controls button')).map((b) => b.textContent)
    expect(buttons).toEqual(['Day', 'Week', 'Month', 'Quarter', 'Year'])
  })
})
