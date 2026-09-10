import {
  JSON_RPC_ERROR_CODES,
  McpServer,
  RpcError,
  StreamableHttpTransport,
  type JsonRpcError,
  type ToolCallResult
} from 'mcp-lite'
import { ApiRequestError, type DomainApi } from './contract'
import { parseTaskSearch } from './resources'

export interface ServerInfo {
  name: string
  version: string
}

const SERVER_ERROR = -32000

const INSTRUCTIONS =
  'Projects hold tasks in a tree. Read a project first to learn its status and priority ids before writing tasks.'

const PROJECT_TEMPLATE = 'dotpm://projects/{projectId}'
const TASK_TEMPLATE = 'dotpm://tasks/{taskId}'

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

function text(value: unknown): ToolCallResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function jsonContents(
  uri: string,
  value: unknown
): { contents: [{ uri: string; type: 'text'; mimeType: string; text: string }] } {
  return { contents: [{ uri, type: 'text', mimeType: 'application/json', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Registers one tool, with the arguments narrowed and the client-mistake contract in one
 * place: a mistake comes back as a tool result marked `isError`, not a protocol error.
 */
function tool(
  server: McpServer,
  name: string,
  def: {
    description: string
    inputSchema: JsonSchema
    run: (params: Record<string, unknown>) => Promise<unknown>
  }
): void {
  server.tool<unknown>(name, {
    description: def.description,
    inputSchema: def.inputSchema,
    handler: async (raw) => {
      try {
        return text(await def.run(isRecord(raw) ? raw : {}))
      } catch (err: unknown) {
        if (err instanceof ApiRequestError) return { ...text({ error: err.code, message: err.message }), isError: true }
        throw err
      }
    }
  })
}

function registerTools(server: McpServer, api: DomainApi): void {
  tool(server, 'list_projects', {
    description: 'Every project in the vault with its id, title, parent and task counts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => api.listProjects()
  })

  tool(server, 'get_project', {
    description: 'One project with its description, team, custom fields and the status and priority ids its tasks use.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
      additionalProperties: false
    },
    run: (params) => api.getProject(requireString(params, 'projectId'))
  })

  tool(server, 'list_tasks', {
    description: 'All tasks of a project in tree order. Each carries parentId and position.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' }, includeArchived: { type: 'boolean' } },
      required: ['projectId'],
      additionalProperties: false
    },
    run: (params) => api.listTasks(requireString(params, 'projectId'), params['includeArchived'] === true)
  })

  tool(server, 'get_task', {
    description: 'One task by id, including its description.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false
    },
    run: (params) => api.getTask(requireString(params, 'taskId'))
  })

  tool(server, 'search_tasks', {
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
    },
    run: (params) => api.searchTasks(parseTaskSearch(params))
  })

  tool(server, 'create_task', {
    description: 'Create a task in a project, at the top level or under parentId.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' }, parentId: { type: ['string', 'null'] }, ...TASK_FIELDS },
      required: ['projectId', 'title'],
      additionalProperties: false
    },
    run: (params) => api.createTask(requireString(params, 'projectId'), withoutKeys(params, ['projectId']))
  })

  tool(server, 'update_task', {
    description:
      'Change fields of a task. Only the fields passed change. Pass expectedUpdatedAt from a previous read to refuse the write when the task changed since.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' }, expectedUpdatedAt: { type: 'string' }, ...TASK_FIELDS },
      required: ['taskId'],
      additionalProperties: false
    },
    run: (params) => {
      const expected = params['expectedUpdatedAt']
      return api.updateTask(
        requireString(params, 'taskId'),
        withoutKeys(params, ['taskId', 'expectedUpdatedAt']),
        typeof expected === 'string' ? expected : undefined
      )
    }
  })

  tool(server, 'move_task', {
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
    },
    run: (params) => api.moveTask(requireString(params, 'taskId'), withoutKeys(params, ['taskId']))
  })

  tool(server, 'archive_task', {
    description: 'Archive a task and its subtasks, or bring them back with archived: false.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' }, archived: { type: 'boolean', default: true } },
      required: ['taskId'],
      additionalProperties: false
    },
    run: (params) => api.archiveTask(requireString(params, 'taskId'), params['archived'] !== false)
  })

  tool(server, 'delete_task', {
    description: 'Delete a task and its subtasks. Cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false
    },
    run: async (params) => {
      await api.deleteTask(requireString(params, 'taskId'))
      return { deleted: true }
    }
  })

  tool(server, 'list_changes', {
    description:
      'Projects and tasks changed since a cursor, oldest first. Omit since for the current cursor only. A reset of true means the cursor was too old: refetch.',
    inputSchema: { type: 'object', properties: { since: { type: 'integer' } }, additionalProperties: false },
    run: (params) => {
      const since = params['since']
      return api.changes(typeof since === 'number' ? since : null)
    }
  })
}

function registerResources(server: McpServer, api: DomainApi): void {
  server.resource(PROJECT_TEMPLATE, { name: 'Project with tasks', mimeType: 'application/json' }, async (uri, vars) => {
    const projectId = String(vars['projectId'])
    const [project, tasks] = await Promise.all([api.getProject(projectId), api.listTasks(projectId)])
    return jsonContents(uri.href, { ...project, tasks })
  })

  server.resource(TASK_TEMPLATE, { name: 'Task', mimeType: 'application/json' }, async (uri, vars) =>
    jsonContents(uri.href, await api.getTask(String(vars['taskId'])))
  )
}

/**
 * Two results mcp-lite has no hook for: `initialize` carries no instructions, and
 * `resources/list` knows only what was registered, never one entry per project.
 */
function completeResults(server: McpServer, api: DomainApi): void {
  server.use(async (ctx, next) => {
    await next()
    const result = ctx.response?.result
    if (!isRecord(result)) return
    if (ctx.request.method === 'initialize') result['instructions'] = INSTRUCTIONS
    if (ctx.request.method === 'resources/list') {
      const projects = await api.listProjects()
      result['resources'] = projects.map((project) => ({
        uri: `dotpm://projects/${project.id}`,
        name: project.title,
        description: `${project.taskCount} tasks, ${project.doneCount} done`,
        mimeType: 'application/json'
      }))
    }
  })
}

/** Anything the protocol itself raised already says what went wrong and passes through. */
function toRpcError(err: unknown): JsonRpcError | undefined {
  if (err instanceof ApiRequestError) {
    return { code: err.code === 'invalid' ? JSON_RPC_ERROR_CODES.INVALID_PARAMS : SERVER_ERROR, message: err.message }
  }
  if (err instanceof RpcError) return undefined
  console.error('[PM] mcp request failed', err)
  return { code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR, message: 'request failed; see the developer console' }
}

/**
 * MCP over Streamable HTTP in its stateless form: one POST carries one message, and the
 * reply is JSON unless the client asked for an event stream. There is no session, so a
 * client that wants the standalone `GET` stream is told the method is not allowed.
 */
export function createMcpHandler(api: DomainApi, info: ServerInfo): (request: Request) => Promise<Response> {
  const server = new McpServer({ name: info.name, version: info.version })
  server.onError(toRpcError)
  completeResults(server, api)
  registerTools(server, api)
  registerResources(server, api)
  return new StreamableHttpTransport().bind(server)
}
