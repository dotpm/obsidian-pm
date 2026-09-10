import type { Project, ResolvedProjectConfig, Task } from '@dotpm/core'
import { makeTask, parsePlainDate } from '@dotpm/core'
import * as v from 'valibot'
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

const TASK_TYPES = ['task', 'milestone', 'subtask'] as const
const RECURRENCE_INTERVALS = ['daily', 'weekly', 'monthly', 'yearly'] as const

export function invalid(message: string): never {
  throw new ApiRequestError('invalid', message)
}

/**
 * Every schema below carries its own message, so a client reads the same words whether it
 * came in over HTTP, where this runs, or over MCP, where the transport validates first.
 */
function parse<S extends v.GenericSchema>(schema: S, input: unknown): v.InferOutput<S> {
  const result = v.safeParse(schema, input)
  if (!result.success) invalid(result.issues[0].message)
  return result.output
}

/** An object reports both a wrong type and a key it is missing, so it names the key itself. */
function missingKey(wrongType: string, prefix = ''): (issue: v.ObjectIssue) => string {
  return (issue) => {
    const key = issue.path?.[0]?.key
    return typeof key === 'string' ? `${prefix}${key} is required` : wrongType
  }
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

function isCalendarDate(value: string): boolean {
  return value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && parsePlainDate(value) !== null)
}

function stringField(name: string, description: string): v.GenericSchema<string, string> {
  return v.pipe(v.string(`${name} must be a string`), v.description(description))
}

function dateField(name: string): v.GenericSchema<string, string> {
  return v.pipe(
    v.string(`${name} must be a string`),
    v.check(isCalendarDate, `${name} must be YYYY-MM-DD or empty`),
    v.description('YYYY-MM-DD, or empty to clear')
  )
}

function listField(name: string, description: string): v.GenericSchema<string[], string[]> {
  const message = `${name} must be a list of strings`
  return v.pipe(v.array(v.string(message), message), v.description(description))
}

function integerField(name: string, min: number, max: number): v.GenericSchema<number, number> {
  const message = `${name} must be an integer from ${min} to ${max}`
  return v.pipe(v.number(message), v.integer(message), v.minValue(min, message), v.maxValue(max, message))
}

const RECURRENCE = v.object(
  {
    interval: v.picklist(RECURRENCE_INTERVALS, `recurrence.interval must be one of ${RECURRENCE_INTERVALS.join(', ')}`),
    every: v.pipe(
      v.number('recurrence.every must be a positive integer'),
      v.integer('recurrence.every must be a positive integer'),
      v.minValue(1, 'recurrence.every must be a positive integer')
    ),
    endDate: v.optional(dateField('recurrence.endDate'))
  },
  missingKey('recurrence must be an object or null', 'recurrence.')
)

/** The fields a client may write, defining both what is accepted and what MCP advertises. */
export const TASK_FIELDS = {
  title: v.optional(
    v.pipe(
      v.string('title must be a string'),
      v.check((title) => title.trim() !== '', 'title must not be empty')
    )
  ),
  description: v.optional(stringField('description', 'Markdown body of the task note')),
  type: v.optional(v.picklist(TASK_TYPES, `type must be one of ${TASK_TYPES.join(', ')}`)),
  status: v.optional(stringField('status', "One of the project's status ids (see get_project)")),
  priority: v.optional(stringField('priority', "One of the project's priority ids (see get_project)")),
  start: v.optional(dateField('start')),
  due: v.optional(dateField('due')),
  progress: v.optional(integerField('progress', 0, 100)),
  assignees: v.optional(listField('assignees', 'Names or wikilinks of the people on the task')),
  tags: v.optional(listField('tags', 'Tags without the leading hash')),
  dependencies: v.optional(listField('dependencies', 'Ids of tasks this one waits for')),
  recurrence: v.optional(v.nullable(RECURRENCE)),
  timeEstimate: v.optional(
    v.nullable(
      v.pipe(
        v.number('timeEstimate must be a non-negative number or null'),
        v.minValue(0, 'timeEstimate must be a non-negative number or null'),
        v.description('Hours')
      )
    )
  ),
  customFields: v.optional(v.record(v.string(), v.unknown(), 'customFields must be an object'))
}

/** `title` is what separates a create from a patch, so only here is it required. */
export const CREATE_FIELDS = {
  ...TASK_FIELDS,
  title: v.pipe(
    v.string('title must be a string'),
    v.check((title) => title.trim() !== '', 'title must not be empty')
  ),
  parentId: v.optional(v.nullable(v.string('parentId must be a string or null')), null)
}

export const MOVE_FIELDS = {
  parentId: v.optional(v.nullable(v.string('parentId must be a string or null'))),
  projectId: v.optional(stringField('projectId', 'Move the task to this project')),
  before: v.optional(stringField('before', 'Id of the sibling to sit in front of')),
  after: v.optional(stringField('after', 'Id of the sibling to sit behind'))
}

export const SEARCH_FIELDS = {
  query: v.optional(stringField('query', 'Case-insensitive match on the title')),
  projectId: v.optional(stringField('projectId', 'Only tasks of this project')),
  status: v.optional(stringField('status', 'Only tasks with this status id')),
  assignee: v.optional(stringField('assignee', 'Only tasks this person is on')),
  includeArchived: v.optional(v.boolean('includeArchived must be true or false')),
  limit: v.optional(integerField('limit', 1, 500))
}

const TASK_WRITE = v.object(TASK_FIELDS, missingKey('expected an object'))
const TASK_CREATE = v.object(CREATE_FIELDS, missingKey('expected an object'))

const TASK_MOVE = v.pipe(
  v.object(MOVE_FIELDS, missingKey('expected an object')),
  v.check((move) => move.before === undefined || move.after === undefined, 'pass before or after, not both'),
  v.check(
    (move) => move.parentId !== undefined || move.projectId !== undefined || Boolean(move.before || move.after),
    'nothing to move: pass parentId, projectId, before or after'
  )
)

const TASK_SEARCH = v.object(SEARCH_FIELDS, missingKey('expected an object'))

/** Only the project knows which status and priority ids its tasks may carry. */
function checkAgainstConfig(write: TaskWrite, config: ResolvedProjectConfig): void {
  if (write.status !== undefined && !config.statuses.some((status) => status.id === write.status)) {
    invalid(`status must be one of ${config.statuses.map((status) => status.id).join(', ')}`)
  }
  if (write.priority !== undefined && !config.priorities.some((priority) => priority.id === write.priority)) {
    invalid(`priority must be one of ${config.priorities.map((priority) => priority.id).join(', ')}`)
  }
}

export function parseTaskWrite(input: unknown, config: ResolvedProjectConfig): TaskWrite {
  const write = parse(TASK_WRITE, input)
  checkAgainstConfig(write, config)
  return write
}

export function parseTaskCreate(input: unknown, config: ResolvedProjectConfig): TaskCreate {
  const create = parse(TASK_CREATE, input)
  checkAgainstConfig(create, config)
  return create
}

export function parseTaskMove(input: unknown): TaskMove {
  return parse(TASK_MOVE, input)
}

export function parseTaskSearch(input: unknown): TaskSearch {
  const search = parse(TASK_SEARCH, input)
  for (const key of ['query', 'projectId', 'status', 'assignee'] as const) {
    if (search[key] === '') search[key] = undefined
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
