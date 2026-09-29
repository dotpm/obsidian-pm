import {
  type GroupState,
  type Task,
  filterFieldLabel,
  filterKind,
  filterValue,
  makeDefaultGroup,
  t,
  valueKey
} from '@dotpm/core'
import { valueOptions, type FilterSetup } from '../composites/ViewHeader/filterPopover'

export interface BoardColumn {
  /** The value the column stands for; empty for the column of tasks without one. */
  id: string
  label: string
  color?: string
  icon?: string
  tasks: Task[]
  hidden: boolean
}

/** Fields whose value every task has, so their board needs no column for tasks without one. */
const ALWAYS_SET = ['status', 'priority', 'type', 'project']

/** The fields a board can put in columns: one value, or several, picked from a list. */
export function groupableFields(setup: FilterSetup): string[] {
  const builtins = ['status', 'priority', 'assignee', 'tag', 'type', ...(setup.projects.length > 1 ? ['project'] : [])]
  const custom = setup.ctx.customFields
    .filter((cf) => cf.type === 'select' || cf.type === 'multiselect' || cf.type === 'person')
    .map((cf) => `cf:${cf.id}`)
  return [...builtins, ...custom]
}

/** The field the board groups by: the saved one while this scope offers it, the default otherwise. */
export function boardField(setup: FilterSetup, group: GroupState): string {
  return groupableFields(setup).includes(group.field) ? group.field : makeDefaultGroup().field
}

/** The values a task files under: one for a single-value field, each of them for a list. Empty when unset. */
export function groupValues(task: Task, field: string, setup: FilterSetup): string[] {
  const value = filterValue(task, field, setup.ctx)
  if (Array.isArray(value)) return value
  return typeof value === 'string' && value ? [value] : []
}

/**
 * The columns for `tasks` grouped by `group.field`: every value the field offers, in the
 * saved order, then one for tasks with no value. A task with several values sits in each
 * of their columns. Hidden columns come back flagged rather than dropped, so the Group
 * popover can list them; `hideEmpty` flags empty ones the same way.
 */
export function boardColumns(setup: FilterSetup, group: GroupState, tasks: Task[]): BoardColumn[] {
  const field = boardField(setup, group)
  const kind = filterKind(field, setup.ctx.customFields)
  const byKey = new Map<string, BoardColumn>()
  for (const option of valueOptions(setup, field)) {
    byKey.set(valueKey(field, option.id, setup.ctx), { ...option, tasks: [], hidden: false })
  }
  const none: BoardColumn = {
    id: '',
    label: t('group.none', { field: filterFieldLabel(field, setup.ctx.customFields) }),
    tasks: [],
    hidden: false
  }
  for (const task of tasks) {
    const values = groupValues(task, field, setup)
    if (!values.length) none.tasks.push(task)
    for (const value of values) {
      const key = valueKey(field, value, setup.ctx)
      let column = byKey.get(key)
      if (!column) {
        column = { id: value, label: value, tasks: [], hidden: false }
        byKey.set(key, column)
      }
      column.tasks.push(task)
    }
  }
  const columns = [...byKey.values()]
  if (kind && (!ALWAYS_SET.includes(field) || none.tasks.length)) columns.push(none)

  const prefs = group.columns?.[field]
  const rank = new Map((prefs?.order ?? []).map((id, index) => [id, index]))
  const ordered = columns
    .map((column, index) => ({ column, index }))
    .sort((a, b) => (rank.get(a.column.id) ?? rank.size + a.index) - (rank.get(b.column.id) ?? rank.size + b.index))
    .map(({ column }) => column)
  const hidden = new Set(prefs?.hidden ?? [])
  for (const column of ordered) {
    column.hidden = hidden.has(column.id) || (!!group.hideEmpty && column.tasks.length === 0)
  }
  return ordered
}
