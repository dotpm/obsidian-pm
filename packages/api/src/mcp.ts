import { toJsonSchema } from '@valibot/to-json-schema'
import {
  JSON_RPC_ERROR_CODES,
  McpServer,
  RpcError,
  StreamableHttpTransport,
  type JsonRpcError,
  type ToolCallResult
} from 'mcp-lite'
import * as v from 'valibot'
import { ApiRequestError, type DomainApi } from './contract'
import { CREATE_FIELDS, MOVE_FIELDS, parseTaskSearch, SEARCH_FIELDS, TASK_FIELDS } from './resources'

export interface ServerInfo {
  name: string
  version: string
}

const SERVER_ERROR = -32000

const INSTRUCTIONS =
  'Projects hold tasks in a tree. Read a project first to learn its status and priority ids before writing tasks.'

const PROJECT_TEMPLATE = 'dotpm://projects/{projectId}'
const TASK_TEMPLATE = 'dotpm://tasks/{taskId}'

function idField(name: string, description: string): v.GenericSchema<string, string> {
  return v.pipe(v.string(`${name} is required`), v.description(description))
}

const projectId = idField('projectId', 'Id of the project, from list_projects')
const taskId = idField('taskId', 'Id of the task, from list_tasks or search_tasks')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** What a tool advertises. The two root keys the conversion adds are noise to a client. */
function jsonSchema(schema: v.GenericSchema): Record<string, unknown> {
  const converted = toJsonSchema(schema, { errorMode: 'ignore', typeMode: 'input' }) as Record<string, unknown>
  delete converted['$schema']
  delete converted['default']
  return converted
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
 * Registers one tool. The schema both checks the arguments, through the transport, and
 * becomes the JSON Schema clients read. A call may leave `arguments` out entirely, which
 * stands for an empty object; a value the vault refuses comes back as a tool result
 * marked `isError` rather than a protocol error.
 */
function tool<S extends v.GenericSchema>(
  server: McpServer,
  name: string,
  def: { description: string; inputSchema: S; run: (args: v.InferOutput<S>) => Promise<unknown> }
): void {
  server.tool<v.InferOutput<S>>(name, {
    description: def.description,
    inputSchema: v.optional(def.inputSchema, () => ({}) as v.InferInput<S>),
    handler: async (args) => {
      try {
        return text(await def.run(args))
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
    inputSchema: v.object({}),
    run: () => api.listProjects()
  })

  tool(server, 'get_project', {
    description: 'One project with its description, team, custom fields and the status and priority ids its tasks use.',
    inputSchema: v.object({ projectId }),
    run: (args) => api.getProject(args.projectId)
  })

  tool(server, 'list_tasks', {
    description: 'All tasks of a project in tree order. Each carries parentId and position.',
    inputSchema: v.object({ projectId, includeArchived: v.optional(v.boolean(), false) }),
    run: (args) => api.listTasks(args.projectId, args.includeArchived)
  })

  tool(server, 'get_task', {
    description: 'One task by id, including its description.',
    inputSchema: v.object({ taskId }),
    run: (args) => api.getTask(args.taskId)
  })

  tool(server, 'search_tasks', {
    description: 'Find tasks across every project by title text, project, status or assignee.',
    inputSchema: v.object(SEARCH_FIELDS),
    run: (args) => api.searchTasks(parseTaskSearch(args))
  })

  tool(server, 'create_task', {
    description: 'Create a task in a project, at the top level or under parentId.',
    inputSchema: v.object({ projectId, ...CREATE_FIELDS }),
    run: ({ projectId: project, ...create }) => api.createTask(project, create)
  })

  tool(server, 'update_task', {
    description:
      'Change fields of a task. Only the fields passed change. Pass expectedUpdatedAt from a previous read to refuse the write when the task changed since.',
    inputSchema: v.object({
      taskId,
      expectedUpdatedAt: v.optional(
        v.pipe(v.string('expectedUpdatedAt must be a string'), v.description('updatedAt from an earlier read'))
      ),
      ...TASK_FIELDS
    }),
    run: ({ taskId: task, expectedUpdatedAt, ...write }) => api.updateTask(task, write, expectedUpdatedAt)
  })

  tool(server, 'move_task', {
    description:
      'Re-parent a task (parentId, null for top level), move it to another project (projectId), or reorder it among its siblings (before or after a sibling id).',
    inputSchema: v.object({ taskId, ...MOVE_FIELDS }),
    run: ({ taskId: task, ...move }) => api.moveTask(task, move)
  })

  tool(server, 'archive_task', {
    description: 'Archive a task and its subtasks, or bring them back with archived: false.',
    inputSchema: v.object({ taskId, archived: v.optional(v.boolean('archived must be true or false'), true) }),
    run: (args) => api.archiveTask(args.taskId, args.archived)
  })

  tool(server, 'delete_task', {
    description: 'Delete a task and its subtasks. Cannot be undone.',
    inputSchema: v.object({ taskId }),
    run: async (args) => {
      await api.deleteTask(args.taskId)
      return { deleted: true }
    }
  })

  tool(server, 'list_changes', {
    description:
      'Projects and tasks changed since a cursor, oldest first. Omit since for the current cursor only. A reset of true means the cursor was too old: refetch.',
    inputSchema: v.object({
      since: v.optional(
        v.pipe(v.number('since must be an integer cursor'), v.integer('since must be an integer cursor'))
      )
    }),
    run: (args) => api.changes(args.since ?? null)
  })
}

function registerResources(server: McpServer, api: DomainApi): void {
  server.resource(PROJECT_TEMPLATE, { name: 'Project with tasks', mimeType: 'application/json' }, async (uri, vars) => {
    const project = String(vars['projectId'])
    const [resource, tasks] = await Promise.all([api.getProject(project), api.listTasks(project)])
    return jsonContents(uri.href, { ...resource, tasks })
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
  const server = new McpServer({
    name: info.name,
    version: info.version,
    schemaAdapter: (schema) => jsonSchema(schema as v.GenericSchema)
  })
  server.onError(toRpcError)
  completeResults(server, api)
  registerTools(server, api)
  registerResources(server, api)
  return new StreamableHttpTransport().bind(server)
}
