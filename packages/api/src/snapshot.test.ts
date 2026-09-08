import { describe, expect, it } from 'vitest'
import { makeProject, makeTask } from '@dotpm/core'
import { taskResources, tasksFromResources } from './resources'
import { isSnapshot, SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from './snapshot'

describe('tasksFromResources', () => {
  it('rebuilds the tree in sibling order from flat resources', () => {
    const project = makeProject('P', 'Projects/P/P.md')
    const grandchild = makeTask({ id: 'g', title: 'Grandchild' })
    const child = makeTask({ id: 'c', title: 'Child', subtasks: [grandchild], due: '2030-05-05' })
    project.tasks = [
      makeTask({ id: 'a', title: 'A', subtasks: [child], tags: ['x'], recurrence: { interval: 'weekly', every: 1 } }),
      makeTask({ id: 'b', title: 'B', archived: true, timeLogs: [{ date: '2030-01-01', hours: 2, note: '' }] })
    ]
    const flat = taskResources(project, 'pid', true)
    const rebuilt = tasksFromResources([...flat].reverse())
    expect(rebuilt.map((t) => t.id)).toEqual(['a', 'b'])
    expect(rebuilt[0].subtasks.map((t) => t.id)).toEqual(['c'])
    expect(rebuilt[0].subtasks[0].subtasks.map((t) => t.id)).toEqual(['g'])
    expect(rebuilt[0].recurrence).toEqual({ interval: 'weekly', every: 1 })
    expect(rebuilt[0].subtasks[0].due).toBe('2030-05-05')
    expect(rebuilt[1].archived).toBe(true)
    expect(rebuilt[1].timeLogs).toEqual([{ date: '2030-01-01', hours: 2, note: '' }])
    expect(taskResources({ ...project, tasks: rebuilt }, 'pid', true)).toEqual(flat)
  })
})

describe('isSnapshot', () => {
  it('accepts the current format and nothing else', () => {
    expect(isSnapshot({ format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, projects: [] })).toBe(true)
    expect(isSnapshot({ format: SNAPSHOT_FORMAT, version: 99, projects: [] })).toBe(false)
    expect(isSnapshot({ format: 'other', version: SNAPSHOT_VERSION, projects: [] })).toBe(false)
    expect(isSnapshot(null)).toBe(false)
    expect(isSnapshot('nope')).toBe(false)
  })
})
