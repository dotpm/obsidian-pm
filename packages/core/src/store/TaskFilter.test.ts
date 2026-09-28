import { describe, expect, it } from 'vitest'
import { today } from '../dates'
import {
  DEFAULT_STATUSES,
  makeDefaultFilter,
  makeTask,
  type CustomFieldDef,
  type FilterCondition,
  type Task,
  type TaskQuery
} from '../types'
import type { FilterContext } from './FilterFields'
import {
  applyTaskFilterFlat,
  applyTaskFilterPromote,
  bestConditionToDrop,
  countActiveFilters,
  isConditionComplete,
  isQueryActive,
  matchesCondition,
  matchesQuery,
  matchesSearch
} from './TaskFilter'
import { flattenTasks } from './TaskTreeOps'

const FIELDS: CustomFieldDef[] = [
  { id: 'client', name: 'Client', type: 'select', options: ['Acme', 'Globex'] },
  { id: 'estimate', name: 'Estimate', type: 'number' },
  { id: 'reviewed', name: 'Reviewed', type: 'checkbox' },
  { id: 'sprint', name: 'Sprint', type: 'text' },
  { id: 'labels', name: 'Labels', type: 'multiselect' },
  { id: 'launch', name: 'Launch', type: 'date' }
]

const ctx: FilterContext = { statuses: DEFAULT_STATUSES, customFields: FIELDS }

function task(overrides: Partial<Task> & { id: string }): Task {
  return makeTask(overrides)
}

function query(conditions: FilterCondition[] = [], extra: Partial<TaskQuery> = {}): TaskQuery {
  return { filter: { ...makeDefaultFilter(), conditions }, text: '', ...extra }
}

const matches = (t: Task, condition: FilterCondition, context: FilterContext = ctx): boolean =>
  matchesCondition(t, condition, context)

describe('isQueryActive and countActiveFilters', () => {
  it('treats the default query as inactive', () => {
    expect(isQueryActive(query())).toBe(false)
    expect(countActiveFilters(makeDefaultFilter())).toBe(0)
  })

  it('counts search text as active but not as a filter', () => {
    expect(isQueryActive(query([], { text: 'foo' }))).toBe(true)
    expect(isQueryActive(query([], { text: '   ' }))).toBe(false)
  })

  it('counts showing archived tasks as a filter without narrowing the view', () => {
    const q = query()
    q.filter.showArchived = true
    expect(isQueryActive(q)).toBe(false)
    expect(countActiveFilters(q.filter)).toBe(1)
  })
})

describe('list fields', () => {
  const t = task({ id: 'a', status: 'todo', priority: 'high' })

  it('matches any of the chosen values', () => {
    expect(matches(t, { field: 'status', op: 'any', value: ['todo', 'done'] })).toBe(true)
    expect(matches(t, { field: 'status', op: 'any', value: ['done'] })).toBe(false)
  })

  it('excludes the chosen values with none', () => {
    expect(matches(t, { field: 'priority', op: 'none', value: ['high'] })).toBe(false)
    expect(matches(t, { field: 'priority', op: 'none', value: ['low'] })).toBe(true)
  })

  it('ignores a condition with no values yet', () => {
    expect(matches(t, { field: 'status', op: 'any', value: [] })).toBe(true)
  })

  it('reads a custom select and its empty state', () => {
    const withClient = task({ id: 'b', customFields: { client: 'Acme' } })
    const without = task({ id: 'c' })
    expect(matches(withClient, { field: 'cf:client', op: 'any', value: ['Acme'] })).toBe(true)
    expect(matches(without, { field: 'cf:client', op: 'empty' })).toBe(true)
    expect(matches(withClient, { field: 'cf:client', op: 'not-empty' })).toBe(true)
  })

  it('matches the project a task belongs to', () => {
    const withProject: FilterContext = { ...ctx, projectOf: () => 'p1' }
    expect(matches(t, { field: 'project', op: 'any', value: ['p1'] }, withProject)).toBe(true)
    expect(matches(t, { field: 'project', op: 'any', value: ['p2'] }, withProject)).toBe(false)
  })

  it('ignores a field nothing defines any more', () => {
    expect(matches(t, { field: 'cf:gone', op: 'any', value: ['x'] })).toBe(true)
  })
})

describe('multi fields', () => {
  const t = task({ id: 'a', tags: ['design', 'web'], customFields: { labels: ['red', 'blue'] } })

  it('matches any, all and none', () => {
    expect(matches(t, { field: 'tag', op: 'any', value: ['web', 'ops'] })).toBe(true)
    expect(matches(t, { field: 'tag', op: 'all', value: ['web', 'design'] })).toBe(true)
    expect(matches(t, { field: 'tag', op: 'all', value: ['web', 'ops'] })).toBe(false)
    expect(matches(t, { field: 'tag', op: 'none', value: ['ops'] })).toBe(true)
    expect(matches(t, { field: 'cf:labels', op: 'none', value: ['red'] })).toBe(false)
  })

  it('matches a task with no values as empty', () => {
    expect(matches(task({ id: 'b' }), { field: 'tag', op: 'empty' })).toBe(true)
    expect(matches(t, { field: 'tag', op: 'empty' })).toBe(false)
  })
})

describe('text, number and checkbox fields', () => {
  const t = task({ id: 'a', title: 'Checkout copy', customFields: { estimate: 5, reviewed: true, sprint: 'S14' } })

  it('matches contains case-insensitively', () => {
    expect(matches(t, { field: 'title', op: 'contains', value: 'CHECKOUT' })).toBe(true)
    expect(matches(t, { field: 'title', op: 'not-contains', value: 'checkout' })).toBe(false)
    expect(matches(t, { field: 'cf:sprint', op: 'contains', value: '14' })).toBe(true)
  })

  it('compares numbers', () => {
    expect(matches(t, { field: 'cf:estimate', op: 'eq', value: [5] })).toBe(true)
    expect(matches(t, { field: 'cf:estimate', op: 'gte', value: [6] })).toBe(false)
    expect(matches(t, { field: 'cf:estimate', op: 'lte', value: [5] })).toBe(true)
    expect(matches(t, { field: 'cf:estimate', op: 'between', value: [2, 8] })).toBe(true)
    expect(matches(t, { field: 'cf:estimate', op: 'between', value: [6, 8] })).toBe(false)
    expect(matches(task({ id: 'b' }), { field: 'cf:estimate', op: 'empty' })).toBe(true)
    expect(matches(task({ id: 'b' }), { field: 'cf:estimate', op: 'ne', value: [5] })).toBe(true)
  })

  it('reads a number stored as text', () => {
    expect(
      matches(task({ id: 'b', customFields: { estimate: '3' } }), { field: 'cf:estimate', op: 'eq', value: [3] })
    ).toBe(true)
  })

  it('matches checked and unchecked', () => {
    expect(matches(t, { field: 'cf:reviewed', op: 'checked' })).toBe(true)
    expect(matches(task({ id: 'b' }), { field: 'cf:reviewed', op: 'unchecked' })).toBe(true)
  })
})

describe('date fields', () => {
  const day = (offset: number): string => today().add({ days: offset }).toString()

  it('sorts dates into buckets', () => {
    const due = (d: string) => task({ id: d, due: d, status: 'todo' })
    expect(matches(due(day(-1)), { field: 'due', op: 'bucket', value: 'overdue' })).toBe(true)
    expect(matches(due(day(0)), { field: 'due', op: 'bucket', value: 'overdue' })).toBe(false)
    expect(matches(due(day(0)), { field: 'due', op: 'bucket', value: 'today' })).toBe(true)
    expect(matches(due(day(0)), { field: 'due', op: 'bucket', value: 'this-week' })).toBe(true)
    expect(matches(due(day(8)), { field: 'due', op: 'bucket', value: 'this-week' })).toBe(false)
    expect(matches(due(day(0)), { field: 'due', op: 'bucket', value: 'this-month' })).toBe(true)
    expect(matches(due(day(-1)), { field: 'due', op: 'bucket', value: 'this-month' })).toBe(false)
  })

  it('does not call a finished task overdue', () => {
    const done = task({ id: 'a', due: '2030-05-01', status: 'done' })
    expect(matches(done, { field: 'due', op: 'bucket', value: 'overdue' })).toBe(false)
  })

  it('matches a range with either end open', () => {
    const t = task({ id: 'a', start: '2030-06-10', customFields: { launch: '2030-07-01' } })
    expect(matches(t, { field: 'start', op: 'between', value: ['2030-06-01', '2030-06-30'] })).toBe(true)
    expect(matches(t, { field: 'start', op: 'between', value: ['2030-06-11', ''] })).toBe(false)
    expect(matches(t, { field: 'cf:launch', op: 'between', value: ['', '2030-07-01'] })).toBe(true)
  })

  it('matches a missing date as empty', () => {
    expect(matches(task({ id: 'a' }), { field: 'due', op: 'empty' })).toBe(true)
    expect(matches(task({ id: 'a', due: '2030-01-01' }), { field: 'due', op: 'not-empty' })).toBe(true)
  })
})

describe('search', () => {
  it('matches title, tags, assignees and custom values', () => {
    const t = task({
      id: 'abc123',
      title: 'Payment errors',
      tags: ['billing'],
      assignees: ['[[People/Ada Lovelace]]'],
      customFields: { sprint: 'S14' }
    })
    expect(matchesSearch(t, 'payment', ctx)).toBe(true)
    expect(matchesSearch(t, 'BILL', ctx)).toBe(true)
    expect(matchesSearch(t, 'ada', ctx)).toBe(true)
    expect(matchesSearch(t, 's14', ctx)).toBe(true)
    expect(matchesSearch(t, 'abc123', ctx)).toBe(true)
    expect(matchesSearch(t, 'abc', ctx)).toBe(false)
    expect(matchesSearch(t, '   ', ctx)).toBe(true)
  })
})

describe('matchesQuery', () => {
  it('hides archived tasks unless the filter shows them', () => {
    const t = task({ id: 'a', archived: true })
    const q = query()
    expect(matchesQuery(t, q, ctx)).toBe(false)
    q.filter.showArchived = true
    expect(matchesQuery(t, q, ctx)).toBe(true)
  })

  it('needs every condition and the search to match', () => {
    const t = task({ id: 'a', title: 'Copy', status: 'todo', priority: 'high' })
    const both = [
      { field: 'status', op: 'any', value: ['todo'] },
      { field: 'priority', op: 'any', value: ['low'] }
    ] satisfies FilterCondition[]
    expect(matchesQuery(t, query(both), ctx)).toBe(false)
    expect(matchesQuery(t, query([both[0]], { text: 'copy' }), ctx)).toBe(true)
    expect(matchesQuery(t, query([both[0]], { text: 'paste' }), ctx)).toBe(false)
  })
})

describe('applying to trees', () => {
  const todo = [{ field: 'status', op: 'any', value: ['todo'] }] satisfies FilterCondition[]

  it('lifts a matching grandchild to the slot of its dropped parent', () => {
    const tasks = [
      task({
        id: 'root',
        status: 'todo',
        subtasks: [task({ id: 'mid', status: 'done', subtasks: [task({ id: 'leaf', status: 'todo' })] })]
      })
    ]
    const out = applyTaskFilterPromote(tasks, query(todo), ctx)
    expect(out.map((t) => t.id)).toEqual(['root'])
    expect(out[0].subtasks.map((t) => t.id)).toEqual(['leaf'])
  })

  it('drops branches with no matching descendants', () => {
    const tasks = [
      task({ id: 'a', status: 'done', subtasks: [task({ id: 'a1', status: 'done' })] }),
      task({ id: 'b', status: 'todo' })
    ]
    expect(applyTaskFilterPromote(tasks, query(todo), ctx).map((t) => t.id)).toEqual(['b'])
  })

  it('filters a flat list', () => {
    const flat = flattenTasks([task({ id: 'a', status: 'todo' }), task({ id: 'b', status: 'done' })])
    expect(applyTaskFilterFlat(flat, query(todo), ctx).map((f) => f.task.id)).toEqual(['a'])
  })
})

describe('people', () => {
  // Stands in for personKeyer: two Janes in different folders, one Bob with no note.
  const keyOf = (raw: string): string => {
    const inner = /^\[\[(.+?)\]\]$/.exec(raw.trim())?.[1] ?? raw.trim()
    const path = inner.split('|')[0].trim()
    if (path === 'People/Jane' || path === 'Jane') return 'People/Jane.md'
    if (path === 'Contacts/Jane') return 'Contacts/Jane.md'
    return path
  }
  const keyed: FilterContext = { ...ctx, keyOf }
  const assignee = (value: string): FilterCondition => ({ field: 'assignee', op: 'any', value: [value] })

  it('matches a wikilink against a plain name through the display name by default', () => {
    expect(matches(task({ id: 'a', assignees: ['[[People/John Doe]]'] }), assignee('John Doe'))).toBe(true)
    expect(matches(task({ id: 'a', assignees: ['[[People/jdoe|John Doe]]'] }), assignee('John Doe'))).toBe(true)
    expect(matches(task({ id: 'a', assignees: ['[[People/John Doe]]'] }), assignee('Anna Reid'))).toBe(false)
  })

  it('separates two people who share a name but not a note', () => {
    const t = task({ id: 'a', assignees: ['[[People/Jane]]'] })
    expect(matches(t, assignee('[[Contacts/Jane]]'), keyed)).toBe(false)
    expect(matches(t, assignee('Jane'), keyed)).toBe(true)
  })

  it('compares a person custom field the same way', () => {
    const fields: CustomFieldDef[] = [{ id: 'owner', name: 'Owner', type: 'person' }]
    const t = task({ id: 'a', customFields: { owner: '[[People/Jane|JD]]' } })
    expect(
      matches(t, { field: 'cf:owner', op: 'any', value: ['[[People/Jane]]'] }, { ...keyed, customFields: fields })
    ).toBe(true)
  })
})

describe('isConditionComplete', () => {
  it('knows which conditions narrow anything yet', () => {
    expect(isConditionComplete({ field: 'status', op: 'any', value: [] })).toBe(false)
    expect(isConditionComplete({ field: 'status', op: 'any', value: ['todo'] })).toBe(true)
    expect(isConditionComplete({ field: 'title', op: 'contains', value: ' ' })).toBe(false)
    expect(isConditionComplete({ field: 'due', op: 'empty' })).toBe(true)
    expect(isConditionComplete({ field: 'due', op: 'between', value: ['', ''] })).toBe(false)
    expect(isConditionComplete({ field: 'due', op: 'between', value: ['2030-01-01', ''] })).toBe(true)
  })
})

describe('bestConditionToDrop', () => {
  it('names the condition whose removal brings back the most tasks', () => {
    const tasks = [
      task({ id: 'a', status: 'todo', priority: 'low' }),
      task({ id: 'b', status: 'todo', priority: 'low' }),
      task({ id: 'c', status: 'done', priority: 'high' })
    ]
    const q = query([
      { field: 'status', op: 'any', value: ['done'] },
      { field: 'priority', op: 'any', value: ['low'] }
    ])
    expect(bestConditionToDrop(tasks, q, ctx)).toEqual({ index: 0, shown: 2 })
  })

  it('returns null when no single condition brings anything back', () => {
    const tasks = [task({ id: 'a', status: 'todo', priority: 'low' })]
    const q = query([
      { field: 'status', op: 'any', value: ['done'] },
      { field: 'priority', op: 'any', value: ['high'] }
    ])
    expect(bestConditionToDrop(tasks, q, ctx)).toBeNull()
  })
})
