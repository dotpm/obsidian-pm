// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRIORITIES, DEFAULT_STATUSES, makeDefaultFilter } from '@dotpm/core'
import type { Snapshot } from '@dotpm/api'
import { mount, readEmbeddedSnapshot, viewModelFromSnapshot } from './main'

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" class="svg-icon lucide-check"><path d="M1 1"/></svg>'

function snapshot(): Snapshot {
  return {
    format: 'dotpm-snapshot',
    version: 1,
    generator: { name: 'dotpm', version: '0' },
    exportedAt: '2030-01-01T10:00:00.000Z',
    title: 'Alpha',
    primaryProjectId: 'p1',
    view: { mode: 'kanban', filter: makeDefaultFilter(), sortKey: 'title', sortDir: 'asc', ganttGranularity: 'week' },
    settings: {
      priorityIcons: 'chevrons',
      showTagColors: true,
      showSubtreeConnections: true,
      lineBorders: 'none',
      kanbanShowSubtasks: false,
      ganttWeekLabel: 'weekNumber'
    },
    projects: [
      {
        id: 'p1',
        path: 'Projects/Alpha/Alpha.md',
        title: 'Alpha',
        icon: 'rocket',
        color: '#8b72be',
        parentId: null,
        taskCount: 2,
        doneCount: 1,
        description: '',
        teamMembers: [],
        customFields: [],
        statuses: DEFAULT_STATUSES,
        priorities: DEFAULT_PRIORITIES,
        createdAt: '2030-01-01T00:00:00.000Z',
        updatedAt: '2030-01-01T00:00:00.000Z',
        tasks: [
          task('a', 'First', null, 0, 'todo'),
          task('a1', 'First child', 'a', 0, 'done'),
          task('b', 'Second', null, 1, 'done')
        ]
      }
    ],
    icons: { check: ICON, rocket: ICON }
  }
}

function task(id: string, title: string, parentId: string | null, position: number, status: string) {
  return {
    id,
    projectId: 'p1',
    parentId,
    position,
    path: '',
    title,
    description: '',
    type: 'task' as const,
    status,
    priority: 'medium',
    start: '',
    due: '2030-02-01',
    completed: '',
    progress: 0,
    assignees: ['Alice'],
    tags: [],
    dependencies: [],
    recurrence: null,
    timeEstimate: null,
    timeLogs: [],
    customFields: {},
    archived: false,
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z'
  }
}

describe('viewer', () => {
  it('turns a snapshot into a view model with the task tree rebuilt', () => {
    const model = viewModelFromSnapshot(snapshot())
    expect(model.projects[0].tasks.map((t) => t.id)).toEqual(['a', 'b'])
    expect(model.projects[0].tasks[0].subtasks.map((t) => t.id)).toEqual(['a1'])
    expect(model.settings.ganttGranularity).toBe('week')
  })

  it('mounts the header and the view the snapshot was taken in, and switches views', () => {
    const root = document.body.createDiv()
    mount(root, snapshot())
    expect(root.querySelector('.pm-snapshot-title')?.textContent).toBe('Alpha')
    expect(root.querySelector('.pm-snapshot-icon svg')).not.toBeNull()
    expect(root.querySelectorAll('.pm-kanban-card').length).toBe(2)
    const buttons = root.querySelectorAll<HTMLElement>('.pm-view-switcher .pm-view-btn')
    expect(buttons.length).toBe(3)
    buttons[0].click()
    expect(root.querySelectorAll('tbody tr').length).toBe(3)
    expect(root.querySelector('.pm-kanban-board')).toBeNull()
    buttons[1].click()
    expect(root.querySelectorAll('.pm-gantt-bar').length).toBe(3)
  })

  it('reads the embedded snapshot and rejects anything else', () => {
    const el = document.body.createEl('script', { attr: { id: 'dotpm-snapshot', type: 'application/json' } })
    el.textContent = JSON.stringify(snapshot()).replace(/</g, '\\u003c')
    expect(readEmbeddedSnapshot(document)?.title).toBe('Alpha')
    el.textContent = '{"format":"other"}'
    expect(readEmbeddedSnapshot(document)).toBeNull()
    el.textContent = '{'
    expect(readEmbeddedSnapshot(document)).toBeNull()
  })
})
