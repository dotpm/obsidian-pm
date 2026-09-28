// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRIORITIES, DEFAULT_STATUSES, makeDefaultFilter, setDateFormat } from '@dotpm/core'
import type { Snapshot } from '@dotpm/api'
import { iconFromMarkup, loadSnapshot, mount, readEmbeddedSnapshot, viewModelFromSnapshot } from './main'

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" class="svg-icon lucide-check"><path d="M1 1"/></svg>'

function snapshot(): Snapshot {
  return {
    format: 'dotpm-snapshot',
    version: 2,
    generator: { name: 'dotpm', version: '0' },
    exportedAt: '2030-01-01T10:00:00.000Z',
    locale: 'en',
    title: 'Alpha',
    primaryProjectId: 'p1',
    view: {
      mode: 'kanban',
      filter: makeDefaultFilter(),
      sort: [{ key: 'title', dir: 'asc' }],
      ganttGranularity: 'week'
    },
    settings: {
      priorityIcons: 'chevrons',
      showTagColors: true,
      showSubtreeConnections: true,
      lineBorders: 'none',
      kanbanShowSubtasks: false,
      ganttWeekLabel: 'weekNumber',
      dateFormat: ''
    },
    projects: [
      {
        id: 'p1',
        path: 'Projects/Alpha/Alpha.md',
        title: 'Alpha',
        icon: 'rocket',
        color: '#8b72be',
        parentId: null,
        archived: false,
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
  afterEach(() => {
    setDateFormat('')
  })

  it('turns a snapshot into a view model with the task tree rebuilt', () => {
    const model = viewModelFromSnapshot(snapshot())
    expect(model.projects[0].tasks.map((t) => t.id)).toEqual(['a', 'b'])
    expect(model.projects[0].tasks[0].subtasks.map((t) => t.id)).toEqual(['a1'])
    expect(model.settings.ganttGranularity).toBe('week')
  })

  it('reads the single sort key of a version 1 page', () => {
    const old = snapshot()
    old.version = 1
    Object.assign(old.view, { sort: undefined, sortKey: 'due', sortDir: 'desc' })
    expect(viewModelFromSnapshot(old).sort).toEqual([{ key: 'due', dir: 'desc' }])
  })

  it('reads the filter of a version 1 page, which held fixed facets', () => {
    const old = snapshot()
    old.version = 1
    old.view.filter = {
      statuses: ['todo'],
      dueDateFilter: 'overdue',
      showArchived: false
    } as unknown as Snapshot['view']['filter']
    expect(viewModelFromSnapshot(old).filter).toEqual({
      conditions: [
        { field: 'status', op: 'any', value: ['todo'] },
        { field: 'due', op: 'bucket', value: 'overdue' }
      ],
      showArchived: false
    })
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

  it('writes dates in the format the snapshot carries', () => {
    const root = document.body.createDiv()
    const exported = snapshot()
    exported.settings.dateFormat = 'DD.MM.YYYY'
    mount(root, exported)
    expect(root.querySelector('.pm-kanban-card')?.textContent).toContain('01.02.2030')
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

describe('iconFromMarkup', () => {
  it('keeps the drawing and drops scripts, handlers and links', () => {
    const icon = iconFromMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)" class="svg-icon">' +
        '<script>alert(2)</script><a href="https://example.com"><path d="M0 0"/></a>' +
        '<g transform="scale(2)"><path d="M1 1" onclick="alert(3)" stroke-width="2"/></g></svg>'
    )
    expect(icon?.outerHTML).toBe(
      '<svg viewBox="0 0 24 24" class="svg-icon"><g transform="scale(2)"><path d="M1 1" stroke-width="2"></path></g></svg>'
    )
  })

  it('refuses markup that is not an svg', () => {
    expect(iconFromMarkup('<html><body onload="alert(1)"></body></html>')).toBeNull()
    expect(iconFromMarkup('not markup')).toBeNull()
  })
})

describe('loadSnapshot', () => {
  beforeEach(() => {
    document.body.empty()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function hostedRoot(url: string): void {
    document.body.createDiv({ attr: { id: 'app', 'data-snapshot': url } })
  }

  it('fetches the snapshot the root points at when none is embedded', async () => {
    hostedRoot('/eu/alpha/b/abc')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(snapshot())))
    vi.stubGlobal('fetch', fetchMock)
    expect((await loadSnapshot(document))?.title).toBe('Alpha')
    expect(fetchMock).toHaveBeenCalledWith('/eu/alpha/b/abc')
  })

  it('gives up on a failed fetch or anything that is not a snapshot', async () => {
    hostedRoot('/eu/alpha/b/abc')
    vi.stubGlobal('fetch', async () => new Response('gone', { status: 410 }))
    expect(await loadSnapshot(document)).toBeNull()
    vi.stubGlobal('fetch', async () => new Response('{"format":"other"}'))
    expect(await loadSnapshot(document)).toBeNull()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline')
    })
    expect(await loadSnapshot(document)).toBeNull()
  })

  it('prefers the embedded snapshot and needs no network for it', async () => {
    hostedRoot('/eu/alpha/b/abc')
    const el = document.body.createEl('script', { attr: { id: 'dotpm-snapshot', type: 'application/json' } })
    el.textContent = JSON.stringify(snapshot())
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    expect((await loadSnapshot(document))?.title).toBe('Alpha')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
