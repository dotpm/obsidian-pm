import { describe, expect, it } from 'vitest'
import { makeDefaultProjectList, type ProjectListState } from '../types'
import {
  arrangeProjects,
  countProjectFilters,
  projectProgress,
  projectTagCounts,
  tidyProjectFields,
  type ProjectListItem
} from './ProjectList'

function item(title: string, overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    path: `${title}.md`,
    title,
    folder: '',
    tags: [],
    done: 0,
    total: 0,
    overdue: 0,
    latestDue: '',
    children: [],
    ...overrides
  }
}

const checkout = item('Checkout', { tags: ['client'], done: 5, total: 5, latestDue: '2026-10-01' })
const onboarding = item('Onboarding', { done: 1, total: 4, latestDue: '2026-09-01' })
const acme = item('Acme', {
  folder: 'Clients',
  tags: ['client'],
  done: 6,
  total: 9,
  children: [checkout, onboarding]
})
const website = item('Website', { folder: 'Internal', tags: ['web', 'client'] })
const roots = [website, acme]

const state = (overrides: Partial<ProjectListState> = {}): ProjectListState => ({
  ...makeDefaultProjectList(),
  ...overrides
})
const titles = (result: ReturnType<typeof arrangeProjects>): string[][] =>
  result.groups.map((group) => group.rows.map((row) => row.item.title))
const never = (): boolean => false

describe('arrangeProjects', () => {
  it('draws the trees in stored order with guides for sub-projects', () => {
    const result = arrangeProjects(roots, state(), '', never)
    expect(titles(result)).toEqual([['Website', 'Acme', 'Checkout', 'Onboarding']])
    const [, parent, first, last] = result.groups[0].rows
    expect(parent.childCount).toBe(2)
    expect(first).toMatchObject({ depth: 1, guides: [false], isLastChild: false })
    expect(last.isLastChild).toBe(true)
    expect(result).toMatchObject({ shown: 4, total: 4 })
  })

  it('hides the sub-projects of a collapsed parent until a query looks inside', () => {
    const collapsed = (path: string): boolean => path === 'Acme.md'
    expect(titles(arrangeProjects(roots, state(), '', collapsed))).toEqual([['Website', 'Acme']])
    expect(titles(arrangeProjects(roots, state(), 'board', collapsed))).toEqual([['Acme', 'Onboarding']])
  })

  it('shows a parent a query opened as open, with no toggle until the query clears', () => {
    const collapsed = (path: string): boolean => path === 'Acme.md'
    const acme = (text: string) =>
      arrangeProjects(roots, state(), text, collapsed).groups[0].rows.find((row) => row.item.path === 'Acme.md')
    expect(acme('')).toMatchObject({ collapsed: true, collapsible: true })
    expect(acme('board')).toMatchObject({ collapsed: false, collapsible: false })
  })

  it('keeps a match under its parents and counts only the matches', () => {
    const result = arrangeProjects(roots, state({ filter: { progress: ['complete'] } }), '', never)
    expect(titles(result)).toEqual([['Acme', 'Checkout']])
    expect(result.shown).toBe(1)
  })

  it('matches tags with OR and combines them with progress', () => {
    const filter = { tags: ['web', 'client'], progress: ['in-progress' as const] }
    expect(titles(arrangeProjects(roots, state({ filter }), '', never))).toEqual([['Acme']])
    expect(countProjectFilters(filter)).toBe(2)
  })

  it('sorts siblings by several keys, undated projects last either way', () => {
    const byDue = arrangeProjects(roots, state({ sort: [{ key: 'due', dir: 'desc' }] }), '', never)
    expect(titles(byDue)[0].slice(2)).toEqual(['Checkout', 'Onboarding'])
    const byTitle = arrangeProjects(roots, state({ sort: [{ key: 'title', dir: 'asc' }] }), '', never)
    expect(titles(byTitle)[0]).toEqual(['Acme', 'Checkout', 'Onboarding', 'Website'])
    const byProgress = arrangeProjects(roots, state({ sort: [{ key: 'progress', dir: 'desc' }] }), '', never)
    expect(titles(byProgress)[0][0]).toBe('Acme')
  })

  it('groups top-level projects by folder, the vault root last', () => {
    const loose = item('Loose')
    const result = arrangeProjects([...roots, loose], state({ group: 'folder' }), '', never)
    expect(result.groups.map((group) => group.key)).toEqual(['Clients', 'Internal', ''])
    expect(titles(result)[0]).toEqual(['Acme', 'Checkout', 'Onboarding'])
    expect(result.groups[0].count).toBe(3)
  })

  it('puts a project under each of its tags, untagged ones last, and drops emptied groups', () => {
    const loose = item('Loose')
    const result = arrangeProjects([...roots, loose], state({ group: 'tag' }), '', never)
    expect(result.groups.map((group) => group.key)).toEqual(['client', 'web', ''])
    expect(titles(result)[0]).toEqual(['Website', 'Acme', 'Checkout', 'Onboarding'])
    const searched = arrangeProjects([...roots, loose], state({ group: 'tag' }), 'loose', never)
    expect(searched.groups.map((group) => group.key)).toEqual([''])
  })
})

describe('project helpers', () => {
  it('reads progress from the rolled-up counts', () => {
    expect(projectProgress(item('Empty'))).toBe('not-started')
    expect(projectProgress(onboarding)).toBe('in-progress')
    expect(projectProgress(checkout)).toBe('complete')
  })

  it('counts each tag across every project', () => {
    expect(projectTagCounts(roots)).toEqual([
      { tag: 'client', count: 3 },
      { tag: 'web', count: 1 }
    ])
  })
})

describe('tidyProjectFields', () => {
  it('drops the list once every column shows in the default order', () => {
    expect(tidyProjectFields(['progress', 'tasks', 'members', 'due'])).toBeUndefined()
    expect(tidyProjectFields(undefined)).toBeUndefined()
  })

  it('keeps a reordered or shortened list', () => {
    expect(tidyProjectFields(['due', 'progress', 'tasks', 'members'])).toEqual(['due', 'progress', 'tasks', 'members'])
    expect(tidyProjectFields(['progress', 'due'])).toEqual(['progress', 'due'])
    expect(tidyProjectFields([])).toEqual([])
  })
})
