import type { CustomFieldDef, PriorityConfig, Recurrence, StatusConfig, TaskType, TimeLog } from '@dotpm/core'

/** What a listing shows for a project, cheap enough to serve without loading it. */
export interface ProjectSummary {
  id: string
  path: string
  title: string
  icon: string
  color: string
  parentId: string | null
  taskCount: number
  doneCount: number
}

export interface ProjectResource extends ProjectSummary {
  description: string
  teamMembers: string[]
  customFields: CustomFieldDef[]
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  createdAt: string
  updatedAt: string
}

export interface TaskResource {
  id: string
  projectId: string
  parentId: string | null
  /** Index among its siblings. */
  position: number
  path: string
  title: string
  description: string
  type: TaskType
  status: string
  priority: string
  start: string
  due: string
  completed: string
  progress: number
  assignees: string[]
  tags: string[]
  dependencies: string[]
  recurrence: Recurrence | null
  timeEstimate: number | null
  timeLogs: TimeLog[]
  customFields: Record<string, unknown>
  archived: boolean
  createdAt: string
  updatedAt: string
}

/** The fields a client may write. Everything else is derived or owned by the host. */
export interface TaskWrite {
  title?: string
  description?: string
  type?: TaskType
  status?: string
  priority?: string
  start?: string
  due?: string
  progress?: number
  assignees?: string[]
  tags?: string[]
  dependencies?: string[]
  recurrence?: Recurrence | null
  timeEstimate?: number | null
  customFields?: Record<string, unknown>
}

export interface TaskCreate extends TaskWrite {
  title: string
  parentId?: string | null
}

export interface TaskMove {
  parentId?: string | null
  projectId?: string
  before?: string
  after?: string
}

export interface TaskSearch {
  query?: string
  projectId?: string
  status?: string
  assignee?: string
  includeArchived?: boolean
  limit?: number
}

export interface Change {
  seq: number
  at: string
  kind: 'project' | 'task'
  op: 'upsert' | 'delete'
  id: string
  projectId: string
}

export interface ChangePage {
  cursor: number
  changes: Change[]
  /** The cursor asked for is older than what is kept; refetch instead of applying. */
  reset: boolean
}

export type ApiErrorCode = 'invalid' | 'unauthorized' | 'not_found' | 'conflict' | 'unavailable'

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 412,
  unavailable: 503
}

/**
 * The contract every host implements: the plugin over the vault today, a server later.
 * Ids are the only identity; paths are attributes. Writes take the raw client input
 * (`TaskCreate`, `TaskWrite`, `TaskMove` shaped) and validate it against the project,
 * since only the host knows a project's statuses. Every client mistake rejects with an
 * `ApiRequestError`.
 */
export interface DomainApi {
  listProjects(): Promise<ProjectSummary[]>
  getProject(projectId: string): Promise<ProjectResource>
  listTasks(projectId: string, includeArchived?: boolean): Promise<TaskResource[]>
  getTask(taskId: string): Promise<TaskResource>
  searchTasks(search: TaskSearch): Promise<TaskResource[]>
  createTask(projectId: string, input: unknown): Promise<TaskResource>
  /** `expectedUpdatedAt` makes the write conditional: a mismatch rejects with `conflict`. */
  updateTask(taskId: string, input: unknown, expectedUpdatedAt?: string): Promise<TaskResource>
  moveTask(taskId: string, input: unknown): Promise<TaskResource>
  archiveTask(taskId: string, archived: boolean): Promise<TaskResource>
  deleteTask(taskId: string): Promise<void>
  changes(since: number | null): Promise<ChangePage>
}
