import { beforeEach, describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { createRouter, tokenMatches } from './router'

const TOKEN = 'secret-token-0123456789'

describe('createRouter', () => {
  let api: FakeApi
  let route: (request: Request) => Response | Promise<Response>

  beforeEach(() => {
    api = new FakeApi()
    route = createRouter({ api, info: { name: 'dotpm', version: '9.9.9' }, token: () => TOKEN })
  })

  async function send(
    method: string,
    path: string,
    extra: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    return route(
      new Request(`http://127.0.0.1${path}`, {
        method,
        headers: { authorization: `Bearer ${TOKEN}`, ...extra.headers },
        body: extra.body === undefined ? undefined : JSON.stringify(extra.body)
      })
    )
  }

  async function json(method: string, path: string, extra?: { body?: unknown; headers?: Record<string, string> }) {
    const res = await send(method, path, extra)
    return { status: res.status, body: res.status === 204 ? undefined : await res.json() }
  }

  it('answers health without a token', async () => {
    const res = await send('GET', '/v1/health', { headers: { authorization: '' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, name: 'dotpm', version: '9.9.9' })
  })

  it('refuses everything else without the token', async () => {
    const missing = await route(new Request('http://127.0.0.1/v1/projects'))
    expect(missing.status).toBe(401)
    expect(await missing.json()).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } })
    expect((await send('GET', '/v1/projects', { headers: { authorization: 'Bearer nope' } })).status).toBe(401)
    expect(api.calls).toEqual([])
  })

  it('lists and reads projects and tasks', async () => {
    expect((await json('GET', '/v1/projects')).body).toEqual([
      expect.objectContaining({ id: 'p1', title: 'Demo', taskCount: 2, doneCount: 1 })
    ])
    expect((await json('GET', '/v1/projects/p1')).body).toMatchObject({ id: 'p1', statuses: expect.any(Array) })
    const tasks = await json('GET', '/v1/projects/p1/tasks')
    expect((tasks.body as unknown[]).length).toBe(2)
    expect((await json('GET', '/v1/tasks/t2')).body).toMatchObject({ id: 't2', position: 1 })
  })

  it('maps client mistakes to statuses', async () => {
    expect((await json('GET', '/v1/projects/nope')).status).toBe(404)
    const unknown = await json('GET', '/v1/nothing/here')
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject({ error: { code: 'not_found' } })
    const bad = await json('POST', '/v1/projects/p1/tasks', { body: { title: '' } })
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({ error: { code: 'invalid', message: 'title must not be empty' } })
    const broken = await route(
      new Request('http://127.0.0.1/v1/projects/p1/tasks', {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
        body: '{ not json'
      })
    )
    expect(broken.status).toBe(400)
    expect(await broken.json()).toEqual({ error: { code: 'invalid', message: 'body is not valid JSON' } })
  })

  it('creates, updates with If-Match, moves, archives and deletes', async () => {
    const created = await json('POST', '/v1/projects/p1/tasks', { body: { title: 'Third', due: '2030-01-02' } })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ id: 't3', title: 'Third', due: '2030-01-02' })

    const stale = await json('PATCH', '/v1/tasks/t3', {
      body: { status: 'done' },
      headers: { 'if-match': '"old"' }
    })
    expect(stale.status).toBe(412)
    expect((await json('PATCH', '/v1/tasks/t3', { body: { status: 'done' } })).body).toMatchObject({ status: 'done' })

    await json('POST', '/v1/tasks/t3/move', { body: { parentId: 't1' } })
    expect(api.calls).toContain('moveTask t3 {"parentId":"t1"}')

    expect((await json('POST', '/v1/tasks/t3/archive')).body).toMatchObject({ archived: true })
    expect((await json('POST', '/v1/tasks/t3/archive', { body: { archived: false } })).body).toMatchObject({
      archived: false
    })

    expect((await json('DELETE', '/v1/tasks/t3')).status).toBe(204)
    expect((await json('GET', '/v1/tasks/t3')).status).toBe(404)
  })

  it('searches with the q parameter and pages changes by cursor', async () => {
    const found = await json('GET', '/v1/search?q=sec&limit=5')
    expect((found.body as Array<{ id: string }>).map((task) => task.id)).toEqual(['t2'])
    expect(api.calls.at(-1)).toBe('searchTasks {"query":"sec","limit":5}')

    expect((await json('GET', '/v1/changes?since=x')).status).toBe(400)
    await json('GET', '/v1/changes?since=3')
    expect(api.calls.at(-1)).toBe('changes 3')
  })

  it('serves MCP on /mcp and rejects the session methods it has no session for', async () => {
    const init = await json('POST', '/mcp', {
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }
    })
    expect(init.status).toBe(200)
    expect(init.body).toMatchObject({ id: 1, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'dotpm' } } })

    const note = await send('POST', '/mcp', { body: { jsonrpc: '2.0', method: 'notifications/initialized' } })
    expect(note.status).toBe(202)
    expect(await note.text()).toBe('')

    expect((await send('GET', '/mcp', { headers: { accept: 'text/event-stream' } })).status).toBe(405)
    expect((await send('DELETE', '/mcp')).status).toBe(405)
  })

  it('hands an event stream straight back', async () => {
    const res = await send('POST', '/mcp', {
      headers: { accept: 'application/json, text/event-stream' },
      body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_projects' } }
    })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('"id":4')
  })

  it('needs the token for MCP too', async () => {
    const res = await route(
      new Request('http://127.0.0.1/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1 }) })
    )
    expect(res.status).toBe(401)
  })
})

describe('tokenMatches', () => {
  it('needs an exact, non-empty match', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true)
    expect(tokenMatches('abd', 'abc')).toBe(false)
    expect(tokenMatches('ab', 'abc')).toBe(false)
    expect(tokenMatches('', 'abc')).toBe(false)
    expect(tokenMatches('', '')).toBe(false)
  })
})
