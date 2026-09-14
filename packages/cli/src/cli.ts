import { parseArgs, type ParseArgsConfig } from 'node:util'
import { ApiRequestError, type ApiErrorCode } from '@dotpm/api/contract'
import { HttpApi } from '@dotpm/api/client'
import { ConnectionError, resolveConnection, type Connection } from './connection'
import { bridge } from './mcp'
import { render, type Output } from './render'

export interface CliDeps {
  env: Record<string, string | undefined>
  cwd: string
  /** Whether stdout is a terminal; a pipe gets JSON without asking. */
  tty: boolean
  version: string
  exists: (path: string) => boolean
  readFile: (path: string) => string | null
  readStdin: () => Promise<string>
  stdinLines: () => AsyncIterable<string>
  stdout: (text: string) => void
  stderr: (text: string) => void
  fetch: (request: Request) => Promise<Response>
  sleep: (ms: number) => Promise<void>
  /** Aborted when the user interrupts, which ends a following command. */
  signal: AbortSignal
}

interface Flag {
  type: 'string' | 'boolean'
  multiple?: boolean
  /** Placeholder shown in help after the flag, such as `<id>`. */
  value?: string
  help: string
}

type Flags = Record<string, Flag>
type Values = Record<string, string | boolean | string[] | undefined>

interface RunContext {
  api: HttpApi
  connection: Connection
  readStdin: () => Promise<string>
  /** Prints one result now, for commands that keep going. */
  emit: (output: Output) => void
  sleep: (ms: number) => Promise<void>
  signal: AbortSignal
}

interface Command {
  args: string
  summary: string
  flags: Flags
  /** Resolves to nothing when the command already emitted everything it had to say. */
  run: (ctx: RunContext, positionals: string[], values: Values) => Promise<Output | undefined>
}

class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

const EXIT_CODE: Record<ApiErrorCode, number> = {
  invalid: 2,
  not_found: 3,
  conflict: 4,
  unauthorized: 5,
  unavailable: 6
}

const GLOBAL: Flags = {
  json: { type: 'boolean', help: 'Print JSON (the default when stdout is not a terminal)' },
  url: { type: 'string', value: '<url>', help: 'The server, such as http://127.0.0.1:27140; or DOTPM_URL' },
  token: { type: 'string', value: '<token>', help: 'Its bearer token; or DOTPM_TOKEN' },
  vault: {
    type: 'string',
    value: '<path>',
    help: 'A vault folder; or DOTPM_VAULT; else the vault the working directory is in'
  },
  help: { type: 'boolean', help: 'Show help' },
  version: { type: 'boolean', help: 'Show the version' }
}

const FIELDS: Flags = {
  title: { type: 'string', value: '<text>', help: 'Title' },
  description: { type: 'string', value: '<markdown>', help: 'Body of the task note' },
  type: { type: 'string', value: '<type>', help: 'task, milestone or subtask' },
  status: { type: 'string', value: '<id>', help: "One of the project's status ids" },
  priority: { type: 'string', value: '<id>', help: "One of the project's priority ids" },
  start: { type: 'string', value: '<date>', help: 'YYYY-MM-DD, or empty to clear' },
  due: { type: 'string', value: '<date>', help: 'YYYY-MM-DD, or empty to clear' },
  progress: { type: 'string', value: '<0-100>', help: 'Percent done' },
  estimate: { type: 'string', value: '<hours>', help: 'Time estimate in hours' },
  assignee: {
    type: 'string',
    multiple: true,
    value: '<person>',
    help: 'A person on the task; repeatable, replaces the list'
  },
  tag: {
    type: 'string',
    multiple: true,
    value: '<tag>',
    help: 'A tag without the hash; repeatable, replaces the list'
  },
  'depends-on': {
    type: 'string',
    multiple: true,
    value: '<id>',
    help: 'A task this one waits for; repeatable, replaces the list'
  },
  data: {
    type: 'string',
    value: '<json>',
    help: 'Any task fields as a JSON object, or - to read it from stdin; flags override it'
  }
}

function need(positionals: string[], index: number, name: string): string {
  const value = positionals[index]
  if (value === undefined) throw new UsageError(`${name} is required`)
  return value
}

function text(values: Values, name: string): string | undefined {
  const value = values[name]
  return typeof value === 'string' ? value : undefined
}

function list(values: Values, name: string): string[] | undefined {
  const value = values[name]
  return Array.isArray(value) ? value : undefined
}

function number(values: Values, name: string): number | undefined {
  const value = text(values, name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (value.trim() === '' || Number.isNaN(parsed)) throw new UsageError(`--${name} must be a number`)
  return parsed
}

async function jsonData(values: Values, readStdin: () => Promise<string>): Promise<Record<string, unknown>> {
  const raw = text(values, 'data')
  if (raw === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw === '-' ? await readStdin() : raw)
  } catch {
    throw new UsageError('--data must be a JSON object')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UsageError('--data must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

async function taskFields(values: Values, readStdin: () => Promise<string>): Promise<Record<string, unknown>> {
  const body = await jsonData(values, readStdin)
  for (const name of ['title', 'description', 'type', 'status', 'priority', 'start', 'due']) {
    const value = text(values, name)
    if (value !== undefined) body[name] = value
  }
  const progress = number(values, 'progress')
  if (progress !== undefined) body['progress'] = progress
  const estimate = number(values, 'estimate')
  if (estimate !== undefined) body['timeEstimate'] = estimate
  const assignees = list(values, 'assignee')
  if (assignees) body['assignees'] = assignees
  const tags = list(values, 'tag')
  if (tags) body['tags'] = tags
  const dependencies = list(values, 'depends-on')
  if (dependencies) body['dependencies'] = dependencies
  return body
}

/** Prints every change after the cursor as it appears, until the signal aborts. */
async function follow(ctx: RunContext, since: number | undefined, intervalMs: number): Promise<void> {
  let cursor = since ?? (await ctx.api.changes(null)).cursor
  while (!ctx.signal.aborted) {
    const page = await ctx.api.changes(cursor)
    if (page.reset) ctx.emit({ kind: 'reset', value: { cursor: page.cursor } })
    for (const change of page.changes) ctx.emit({ kind: 'change', value: change })
    cursor = page.cursor
    await ctx.sleep(intervalMs)
  }
}

const COMMANDS: Record<string, Command> = {
  projects: {
    args: '',
    summary: 'List every project',
    flags: {},
    run: async ({ api }) => ({ kind: 'projects', value: await api.listProjects() })
  },
  project: {
    args: '<projectId>',
    summary: 'Show a project: its team, custom fields and the status and priority ids its tasks use',
    flags: {
      tasks: { type: 'boolean', help: 'Include its tasks' },
      archived: { type: 'boolean', help: 'Include archived tasks too' }
    },
    run: async ({ api }, positionals, values) => {
      const projectId = need(positionals, 0, 'projectId')
      const project = await api.getProject(projectId)
      if (!values['tasks']) return { kind: 'project', value: project }
      const tasks = await api.listTasks(projectId, values['archived'] === true)
      return { kind: 'project', value: { ...project, tasks } }
    }
  },
  'create-project': {
    args: '--title <text>',
    summary: 'Create a project, at the root or under a parent project',
    flags: {
      title: { type: 'string', value: '<text>', help: 'Title' },
      description: { type: 'string', value: '<markdown>', help: 'Body of the project note' },
      icon: { type: 'string', value: '<emoji>', help: 'Icon shown next to the title' },
      color: { type: 'string', value: '<hex>', help: 'Accent color, such as #8b72be' },
      member: {
        type: 'string',
        multiple: true,
        value: '<person>',
        help: 'A person on the project team; repeatable'
      },
      parent: { type: 'string', value: '<projectId>', help: 'The parent project' },
      data: {
        type: 'string',
        value: '<json>',
        help: 'Any project fields as a JSON object, or - to read it from stdin; flags override it'
      }
    },
    run: async ({ api, readStdin }, _positionals, values) => {
      const body = await jsonData(values, readStdin)
      for (const name of ['title', 'description', 'icon', 'color']) {
        const value = text(values, name)
        if (value !== undefined) body[name] = value
      }
      const members = list(values, 'member')
      if (members) body['teamMembers'] = members
      const parent = text(values, 'parent')
      if (parent !== undefined) body['parentId'] = parent
      return { kind: 'project', value: await api.createProject(body) }
    }
  },
  tasks: {
    args: '<projectId>',
    summary: "List a project's tasks in tree order",
    flags: { archived: { type: 'boolean', help: 'Include archived tasks' } },
    run: async ({ api }, positionals, values) => ({
      kind: 'tasks',
      value: await api.listTasks(need(positionals, 0, 'projectId'), values['archived'] === true)
    })
  },
  task: {
    args: '<taskId>',
    summary: 'Show one task with its description',
    flags: {},
    run: async ({ api }, positionals) => ({ kind: 'task', value: await api.getTask(need(positionals, 0, 'taskId')) })
  },
  search: {
    args: '[text]',
    summary: 'Find tasks across every project by title text, project, status or assignee',
    flags: {
      project: { type: 'string', value: '<id>', help: 'Only tasks of this project' },
      status: { type: 'string', value: '<id>', help: 'Only tasks with this status' },
      assignee: { type: 'string', value: '<person>', help: 'Only tasks this person is on' },
      archived: { type: 'boolean', help: 'Include archived tasks' },
      limit: { type: 'string', value: '<n>', help: 'At most this many, default 50' }
    },
    run: async ({ api }, positionals, values) => ({
      kind: 'tasks',
      value: await api.searchTasks({
        query: positionals[0],
        projectId: text(values, 'project'),
        status: text(values, 'status'),
        assignee: text(values, 'assignee'),
        includeArchived: values['archived'] === true ? true : undefined,
        limit: number(values, 'limit')
      })
    })
  },
  create: {
    args: '<projectId> --title <text>',
    summary: 'Create a task in a project, at the top level or under a parent',
    flags: { ...FIELDS, parent: { type: 'string', value: '<id>', help: 'The parent task' } },
    run: async ({ api, readStdin }, positionals, values) => {
      const body = await taskFields(values, readStdin)
      const parent = text(values, 'parent')
      if (parent !== undefined) body['parentId'] = parent
      return { kind: 'task', value: await api.createTask(need(positionals, 0, 'projectId'), body) }
    }
  },
  update: {
    args: '<taskId>',
    summary: 'Change fields of a task; only the fields passed change',
    flags: {
      ...FIELDS,
      'if-match': {
        type: 'string',
        value: '<updatedAt>',
        help: 'Refuse the write when the task changed since this updatedAt from an earlier read'
      }
    },
    run: async ({ api, readStdin }, positionals, values) => ({
      kind: 'task',
      value: await api.updateTask(
        need(positionals, 0, 'taskId'),
        await taskFields(values, readStdin),
        text(values, 'if-match')
      )
    })
  },
  move: {
    args: '<taskId>',
    summary: 'Re-parent a task, move it to another project, or reorder it among its siblings',
    flags: {
      parent: { type: 'string', value: '<id>', help: 'The new parent task' },
      top: { type: 'boolean', help: 'Make it a top-level task' },
      project: { type: 'string', value: '<id>', help: 'Move it to this project' },
      before: { type: 'string', value: '<id>', help: 'Put it in front of this sibling' },
      after: { type: 'string', value: '<id>', help: 'Put it behind this sibling' }
    },
    run: async ({ api }, positionals, values) => {
      const body: Record<string, unknown> = {}
      if (values['top']) body['parentId'] = null
      for (const [flag, field] of [
        ['parent', 'parentId'],
        ['project', 'projectId'],
        ['before', 'before'],
        ['after', 'after']
      ]) {
        const value = text(values, flag)
        if (value !== undefined) body[field] = value
      }
      return { kind: 'task', value: await api.moveTask(need(positionals, 0, 'taskId'), body) }
    }
  },
  archive: {
    args: '<taskId>',
    summary: 'Archive a task and its subtasks, or bring them back',
    flags: { restore: { type: 'boolean', help: 'Unarchive instead' } },
    run: async ({ api }, positionals, values) => ({
      kind: 'task',
      value: await api.archiveTask(need(positionals, 0, 'taskId'), values['restore'] !== true)
    })
  },
  delete: {
    args: '<taskId> --yes',
    summary: 'Delete a task and its subtasks; cannot be undone',
    flags: { yes: { type: 'boolean', help: 'Confirm the deletion' } },
    run: async ({ api }, positionals, values) => {
      const taskId = need(positionals, 0, 'taskId')
      if (values['yes'] !== true) throw new UsageError('pass --yes to delete a task')
      await api.deleteTask(taskId)
      return { kind: 'deleted', value: { id: taskId } }
    }
  },
  changes: {
    args: '',
    summary: 'What changed since a cursor; without one, only the current cursor',
    flags: {
      since: { type: 'string', value: '<cursor>', help: 'The cursor from an earlier call' },
      follow: { type: 'boolean', help: 'Keep polling and print each change as one line until interrupted' },
      interval: { type: 'string', value: '<seconds>', help: 'How often to poll when following, default 2' }
    },
    run: async (ctx, _positionals, values) => {
      const since = number(values, 'since')
      if (values['follow'] !== true) return { kind: 'changes', value: await ctx.api.changes(since ?? null) }
      const interval = number(values, 'interval') ?? 2
      if (interval <= 0) throw new UsageError('--interval must be a positive number of seconds')
      await follow(ctx, since, interval * 1000)
      return undefined
    }
  },
  status: {
    args: '',
    summary: 'Check that the server answers and show which one',
    flags: {},
    run: async ({ api, connection }) => {
      const health = await api.health()
      return { kind: 'status', value: { ...health, url: connection.baseUrl, source: connection.source } }
    }
  },
  mcp: {
    args: '',
    summary: 'Serve MCP over stdio, for clients that cannot use HTTP or set an auth header',
    flags: {},
    run: () => Promise.reject(new Error('mcp runs outside the command table'))
  }
}

function flagLines(flags: Flags): string[] {
  const entries = Object.entries(flags).map(([name, flag]) => [
    `--${name}${flag.value ? ` ${flag.value}` : ''}`,
    flag.help
  ])
  const width = Math.max(...entries.map(([left]) => left.length))
  return entries.map(([left, help]) => `  ${left.padEnd(width)}  ${help}`)
}

function usage(): string {
  const names = Object.keys(COMMANDS)
  const width = Math.max(...names.map((name) => `${name} ${COMMANDS[name].args}`.length))
  return [
    'Usage: dotpm [options] <command> [arguments]',
    '',
    'Talks to the dotpm plugin in a running Obsidian through its local API.',
    '',
    'Commands:',
    ...names.map((name) => `  ${`${name} ${COMMANDS[name].args}`.padEnd(width)}  ${COMMANDS[name].summary}`),
    '',
    'Options:',
    ...flagLines(GLOBAL),
    '',
    'Run dotpm <command> --help for the flags of one command.'
  ].join('\n')
}

function commandUsage(name: string, command: Command): string {
  const lines = [`Usage: dotpm ${name} ${command.args}`.trimEnd(), '', command.summary]
  if (Object.keys(command.flags).length > 0) lines.push('', 'Flags:', ...flagLines(command.flags))
  return lines.join('\n')
}

function options(flags: Flags): NonNullable<ParseArgsConfig['options']> {
  return Object.fromEntries(
    Object.entries(flags).map(([name, flag]) => [
      name,
      { type: flag.type, ...(flag.multiple ? { multiple: true } : {}) }
    ])
  )
}

function parse(argv: string[], flags: Flags, strict: boolean): { positionals: string[]; values: Values } {
  try {
    const parsed = parseArgs({ args: argv, options: options(flags), allowPositionals: true, strict })
    return { positionals: parsed.positionals, values: parsed.values as Values }
  } catch (err: unknown) {
    throw new UsageError(err instanceof Error ? err.message.replace(/\.$/, '') : String(err))
  }
}

function connect(values: Values, deps: CliDeps): Connection {
  return resolveConnection({
    url: text(values, 'url'),
    token: text(values, 'token'),
    vault: text(values, 'vault'),
    env: deps.env,
    cwd: deps.cwd,
    exists: deps.exists,
    readFile: deps.readFile
  })
}

/** A change on its own line while following, so a reader can act on each as it comes. */
function format(output: Output, json: boolean): string {
  if (!json) return render(output)
  return output.kind === 'change' ? JSON.stringify(output.value) : JSON.stringify(output.value, null, 2)
}

async function dispatch(
  argv: string[],
  deps: CliDeps,
  emit: (output: Output) => void
): Promise<{ output?: Output; text?: string }> {
  const first = parse(argv, GLOBAL, false)
  if (first.values['version']) return { text: deps.version }
  const name = first.positionals[0]
  if (name === undefined) {
    if (first.values['help']) return { text: usage() }
    throw new UsageError('no command given')
  }
  const command = COMMANDS[name]
  if (!command) throw new UsageError(`unknown command ${name}`)
  const { positionals, values } = parse(argv, { ...GLOBAL, ...command.flags }, true)
  if (values['help']) return { text: commandUsage(name, command) }
  const connection = connect(values, deps)
  if (name === 'mcp') {
    await bridge({ ...connection, lines: deps.stdinLines(), write: deps.stdout, fetch: deps.fetch })
    return {}
  }
  const api = new HttpApi({ ...connection, fetch: deps.fetch })
  const args = positionals.slice(positionals.indexOf(name) + 1)
  const ctx: RunContext = { api, connection, readStdin: deps.readStdin, emit, sleep: deps.sleep, signal: deps.signal }
  return { output: await command.run(ctx, args, values) }
}

function errorCode(err: unknown): ApiErrorCode | null {
  if (err instanceof ApiRequestError) return err.code
  if (err instanceof UsageError || err instanceof ConnectionError) return 'invalid'
  return null
}

/** Runs one invocation and returns the exit code. */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const json = argv.includes('--json') || !deps.tty
  try {
    const emit = (output: Output): void => deps.stdout(format(output, json))
    const { output, text: plain } = await dispatch(argv, deps, emit)
    if (plain !== undefined) deps.stdout(plain)
    if (output) emit(output)
    return 0
  } catch (err: unknown) {
    const code = errorCode(err)
    const message = err instanceof Error ? err.message : String(err)
    deps.stderr(json ? JSON.stringify({ error: { code: code ?? 'internal', message } }) : `dotpm: ${message}`)
    if (err instanceof UsageError && !json) deps.stderr('run dotpm --help for usage')
    return code ? EXIT_CODE[code] : 1
  }
}
