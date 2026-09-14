import { createRouter } from '@dotpm/api'
import { FakeApi } from '@dotpm/api/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { runCli, type CliDeps } from './cli'

const TOKEN = 'secret-token-0123456789'
const VAULT = '/vault'
const SETTINGS = `${VAULT}/.obsidian/plugins/project-manager/data.json`

interface Run {
  code: number
  out: string
  err: string
  json: unknown
}

describe('runCli', () => {
  let host: FakeApi
  let stdin: string
  let tty: boolean
  let interrupt: AbortController
  let sleeps: number[]
  let onSleep: () => void

  beforeEach(() => {
    host = new FakeApi()
    stdin = ''
    tty = false
    interrupt = new AbortController()
    sleeps = []
    onSleep = () => interrupt.abort()
  })

  async function run(argv: string[], env: Record<string, string> = {}): Promise<Run> {
    const out: string[] = []
    const err: string[] = []
    const route = createRouter({ api: host, info: { name: 'dotpm', version: '9.9.9' }, token: () => TOKEN })
    const files: Record<string, string> = {
      [SETTINGS]: JSON.stringify({ localApiEnabled: true, localApiPort: 27151, localApiToken: TOKEN })
    }
    const deps: CliDeps = {
      env,
      cwd: `${VAULT}/Projects`,
      tty,
      version: '1.2.3',
      exists: (path) => path === `${VAULT}/.obsidian` || path in files,
      readFile: (path) => files[path] ?? null,
      readStdin: async () => stdin,
      stdinLines: async function* () {},
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      fetch: async (request) => route(request),
      sleep: async (ms) => {
        sleeps.push(ms)
        onSleep()
      },
      signal: interrupt.signal
    }
    const code = await runCli(argv, deps)
    const joined = out.join('\n')
    let json: unknown
    try {
      json = JSON.parse(joined)
    } catch {
      json = undefined
    }
    return { code, out: joined, err: err.join('\n'), json }
  }

  it('prints help and the version', async () => {
    expect((await run(['--help'])).out).toContain('Usage: dotpm [options] <command>')
    expect((await run(['create', '--help'])).out).toContain('--title <text>')
    expect((await run(['--version'])).out).toBe('1.2.3')
  })

  it('lists projects and tasks as JSON when piped', async () => {
    const projects = await run(['projects'])
    expect(projects.code).toBe(0)
    expect(projects.json).toMatchObject([{ id: 'p1', title: 'Demo' }])
    const tasks = await run(['tasks', 'p1', '--archived'])
    expect((tasks.json as Array<{ id: string }>).map((t) => t.id)).toEqual(['t1', 't2'])
    expect(host.calls.at(-1)).toBe('listTasks p1')
    const project = await run(['project', 'p1', '--tasks'])
    expect(project.json).toMatchObject({ id: 'p1', tasks: [{ id: 't1' }, { id: 't2' }] })
    expect((await run(['task', 't2'])).json).toMatchObject({ id: 't2', title: 'Second' })
  })

  it('renders tables for a terminal', async () => {
    tty = true
    const projects = await run(['projects'])
    expect(projects.out.split('\n')[0]).toMatch(/^ID\s+TASKS\s+TITLE\s+PATH$/)
    expect(projects.out).toContain('p1  1/2    Demo')
    const tasks = await run(['tasks', 'p1'])
    expect(tasks.out).toContain('t2  done')
    const task = await run(['task', 't1'])
    expect(task.out).toContain('title       First')
    const status = await run(['status'])
    expect(status.out).toContain('server  dotpm 9.9.9')
    expect(status.out).toContain('from    the vault at /vault')
    expect((await run(['--json', 'status'])).json).toMatchObject({ ok: true, url: 'http://127.0.0.1:27151' })
  })

  it('searches with the flags as filters', async () => {
    const found = await run(['search', 'sec', '--project', 'p1', '--archived', '--limit', '5'])
    expect((found.json as Array<{ id: string }>).map((t) => t.id)).toEqual(['t2'])
    expect(host.calls.at(-1)).toBe('searchTasks {"query":"sec","projectId":"p1","includeArchived":true,"limit":5}')
  })

  it('creates projects from flags and JSON', async () => {
    const created = await run([
      'create-project',
      '--title',
      'New',
      '--member',
      'Ann',
      '--member',
      'Bob',
      '--parent',
      'p1',
      '--data',
      '{"color":"#112233","icon":"x"}',
      '--icon',
      '🚀'
    ])
    expect(created.code).toBe(0)
    expect(created.json).toMatchObject({
      id: 'p2',
      title: 'New',
      teamMembers: ['Ann', 'Bob'],
      parentId: 'p1',
      color: '#112233',
      icon: '🚀'
    })
    const untitled = await run(['create-project'])
    expect(untitled.code).toBe(2)
    expect(untitled.err).toContain('title is required')
  })

  it('creates and updates tasks from flags, JSON and stdin', async () => {
    const created = await run([
      'create',
      'p1',
      '--title',
      'Third',
      '--due',
      '2030-01-02',
      '--tag',
      'a',
      '--tag',
      'b',
      '--progress',
      '10',
      '--parent',
      't1'
    ])
    expect(created.code).toBe(0)
    expect(created.json).toMatchObject({ title: 'Third', due: '2030-01-02', tags: ['a', 'b'], progress: 10 })
    const id = (created.json as { id: string }).id
    const updated = await run(['update', id, '--data', '{"priority":"high","title":"ignored"}', '--title', 'Third!'])
    expect(updated.json).toMatchObject({ title: 'Third!', priority: 'high' })
    stdin = '{"status":"done"}'
    expect((await run(['update', id, '--data', '-'])).json).toMatchObject({ status: 'done' })
    const matched = await run(['update', id, '--status', 'todo', '--if-match', 'stale'])
    expect(matched.code).toBe(4)
    expect(JSON.parse(matched.err)).toEqual({ error: { code: 'conflict', message: 'task changed' } })
  })

  it('moves, archives and deletes', async () => {
    await run(['move', 't2', '--top', '--after', 't1'])
    expect(host.calls.at(-1)).toBe('moveTask t2 {"parentId":null,"after":"t1"}')
    expect((await run(['archive', 't2'])).json).toMatchObject({ archived: true })
    expect((await run(['archive', 't2', '--restore'])).json).toMatchObject({ archived: false })
    const refused = await run(['delete', 't2'])
    expect(refused.code).toBe(2)
    expect(refused.err).toContain('pass --yes')
    expect((await run(['delete', 't2', '--yes'])).json).toEqual({ id: 't2' })
    expect(host.project.tasks.map((t) => t.id)).toEqual(['t1'])
  })

  it('reads the change feed', async () => {
    host.changeLog.push({ seq: 1, at: 'now', kind: 'task', op: 'upsert', id: 't1', projectId: 'p1' })
    expect((await run(['changes'])).json).toMatchObject({ cursor: 1, changes: [] })
    expect((await run(['changes', '--since', '0'])).json).toMatchObject({ changes: [{ seq: 1 }] })
    tty = true
    expect((await run(['changes', '--since', '0'])).out).toContain('1    now  task  upsert  t1  p1')
  })

  it('follows the change feed, one line per change, until interrupted', async () => {
    const change = (seq: number) => ({
      seq,
      at: 'now',
      kind: 'task' as const,
      op: 'upsert' as const,
      id: `t${seq}`,
      projectId: 'p1'
    })
    host.changeLog.push(change(1))
    let polls = 0
    onSleep = () => {
      polls++
      if (polls === 1) host.changeLog.push(change(2), change(3))
      else interrupt.abort()
    }
    const followed = await run(['changes', '--follow', '--interval', '0.5'])
    expect(followed.code).toBe(0)
    expect(followed.out.split('\n').map((line) => JSON.parse(line) as { seq: number })).toMatchObject([
      { seq: 2 },
      { seq: 3 }
    ])
    expect(sleeps).toEqual([500, 500])
    expect(host.calls.filter((call) => call.startsWith('changes'))).toEqual(['changes null', 'changes 1', 'changes 1'])
    tty = true
    interrupt = new AbortController()
    onSleep = () => interrupt.abort()
    const human = await run(['changes', '--follow', '--since', '0'])
    expect(human.out.split('\n')).toEqual([
      '1  now  task  upsert  t1  p1',
      '2  now  task  upsert  t2  p1',
      '3  now  task  upsert  t3  p1'
    ])
    expect((await run(['changes', '--follow', '--interval', '0'])).err).toContain('--interval must be a positive')
  })

  it('maps every failure to an exit code and a message', async () => {
    expect(await run(['nope'])).toMatchObject({ code: 2, err: expect.stringContaining('unknown command nope') })
    expect(await run([])).toMatchObject({ code: 2, err: expect.stringContaining('no command given') })
    expect(await run(['tasks'])).toMatchObject({ code: 2, err: expect.stringContaining('projectId is required') })
    expect(await run(['tasks', 'p1', '--due', 'x'])).toMatchObject({ code: 2, err: expect.stringContaining('--due') })
    expect(await run(['task', 'missing'])).toMatchObject({ code: 3 })
    expect(await run(['projects', '--url', 'http://127.0.0.1:27151', '--token', 'wrong'])).toMatchObject({ code: 5 })
    expect(await run(['projects'], { DOTPM_VAULT: '/nowhere' })).toMatchObject({ code: 2 })
    tty = true
    const human = await run(['task', 'missing'])
    expect(human.err).toBe('dotpm: task missing not found')
    expect((await run(['tasks'])).err).toContain('run dotpm --help for usage')
  })
})
