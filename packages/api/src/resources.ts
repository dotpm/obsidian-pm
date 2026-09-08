import type { Project, Recurrence, ResolvedProjectConfig, Task, TaskType } from '@dotpm/core'
import { makeTask, parsePlainDate } from '@dotpm/core'
import {
  ApiRequestError,
  type ProjectResource,
  type ProjectSummary,
  type TaskCreate,
  type TaskMove,
  type TaskResource,
  type TaskSearch,
  type TaskWrite
} from './contract'

const TASK_TYPES: TaskType[] = ['task', 'milestone', 'subtask']
const RECURRENCE_INTERVALS: Recurrence['interval'][] = ['daily', 'weekly', 'monthly', 'yearly']

export function invalid(message: string): never {
  throw new ApiRequestError('invalid', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toTaskResource(task: Task, projectId: string, parentId: string | null, position: number): TaskResource {
  return {
    id: task.id,
    projectId,
    parentId,
    position,
    path: task.filePath ?? '',
    title: task.title,
    description: task.description,
    type: task.type,
    status: task.status,
    priority: task.priority,
    start: task.start,
    due: task.due,
    completed: task.completed,
    progress: task.progress,
    assignees: [...task.assignees],
    tags: [...task.tags],
    dependencies: [...task.dependencies],
    recurrence: task.recurrence ? { ...task.recurrence } : null,
    timeEstimate: task.timeEstimate ?? null,
    timeLogs: (task.timeLogs ?? []).map((log) => ({ ...log })),
    customFields: { ...task.customFields },
    archived: task.archived === true,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  }
}

/** Every task of a project in tree order, positions counted among siblings. */
export function taskResources(project: Project, projectId: string, includeArchived: boolean): TaskResource[] {
  const out: TaskResource[] = []
  const walk = (tasks: Task[], parentId: string | null): void => {
    tasks.forEach((task, position) => {
      if (task.archived && !includeArchived) return
      out.push(toTaskResource(task, projectId, parentId, position))
      walk(task.subtasks, task.id)
    })
  }
  walk(project.tasks, null)
  return out
}

export function toProjectResource(
  project: Project,
  config: ResolvedProjectConfig,
  summary: ProjectSummary
): ProjectResource {
  return {
    ...summary,
    description: project.description,
    teamMembers: [...project.teamMembers],
    customFields: config.customFields.map((field) => ({ ...field })),
    statuses: config.statuses.map((status) => ({ ...status })),
    priorities: config.priorities.map((priority) => ({ ...priority })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') invalid(`${key} must be a string`)
  return value
}

function readDate(input: Record<string, unknown>, key: string): string | undefined {
  const value = readString(input, key)
  if (value === undefined || value === '') return value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !parsePlainDate(value)) invalid(`${key} must be YYYY-MM-DD or empty`)
  return value
}

function readStringList(input: Record<string, unknown>, key: string): string[] | undefined {
  const value = input[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    invalid(`${key} must be a list of strings`)
  }
  return value as string[]
}

function readRecurrence(input: Record<string, unknown>): Recurrence | null | undefined {
  const value = input['recurrence']
  if (value === undefined) return undefined
  if (value === null) return null
  if (!isRecord(value)) invalid('recurrence must be an object or null')
  const interval = value['interval']
  const every = value['every']
  if (!RECURRENCE_INTERVALS.includes(interval as Recurrence['interval'])) {
    invalid(`recurrence.interval must be one of ${RECURRENCE_INTERVALS.join(', ')}`)
  }
  if (typeof every !== 'number' || !Number.isInteger(every) || every < 1) {
    invalid('recurrence.every must be a positive integer')
  }
  const endDate = readDate(value, 'endDate')
  return { interval: interval as Recurrence['interval'], every, ...(endDate ? { endDate } : {}) }
}

export function parseTaskWrite(input: unknown, config: ResolvedProjectConfig): TaskWrite {
  if (!isRecord(input)) invalid('expected an object')
  const write: TaskWrite = {}
  const title = readString(input, 'title')
  if (title !== undefined) {
    if (!title.trim()) invalid('title must not be empty')
    write.title = title
  }
  const description = readString(input, 'description')
  if (description !== undefined) write.description = description
  const type = readString(input, 'type')
  if (type !== undefined) {
    if (!TASK_TYPES.includes(type as TaskType)) invalid(`type must be one of ${TASK_TYPES.join(', ')}`)
    write.type = type as TaskType
  }
  const status = readString(input, 'status')
  if (status !== undefined) {
    if (!config.statuses.some((s) => s.id === status)) {
      invalid(`status must be one of ${config.statuses.map((s) => s.id).join(', ')}`)
    }
    write.status = status
  }
  const priority = readString(input, 'priority')
  if (priority !== undefined) {
    if (!config.priorities.some((p) => p.id === priority)) {
      invalid(`priority must be one of ${config.priorities.map((p) => p.id).join(', ')}`)
    }
    write.priority = priority
  }
  const start = readDate(input, 'start')
  if (start !== undefined) write.start = start
  const due = readDate(input, 'due')
  if (due !== undefined) write.due = due
  const progress = input['progress']
  if (progress !== undefined) {
    if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 100) {
      invalid('progress must be an integer from 0 to 100')
    }
    write.progress = progress
  }
  for (const key of ['assignees', 'tags', 'dependencies'] as const) {
    const list = readStringList(input, key)
    if (list !== undefined) write[key] = list
  }
  const recurrence = readRecurrence(input)
  if (recurrence !== undefined) write.recurrence = recurrence
  const timeEstimate = input['timeEstimate']
  if (timeEstimate !== undefined) {
    if (timeEstimate !== null && (typeof timeEstimate !== 'number' || timeEstimate < 0)) {
      invalid('timeEstimate must be a non-negative number or null')
    }
    write.timeEstimate = timeEstimate
  }
  const customFields = input['customFields']
  if (customFields !== undefined) {
    if (!isRecord(customFields)) invalid('customFields must be an object')
    write.customFields = customFields
  }
  return write
}

export function parseTaskCreate(input: unknown, config: ResolvedProjectConfig): TaskCreate {
  const write = parseTaskWrite(input, config)
  if (write.title === undefined) invalid('title is required')
  const record = input as Record<string, unknown>
  const parentId = record['parentId']
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    invalid('parentId must be a string or null')
  }
  return { ...write, title: write.title, parentId: parentId ?? null }
}

export function parseTaskMove(input: unknown): TaskMove {
  if (!isRecord(input)) invalid('expected an object')
  const move: TaskMove = {}
  const parentId = input['parentId']
  if (parentId !== undefined) {
    if (parentId !== null && typeof parentId !== 'string') invalid('parentId must be a string or null')
    move.parentId = parentId
  }
  for (const key of ['projectId', 'before', 'after'] as const) {
    const value = readString(input, key)
    if (value !== undefined) move[key] = value
  }
  if (move.before !== undefined && move.after !== undefined) invalid('pass before or after, not both')
  if (move.parentId === undefined && move.projectId === undefined && !move.before && !move.after) {
    invalid('nothing to move: pass parentId, projectId, before or after')
  }
  return move
}

export function parseTaskSearch(input: unknown): TaskSearch {
  if (!isRecord(input)) invalid('expected an object')
  const search: TaskSearch = {}
  for (const key of ['query', 'projectId', 'status', 'assignee'] as const) {
    const value = readString(input, key)
    if (value !== undefined && value !== '') search[key] = value
  }
  const includeArchived = input['includeArchived']
  if (includeArchived !== undefined) search.includeArchived = includeArchived === true || includeArchived === 'true'
  const limit = input['limit']
  if (limit !== undefined) {
    const n = typeof limit === 'string' ? Number(limit) : limit
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 500) {
      invalid('limit must be an integer from 1 to 500')
    }
    search.limit = n
  }
  return search
}

/** The store's patch shape: absent fields untouched, null meaning cleared. */
export function taskPatch(write: TaskWrite): Partial<Task> {
  const patch: Partial<Task> = {}
  if (write.title !== undefined) patch.title = write.title
  if (write.description !== undefined) patch.description = write.description
  if (write.type !== undefined) patch.type = write.type
  if (write.status !== undefined) patch.status = write.status
  if (write.priority !== undefined) patch.priority = write.priority
  if (write.start !== undefined) patch.start = write.start
  if (write.due !== undefined) patch.due = write.due
  if (write.progress !== undefined) patch.progress = write.progress
  if (write.assignees !== undefined) patch.assignees = write.assignees
  if (write.tags !== undefined) patch.tags = write.tags
  if (write.dependencies !== undefined) patch.dependencies = write.dependencies
  if (write.recurrence !== undefined) patch.recurrence = write.recurrence ?? undefined
  if (write.timeEstimate !== undefined) patch.timeEstimate = write.timeEstimate ?? undefined
  if (write.customFields !== undefined) patch.customFields = write.customFields
  return patch
}

/** Rebuilds the task tree a project holds from its flat resources, siblings in position order. */
export function tasksFromResources(resources: TaskResource[]): Task[] {
  const byId = new Map<string, Task>()
  for (const r of resources) {
    byId.set(
      r.id,
      makeTask({
        id: r.id,
        title: r.title,
        description: r.description,
        type: r.type,
        status: r.status,
        priority: r.priority,
        start: r.start,
        due: r.due,
        completed: r.completed,
        progress: r.progress,
        assignees: [...r.assignees],
        tags: [...r.tags],
        dependencies: [...r.dependencies],
        recurrence: r.recurrence ?? undefined,
        timeEstimate: r.timeEstimate ?? undefined,
        timeLogs: r.timeLogs.map((log) => ({ ...log })),
        customFields: { ...r.customFields },
        archived: r.archived,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        filePath: r.path || undefined
      })
    )
  }
  const roots: Task[] = []
  const sorted = [...resources].sort((a, b) => a.position - b.position)
  for (const r of sorted) {
    const task = byId.get(r.id)
    if (!task) continue
    const parent = r.parentId ? byId.get(r.parentId) : undefined
    if (parent) parent.subtasks.push(task)
    else roots.push(task)
  }
  return roots
}
