import { describe, expect, it } from 'vitest'
import { makeDefaultFilter, makeProject, makeTask, type Project, type Task } from '../types'
import { hydrateProjectFromFrontmatter, hydrateTaskFromFile } from './YamlHydrator'
import { parseFrontmatter } from './YamlParser'
import { serializeProject, serializeTask, type RefWriter } from './YamlSerializer'

const refs: RefWriter = {
  link: (targetPath, title) => `[[${targetPath.replace(/^.*\//, '').replace(/\.md$/, '')}|${title}]]`,
  dependency: () => null
}

function reversedKeys<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).reverse()) as T
}

function fixtureTask(): Task {
  return makeTask({
    id: 'task-1',
    title: 'Design API',
    description: 'Draft the endpoints.\n\nSecond paragraph.',
    status: 'in-progress',
    priority: 'high',
    start: '2026-04-01',
    due: '2026-04-10',
    progress: 50,
    assignees: ['Alice', '[[People/Bob|Bob]]'],
    tags: ['api', 'design'],
    dependencies: ['dep-1'],
    timeEstimate: 8,
    timeLogs: [{ date: '2026-04-02', hours: 2, note: 'spike' }],
    customFields: { sprint: 'S12', reviewed: true },
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-04-02T12:00:00.000Z',
    filePath: 'Projects/Test/_tasks/design-api.md'
  })
}

function fixtureProject(): Project {
  const project = makeProject('Test', 'Projects/Test/Test.md')
  project.id = 'project-1'
  project.description = 'A project.'
  project.teamMembers = ['Alice', 'Bob']
  project.customFields = [{ id: 'cf-1', name: 'Sprint', type: 'text' }]
  project.savedViews = [
    {
      id: 'view-1',
      name: 'Open',
      filter: { ...makeDefaultFilter(), statuses: ['todo'] },
      sortKey: 'due',
      sortDir: 'asc'
    }
  ]
  project.createdAt = '2026-03-01T10:00:00.000Z'
  project.updatedAt = '2026-03-02T10:00:00.000Z'
  return project
}

describe('serializer determinism', () => {
  it('writes a task the same way twice', () => {
    const project = fixtureProject()
    expect(serializeTask(fixtureTask(), project, null, [], refs)).toBe(
      serializeTask(fixtureTask(), project, null, [], refs)
    )
  })

  it('ignores the insertion order of a task object', () => {
    const project = fixtureProject()
    expect(serializeTask(reversedKeys(fixtureTask()), project, null, [], refs)).toBe(
      serializeTask(fixtureTask(), project, null, [], refs)
    )
  })

  it('ignores the insertion order of a project object', () => {
    expect(serializeProject(reversedKeys(fixtureProject()), [], refs)).toBe(
      serializeProject(fixtureProject(), [], refs)
    )
  })

  it('reaches a fixed point after one task round-trip', () => {
    const project = fixtureProject()
    const first = serializeTask(fixtureTask(), project, null, [], refs)
    const parsed = parseFrontmatter(first)
    if (parsed.kind !== 'frontmatter') throw new Error('frontmatter missing')
    const { task } = hydrateTaskFromFile(parsed.frontmatter, parsed.body, 'Projects/Test/_tasks/design-api.md')
    expect(serializeTask(task, project, null, [], refs)).toBe(first)
  })

  it('reaches a fixed point after one project round-trip', () => {
    const first = serializeProject(fixtureProject(), [], refs)
    const parsed = parseFrontmatter(first)
    if (parsed.kind !== 'frontmatter') throw new Error('frontmatter missing')
    const project = hydrateProjectFromFrontmatter(parsed.frontmatter, parsed.body, 'Projects/Test/Test.md', 'Test')
    expect(serializeProject(project, [], refs)).toBe(first)
  })
})
