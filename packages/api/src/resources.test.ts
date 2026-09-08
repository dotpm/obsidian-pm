import { describe, expect, it } from 'vitest'
import { DEFAULT_PRIORITIES, DEFAULT_STATUSES, makeProject, makeTask, type ResolvedProjectConfig } from '@dotpm/core'
import { ApiRequestError } from './contract'
import { parseTaskCreate, parseTaskMove, parseTaskSearch, parseTaskWrite, taskPatch, taskResources } from './resources'

const CONFIG: ResolvedProjectConfig = {
  statuses: DEFAULT_STATUSES,
  priorities: DEFAULT_PRIORITIES,
  priorityIcons: 'chevrons',
  customFields: [],
  defaultView: 'table',
  autoSchedule: false,
  pullForwardOnEarlyFinish: false,
  autoArchiveDays: 0,
  showSubtreeConnections: true,
  lineBorders: 'none',
  kanbanShowSubtasks: false,
  kanbanShowDescriptionPreview: false
}

function rejects(fn: () => unknown, message: string): void {
  expect(fn).toThrow(ApiRequestError)
  expect(fn).toThrow(message)
}

describe('parseTaskWrite', () => {
  it('keeps only known fields and accepts valid values', () => {
    const write = parseTaskWrite(
      {
        title: 'A',
        status: 'done',
        priority: 'high',
        start: '2030-01-01',
        due: '',
        progress: 40,
        tags: ['x'],
        recurrence: { interval: 'weekly', every: 2 },
        timeEstimate: null,
        customFields: { sprint: 3 },
        filePath: 'ignored',
        updatedAt: 'ignored'
      },
      CONFIG
    )
    expect(write).toEqual({
      title: 'A',
      status: 'done',
      priority: 'high',
      start: '2030-01-01',
      due: '',
      progress: 40,
      tags: ['x'],
      recurrence: { interval: 'weekly', every: 2 },
      timeEstimate: null,
      customFields: { sprint: 3 }
    })
  })

  it('rejects values the project cannot hold', () => {
    expect.hasAssertions()
    rejects(() => parseTaskWrite('nope', CONFIG), 'expected an object')
    rejects(() => parseTaskWrite({ status: 'nope' }, CONFIG), 'status must be one of')
    rejects(() => parseTaskWrite({ priority: 7 }, CONFIG), 'priority must be a string')
    rejects(() => parseTaskWrite({ due: '2030-13-45' }, CONFIG), 'due must be YYYY-MM-DD or empty')
    rejects(() => parseTaskWrite({ due: 'tomorrow' }, CONFIG), 'due must be YYYY-MM-DD or empty')
    rejects(() => parseTaskWrite({ progress: 101 }, CONFIG), 'progress must be an integer from 0 to 100')
    rejects(() => parseTaskWrite({ assignees: 'me' }, CONFIG), 'assignees must be a list of strings')
    rejects(() => parseTaskWrite({ recurrence: { interval: 'hourly', every: 1 } }, CONFIG), 'recurrence.interval')
    rejects(() => parseTaskWrite({ type: 'epic' }, CONFIG), 'type must be one of')
  })

  it('turns a write into the store patch, clearing with undefined', () => {
    expect(taskPatch({ recurrence: null, timeEstimate: null, title: 'T' })).toEqual({
      recurrence: undefined,
      timeEstimate: undefined,
      title: 'T'
    })
  })
})

describe('parseTaskCreate', () => {
  it('requires a title and defaults the parent to the top level', () => {
    rejects(() => parseTaskCreate({ status: 'todo' }, CONFIG), 'title is required')
    expect(parseTaskCreate({ title: 'New' }, CONFIG)).toEqual({ title: 'New', parentId: null })
    expect(parseTaskCreate({ title: 'New', parentId: 'p' }, CONFIG).parentId).toBe('p')
    rejects(() => parseTaskCreate({ title: 'New', parentId: 4 }, CONFIG), 'parentId must be a string or null')
  })
})

describe('parseTaskMove', () => {
  it('needs a destination and refuses before with after', () => {
    rejects(() => parseTaskMove({}), 'nothing to move')
    rejects(() => parseTaskMove({ before: 'a', after: 'b' }), 'pass before or after, not both')
    expect(parseTaskMove({ parentId: null })).toEqual({ parentId: null })
    expect(parseTaskMove({ projectId: 'p2', after: 't9' })).toEqual({ projectId: 'p2', after: 't9' })
  })
})

describe('parseTaskSearch', () => {
  it('reads query-string shaped input', () => {
    expect(parseTaskSearch({ query: 'x', includeArchived: 'true', limit: '10', status: '' })).toEqual({
      query: 'x',
      includeArchived: true,
      limit: 10
    })
    rejects(() => parseTaskSearch({ limit: 0 }), 'limit must be an integer from 1 to 500')
  })
})

describe('taskResources', () => {
  it('walks the tree with parent ids and sibling positions, skipping archived unless asked', () => {
    const project = makeProject('P', 'Projects/P/P.md')
    const child = makeTask({ id: 'c', title: 'Child' })
    const archived = makeTask({ id: 'z', title: 'Old', archived: true })
    project.tasks = [makeTask({ id: 'a', title: 'A', subtasks: [child] }), archived, makeTask({ id: 'b', title: 'B' })]
    const rows = taskResources(project, 'pid', false)
    expect(rows.map((r) => [r.id, r.parentId, r.position])).toEqual([
      ['a', null, 0],
      ['c', 'a', 0],
      ['b', null, 2]
    ])
    expect(taskResources(project, 'pid', true).map((r) => r.id)).toEqual(['a', 'c', 'z', 'b'])
    expect(rows[0].projectId).toBe('pid')
    expect(rows[0].archived).toBe(false)
  })
})
