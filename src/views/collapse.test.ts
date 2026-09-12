import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, makeProject, makeTask, type PMSettings, type Project } from '@dotpm/core'
import { collapsedTaskIds, setAllCollapsed, toggleCollapsed } from './collapse'

function settings(): PMSettings {
  return structuredClone(DEFAULT_SETTINGS)
}

function project(filePath: string, tasks: Project['tasks'] = []): Project {
  return { ...makeProject('A', filePath), tasks }
}

const parent = (id: string, childId: string) => makeTask({ id, subtasks: [makeTask({ id: childId })] })

describe('collapsedTaskIds', () => {
  it('merges the lists of every project in the scope', () => {
    const cfg = settings()
    cfg.collapsedTasks['Projects/A.md'] = ['t1']
    cfg.collapsedTasks['Projects/B.md'] = ['t2']

    const ids = collapsedTaskIds(cfg, [project('Projects/A.md'), project('Projects/B.md')])

    expect([...ids].sort()).toEqual(['t1', 't2'])
  })

  it('reads nothing for a project with no record', () => {
    expect(collapsedTaskIds(settings(), [project('Projects/A.md')]).size).toBe(0)
  })
})

describe('toggleCollapsed', () => {
  it('adds an id and takes it back out', () => {
    const cfg = settings()
    const p = project('Projects/A.md')

    toggleCollapsed(cfg, p, 't1')
    expect(cfg.collapsedTasks['Projects/A.md']).toEqual(['t1'])

    toggleCollapsed(cfg, p, 't1')
    expect(cfg.collapsedTasks['Projects/A.md']).toEqual([])
  })

  it('leaves the other projects alone', () => {
    const cfg = settings()
    cfg.collapsedTasks['Projects/B.md'] = ['t2']

    toggleCollapsed(cfg, project('Projects/A.md'), 't1')

    expect(cfg.collapsedTasks['Projects/B.md']).toEqual(['t2'])
  })

  it('keeps the state a reload of the tasks cannot reach', () => {
    const cfg = settings()
    const p = project('Projects/A.md', [parent('t1', 't1a')])
    toggleCollapsed(cfg, p, 't1')

    // What an external edit does: the task objects are replaced wholesale.
    p.tasks = [parent('t1', 't1a')]

    expect(collapsedTaskIds(cfg, [p]).has('t1')).toBe(true)
  })
})

describe('setAllCollapsed', () => {
  it('collapses every task that has subtasks', () => {
    const cfg = settings()
    const p = project('Projects/A.md', [parent('t1', 't1a'), makeTask({ id: 't2' })])

    setAllCollapsed(cfg, [p], true)

    expect(cfg.collapsedTasks['Projects/A.md']).toEqual(['t1'])
  })

  it('expanding clears the project of collapsed ids', () => {
    const cfg = settings()
    cfg.collapsedTasks['Projects/A.md'] = ['t1']

    setAllCollapsed(cfg, [project('Projects/A.md')], false)

    expect(cfg.collapsedTasks['Projects/A.md']).toEqual([])
  })
})
