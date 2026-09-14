import {
  ApiRequestError,
  ERROR_STATUS,
  type ApiErrorCode,
  type ChangePage,
  type DomainApi,
  type ProjectResource,
  type ProjectSummary,
  type TaskResource,
  type TaskSearch
} from './contract'

export interface HttpApiOptions {
  /** Where the host listens, such as `http://127.0.0.1:27140`. */
  baseUrl: string
  token: string
  /** The global fetch, or a router's fetch handler in tests. */
  fetch: (request: Request) => Promise<Response>
}

export interface Health {
  ok: boolean
  name: string
  version: string
}

function isErrorCode(code: unknown): code is ApiErrorCode {
  return typeof code === 'string' && code in ERROR_STATUS
}

/** The host's error shape becomes the error it threw; anything else keeps its status. */
function failure(status: number, text: string): Error {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  const error = (parsed as { error?: { code?: unknown; message?: unknown } } | undefined)?.error
  const message = typeof error?.message === 'string' ? error.message : text || `HTTP ${status}`
  if (isErrorCode(error?.code)) return new ApiRequestError(error.code, message)
  return new Error(`HTTP ${status}: ${message}`)
}

function id(value: string): string {
  return encodeURIComponent(value)
}

/**
 * The contract over HTTP, the client side of the router. A failure the host reports comes
 * back as the `ApiRequestError` it threw; a host that cannot be reached is `unavailable`.
 */
export class HttpApi implements DomainApi {
  private readonly baseUrl: string
  private readonly token: string
  private readonly send: (request: Request) => Promise<Response>

  constructor(options: HttpApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.send = options.fetch
  }

  health(): Promise<Health> {
    return this.request('GET', '/v1/health')
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.request('GET', '/v1/projects')
  }

  getProject(projectId: string): Promise<ProjectResource> {
    return this.request('GET', `/v1/projects/${id(projectId)}`)
  }

  createProject(input: unknown): Promise<ProjectResource> {
    return this.request('POST', '/v1/projects', input)
  }

  listTasks(projectId: string, includeArchived = false): Promise<TaskResource[]> {
    const query = includeArchived ? '?includeArchived=true' : ''
    return this.request('GET', `/v1/projects/${id(projectId)}/tasks${query}`)
  }

  getTask(taskId: string): Promise<TaskResource> {
    return this.request('GET', `/v1/tasks/${id(taskId)}`)
  }

  searchTasks(search: TaskSearch): Promise<TaskResource[]> {
    const params = new URLSearchParams()
    if (search.query !== undefined) params.set('q', search.query)
    for (const key of ['projectId', 'status', 'assignee'] as const) {
      const value = search[key]
      if (value !== undefined) params.set(key, value)
    }
    if (search.includeArchived !== undefined) params.set('includeArchived', String(search.includeArchived))
    if (search.limit !== undefined) params.set('limit', String(search.limit))
    const query = params.toString()
    return this.request('GET', `/v1/search${query ? `?${query}` : ''}`)
  }

  createTask(projectId: string, input: unknown): Promise<TaskResource> {
    return this.request('POST', `/v1/projects/${id(projectId)}/tasks`, input)
  }

  updateTask(taskId: string, input: unknown, expectedUpdatedAt?: string): Promise<TaskResource> {
    const headers: Record<string, string> =
      expectedUpdatedAt === undefined ? {} : { 'if-match': `"${expectedUpdatedAt}"` }
    return this.request('PATCH', `/v1/tasks/${id(taskId)}`, input, headers)
  }

  moveTask(taskId: string, input: unknown): Promise<TaskResource> {
    return this.request('POST', `/v1/tasks/${id(taskId)}/move`, input)
  }

  archiveTask(taskId: string, archived: boolean): Promise<TaskResource> {
    return this.request('POST', `/v1/tasks/${id(taskId)}/archive`, { archived })
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.request('DELETE', `/v1/tasks/${id(taskId)}`)
  }

  changes(since: number | null): Promise<ChangePage> {
    return this.request('GET', `/v1/changes${since === null ? '' : `?since=${since}`}`)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const request = new Request(this.baseUrl + path, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    let response: Response
    try {
      response = await this.send(request)
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new ApiRequestError('unavailable', `could not reach ${this.baseUrl}: ${reason}`)
    }
    const text = await response.text()
    if (!response.ok) throw failure(response.status, text)
    return (text ? JSON.parse(text) : undefined) as T
  }
}
