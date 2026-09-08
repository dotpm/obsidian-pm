import {
  type Task,
  type TaskPriority,
  type StatusConfig,
  type PriorityConfig,
  displayName,
  statusSortOrder
} from '@dotpm/core'

export type SortKey = 'title' | 'status' | 'priority' | 'due' | 'assignees' | 'progress'
export type SortDir = 'asc' | 'desc'

export interface SortOrder {
  sortKey: SortKey
  sortDir: SortDir
}

export function compareTask(
  a: Task,
  b: Task,
  order: SortOrder,
  statuses: StatusConfig[] = [],
  priorities: PriorityConfig[] = []
): number {
  const dir = order.sortDir === 'asc' ? 1 : -1
  switch (order.sortKey) {
    case 'title':
      return dir * a.title.localeCompare(b.title)
    case 'status':
      return dir * (statusSortOrder(a.status, statuses) - statusSortOrder(b.status, statuses))
    case 'priority':
      return dir * (priorityOrder(a.priority, priorities) - priorityOrder(b.priority, priorities))
    case 'due':
      return dir * (a.due || 'zzz').localeCompare(b.due || 'zzz')
    case 'assignees':
      return dir * displayName(a.assignees[0] ?? '').localeCompare(displayName(b.assignees[0] ?? ''))
    case 'progress':
      return dir * (a.progress - b.progress)
    default:
      return 0
  }
}

function priorityOrder(p: TaskPriority, priorities: PriorityConfig[]): number {
  const idx = priorities.findIndex((cfg) => cfg.id === p)
  return idx >= 0 ? idx : 999
}
