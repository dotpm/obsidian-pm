import { beforeEach, describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { HttpApi } from './client'
import { ApiRequestError } from './contract'
import { createRouter } from './router'

const TOKEN = 'secret-token-0123456789'

describe('HttpApi', () => {
  let host: FakeApi
  let api: HttpApi
  let seen: Request[]

  beforeEach(() => {
    host = new FakeApi()
    seen = []
    const route = createRouter({ api: host, info: { name: 'dotpm', version: '9.9.9' }, token: () => TOKEN })
    api = new HttpApi({
      baseUrl: 'http://127.0.0.1:27140/',
      token: TOKEN,
      fetch: async (request) => {
        seen.push(request)
        return route(request)
      }
    })
  })

  it('reads health, projects and tasks', async () => {
    expect(await api.health()).toEqual({ ok: true, name: 'dotpm', version: '9.9.9' })
    expect((await api.listProjects()).map((p) => p.id)).toEqual(['p1'])
    expect((await api.getProject('p1')).statuses.length).toBeGreaterThan(0)
    expect((await api.listTasks('p1')).map((t) => t.id)).toEqual(['t1', 't2'])
    expect((await api.getTask('t2')).title).toBe('Second')
    expect(seen[0].url).toBe('http://127.0.0.1:27140/v1/health')
    expect(seen[1].headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('asks for archived tasks only when told to', async () => {
    await api.listTasks('p1', true)
    expect(seen[0].url).toBe('http://127.0.0.1:27140/v1/projects/p1/tasks?includeArchived=true')
  })

  it('puts a search on the query string', async () => {
    const found = await api.searchTasks({ query: 'sec', projectId: 'p1', includeArchived: true, limit: 5 })
    expect(found.map((t) => t.id)).toEqual(['t2'])
    expect(host.calls.at(-1)).toBe('searchTasks {"query":"sec","projectId":"p1","includeArchived":true,"limit":5}')
  })

  it('writes tasks through every mutation', async () => {
    const created = await api.createTask('p1', { title: 'Third', status: 'todo' })
    expect(created.title).toBe('Third')
    const updated = await api.updateTask(created.id, { title: 'Third!' }, created.updatedAt)
    expect(updated.title).toBe('Third!')
    expect(host.calls.at(-1)).toBe(`updateTask ${created.id} if ${created.updatedAt}`)
    await api.moveTask(created.id, { after: 't1' })
    expect(host.calls.at(-1)).toBe(`moveTask ${created.id} {"after":"t1"}`)
    expect((await api.archiveTask(created.id, true)).archived).toBe(true)
    expect((await api.archiveTask(created.id, false)).archived).toBe(false)
    await api.deleteTask(created.id)
    expect(host.project.tasks.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('pages changes', async () => {
    host.changeLog.push({ seq: 1, at: 'now', kind: 'task', op: 'upsert', id: 't1', projectId: 'p1' })
    expect((await api.changes(null)).changes).toEqual([])
    expect((await api.changes(0)).changes.map((c) => c.seq)).toEqual([1])
    expect(seen[1].url).toBe('http://127.0.0.1:27140/v1/changes?since=0')
  })

  it('creates projects', async () => {
    const created = await api.createProject({ title: 'New', icon: '🚀' })
    expect(created).toMatchObject({ id: 'p2', title: 'New', icon: '🚀' })
    expect(seen.at(-1)?.method).toBe('POST')
    expect(seen.at(-1)?.url).toBe('http://127.0.0.1:27140/v1/projects')
    await expect(api.createProject({ title: '' })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('rethrows what the host refused with the same code', async () => {
    await expect(api.getTask('nope')).rejects.toMatchObject({ code: 'not_found', message: 'task nope not found' })
    await expect(api.createTask('p1', { title: '' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(api.updateTask('t1', { title: 'x' }, 'other')).rejects.toMatchObject({ code: 'conflict' })
    const wrong = new HttpApi({ baseUrl: 'http://127.0.0.1:27140', token: 'x', fetch: api['send'] })
    await expect(wrong.listProjects()).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('reports a host it cannot reach as unavailable', async () => {
    const down = new HttpApi({
      baseUrl: 'http://127.0.0.1:1',
      token: TOKEN,
      fetch: () => Promise.reject(new Error('ECONNREFUSED'))
    })
    const err = await down.listProjects().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect(err).toMatchObject({ code: 'unavailable', message: 'could not reach http://127.0.0.1:1: ECONNREFUSED' })
  })

  it('keeps an unexpected reply readable', async () => {
    const odd = new HttpApi({
      baseUrl: 'http://127.0.0.1:1',
      token: TOKEN,
      fetch: async () => new Response('gone fishing', { status: 502 })
    })
    await expect(odd.listProjects()).rejects.toThrow('HTTP 502: gone fishing')
  })
})
