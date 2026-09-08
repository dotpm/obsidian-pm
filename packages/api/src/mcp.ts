import { ApiRequestError, type DomainApi } from './contract'
import { parseTaskSearch } from './resources'

export interface ServerInfo {
  name: string
  version: string
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export const MCP_PROTOCOL_VERSION = '2025-06-18'
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26', '2024-11-05'])

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

type JsonSchema = Record<string, unknown>

const TASK_FIELDS: Record<string, JsonSchema> = {
  title: { type: 'string' },
  description: { type: 'string', description: 'Markdown body of the task note' },
  type: { type: 'string', enum: ['task', 'milestone', 'subtask'] },
  status: { type: 'string', description: "One of the project's status ids (see get_project)" },
  priority: { type: 'string', description: "One of the project's priority ids (see get_project)" },
  start: { type: 'string', description: 'YYYY-MM-DD, or empty to clear' },
  due: { type: 'string', description: 'YYYY-MM-DD, or empty to clear' },
  progress: { type: 'integer', minimum: 0, maximum: 100 },
  assignees: { type: 'array', items: { type: 'string' } },
  tags: { type: 'array', items: { type: 'string' } },
  dependencies: { type: 'array', items: { type: 'string' }, description: 'Ids of tasks this one waits for' },
  recurrence: {
    type: ['object', 'null'],
    properties: {
      interval: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
      every: { type: 'integer', minimum: 1 },
      endDate: { type: 'string' }
    },
    required: ['interval', 'every']
  },
  timeEstimate: { type: ['number', 'null'], description: 'Hours' },
  customFields: { type: 'object', additionalProperties: true }
}

interface ToolDefinition {
  name: string
  description: string
  inputSchema: JsonSchema
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'list_projects',
    description: 'Every project in the vault with its id, title, parent and task counts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_project',
    description: 'One project with its description, team, custom fields and the status and priority ids its tasks use.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
      additionalProperties: false
    }
  },
  {
    name: 'list_tasks',
    description: 'All tasks of a project in tree order. Each carries parentId and position.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' }, includeArchived: { type: 'boolean' } },
      required: ['projectId'],
      additionalProperties: false
    }
  },
  {
    name: 'get_task',
    description: 'One task by id, including its description.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'search_tasks',
    description: 'Find tasks across every project by title text, project, status or assignee.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive match on the title' },
        projectId: { type: 'string' },
        status: { type: 'string' },
        assignee: { type: 'string' },
        includeArchived: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 500 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_task',
    description: 'Create a task in a project, at the top level or under parentId.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        parentId: { type: ['string', 'null'] },
        ...TASK_FIELDS
      },
      required: ['projectId', 'title'],
      additionalProperties: false
    }
  },
  {
    name: 'update_task',
    description:
      'Change fields of a task. Only the fields passed change. Pass expectedUpdatedAt from a previous read to refuse the write when the task changed since.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        expectedUpdatedAt: { type: 'string' },
        ...TASK_FIELDS
      },
      required: ['taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'move_task',
    description:
      'Re-parent a task (parentId, null for top level), move it to another project (projectId), or reorder it among its siblings (before or after a sibling id).',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        parentId: { type: ['string', 'null'] },
        projectId: { type: 'string' },
        before: { type: 'string' },
        after: { type: 'string' }
      },
      required: ['taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'archive_task',
    description: 'Archive a task and its subtasks, or bring them back with archived: false.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' }, archived: { type: 'boolean', default: true } },
      required: ['taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task and its subtasks. Cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'list_changes',
    description:
      'Projects and tasks changed since a cursor, oldest first. Omit since for the current cursor only. A reset of true means the cursor was too old: refetch.',
    inputSchema: {
      type: 'object',
      properties: { since: { type: 'integer' } },
      additionalProperties: false
    }
  }
]

const PROJECT_URI = /^dotpm:\/\/projects\/([^/]+)$/
const TASK_URI = /^dotpm:\/\/tasks\/([^/]+)$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  if (typeof value !== 'string' || !value) throw new ApiRequestError('invalid', `${key} is required`)
  return value
}

function withoutKeys(params: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) if (!keys.includes(key)) rest[key] = value
  return rest
}

async function callTool(name: string, params: Record<string, unknown>, api: DomainApi): Promise<unknown> {
  switch (name) {
    case 'list_projects':
      return api.listProjects()
    case 'get_project':
      return api.getProject(requireString(params, 'projectId'))
    case 'list_tasks':
      return api.listTasks(requireString(params, 'projectId'), params['includeArchived'] === true)
    case 'get_task':
      return api.getTask(requireString(params, 'taskId'))
    case 'search_tasks':
      return api.searchTasks(parseTaskSearch(params))
    case 'create_task':
      return api.createTask(requireString(params, 'projectId'), withoutKeys(params, ['projectId']))
    case 'update_task': {
      const expected = params['expectedUpdatedAt']
      return api.updateTask(
        requireString(params, 'taskId'),
        withoutKeys(params, ['taskId', 'expectedUpdatedAt']),
        typeof expected === 'string' ? expected : undefined
      )
    }
    case 'move_task':
      return api.moveTask(requireString(params, 'taskId'), withoutKeys(params, ['taskId']))
    case 'archive_task':
      return api.archiveTask(requireString(params, 'taskId'), params['archived'] !== false)
    case 'delete_task':
      await api.deleteTask(requireString(params, 'taskId'))
      return { deleted: true }
    case 'list_changes': {
      const since = params['since']
      return api.changes(typeof since === 'number' ? since : null)
    }
    default:
      throw new ApiRequestError('not_found', `unknown tool ${name}`)
  }
}

function text(value: unknown): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

async function readResource(uri: string, api: DomainApi): Promise<unknown> {
  const project = PROJECT_URI.exec(uri)
  if (project) {
    const [resource, tasks] = await Promise.all([api.getProject(project[1]), api.listTasks(project[1])])
    return { ...resource, tasks }
  }
  const task = TASK_URI.exec(uri)
  if (task) return api.getTask(task[1])
  throw new ApiRequestError('not_found', `unknown resource ${uri}`)
}

async function dispatch(method: string, params: unknown, api: DomainApi, info: ServerInfo): Promise<unknown> {
  const p = isRecord(params) ? params : {}
  switch (method) {
    case 'initialize': {
      const requested = p['protocolVersion']
      const protocolVersion =
        typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : MCP_PROTOCOL_VERSION
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: info,
        instructions:
          'Projects hold tasks in a tree. Read a project first to learn its status and priority ids before writing tasks.'
      }
    }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call': {
      const name = p['name']
      if (typeof name !== 'string') throw new ApiRequestError('invalid', 'tool name is required')
      const args = isRecord(p['arguments']) ? p['arguments'] : {}
      try {
        return text(await callTool(name, args, api))
      } catch (err: unknown) {
        if (err instanceof ApiRequestError) return { ...text({ error: err.code, message: err.message }), isError: true }
        throw err
      }
    }
    case 'resources/list': {
      const projects = await api.listProjects()
      return {
        resources: projects.map((project) => ({
          uri: `dotpm://projects/${project.id}`,
          name: project.title,
          description: `${project.taskCount} tasks, ${project.doneCount} done`,
          mimeType: 'application/json'
        }))
      }
    }
    case 'resources/templates/list':
      return {
        resourceTemplates: [
          { uriTemplate: 'dotpm://tasks/{taskId}', name: 'Task', mimeType: 'application/json' },
          { uriTemplate: 'dotpm://projects/{projectId}', name: 'Project with tasks', mimeType: 'application/json' }
        ]
      }
    case 'resources/read': {
      const uri = p['uri']
      if (typeof uri !== 'string') throw new ApiRequestError('invalid', 'uri is required')
      const body = await readResource(uri, api)
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }] }
    }
    default:
      return undefined
  }
}

function errorResponse(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

async function handleOne(message: unknown, api: DomainApi, info: ServerInfo): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message['jsonrpc'] !== '2.0' || typeof message['method'] !== 'string') {
    return errorResponse(null, INVALID_REQUEST, 'expected a JSON-RPC 2.0 request')
  }
  const request = message as unknown as JsonRpcRequest
  const id = request.id ?? null
  const isNotification = request.id === undefined
  try {
    const result = await dispatch(request.method, request.params, api, info)
    if (isNotification) return null
    if (result === undefined) return errorResponse(id, METHOD_NOT_FOUND, `unknown method ${request.method}`)
    return { jsonrpc: '2.0', id, result }
  } catch (err: unknown) {
    if (isNotification) return null
    if (err instanceof ApiRequestError) {
      return errorResponse(id, err.code === 'invalid' ? INVALID_PARAMS : -32000, err.message)
    }
    console.error('[PM] mcp request failed', err)
    return errorResponse(id, -32603, 'request failed; see the developer console')
  }
}

/**
 * MCP over Streamable HTTP in its stateless form: one POST carries one message (or a
 * batch), the reply is plain JSON, and notifications get no body. Returns null when
 * there is nothing to send back.
 */
export async function handleMcp(
  body: unknown,
  api: DomainApi,
  info: ServerInfo
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (body === undefined || body === null) return errorResponse(null, PARSE_ERROR, 'empty body')
  if (Array.isArray(body)) {
    const replies = await Promise.all(body.map((message) => handleOne(message, api, info)))
    const sent = replies.filter((reply): reply is JsonRpcResponse => reply !== null)
    return sent.length ? sent : null
  }
  return handleOne(body, api, info)
}
