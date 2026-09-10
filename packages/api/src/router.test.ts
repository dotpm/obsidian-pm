import { beforeEach, describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { bearerAuth, createRouter, tokenMatches, type HttpRequest, type HttpResponse } from './router'

const TOKEN = 'secret-token-0123456789'

function request(method: string, path: string, extra: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method,
    path,
    query: {},
    headers: { authorization: `Bearer ${TOKEN}` },
    body: undefined,
    ...extra
  }
}

describe('createRouter', () => {
  let api: FakeApi
  let route: (req: HttpRequest) => Promise<HttpResponse>

  beforeEach(() => {
    api = new FakeApi()
    route = createRouter({ api, info: { name: 'dotpm', version: '9.9.9' }, authorized: bearerAuth(() => TOKEN) })
  })

  it('answers health without a token', async () => {
    const res = await route(request('GET', '/v1/health', { headers: {} }))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, name: 'dotpm', version: '9.9.9' })
  })

  it('refuses everything else without the token', async () => {
    const res = await route(request('GET', '/v1/projects', { headers: {} }))
    expect(res.status).toBe(401)
    expect(api.calls).toEqual([])
  })

  it('lists and reads projects and tasks', async () => {
    expect((await route(request('GET', '/v1/projects'))).body).toEqual([
      expect.objectContaining({ id: 'p1', title: 'Demo', taskCount: 2, doneCount: 1 })
    ])
    expect((await route(request('GET', '/v1/projects/p1'))).body).toMatchObject({
      id: 'p1',
      statuses: expect.any(Array)
    })
    const tasks = await route(request('GET', '/v1/projects/p1/tasks'))
    expect((tasks.body as unknown[]).length).toBe(2)
    expect((await route(request('GET', '/v1/tasks/t2'))).body).toMatchObject({ id: 't2', position: 1 })
  })

  it('maps client mistakes to statuses', async () => {
    expect((await route(request('GET', '/v1/projects/nope'))).status).toBe(404)
    expect((await route(request('GET', '/v1/nothing/here'))).status).toBe(404)
    const bad = await route(request('POST', '/v1/projects/p1/tasks', { body: { title: '' } }))
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({ error: { code: 'invalid', message: 'title must not be empty' } })
  })

  it('creates, updates with If-Match, moves, archives and deletes', async () => {
    const created = await route(
      request('POST', '/v1/projects/p1/tasks', { body: { title: 'Third', due: '2030-01-02' } })
    )
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ id: 't3', title: 'Third', due: '2030-01-02' })

    const stale = await route(
      request('PATCH', '/v1/tasks/t3', {
        body: { status: 'done' },
        headers: { authorization: `Bearer ${TOKEN}`, 'if-match': '"old"' }
      })
    )
    expect(stale.status).toBe(412)
    const updated = await route(request('PATCH', '/v1/tasks/t3', { body: { status: 'done' } }))
    expect(updated.body).toMatchObject({ status: 'done' })

    await route(request('POST', '/v1/tasks/t3/move', { body: { parentId: 't1' } }))
    expect(api.calls).toContain('moveTask t3 {"parentId":"t1"}')

    expect((await route(request('POST', '/v1/tasks/t3/archive'))).body).toMatchObject({ archived: true })
    expect((await route(request('POST', '/v1/tasks/t3/archive', { body: { archived: false } }))).body).toMatchObject({
      archived: false
    })

    expect((await route(request('DELETE', '/v1/tasks/t3'))).status).toBe(204)
    expect((await route(request('GET', '/v1/tasks/t3'))).status).toBe(404)
  })

  it('searches with the q parameter and pages changes by cursor', async () => {
    const found = await route(request('GET', '/v1/search', { query: { q: 'sec', limit: '5' } }))
    expect((found.body as Array<{ id: string }>).map((t) => t.id)).toEqual(['t2'])
    expect(api.calls.at(-1)).toBe('searchTasks {"query":"sec","limit":5}')

    expect((await route(request('GET', '/v1/changes', { query: { since: 'x' } }))).status).toBe(400)
    await route(request('GET', '/v1/changes', { query: { since: '3' } }))
    expect(api.calls.at(-1)).toBe('changes 3')
  })

  it('serves MCP on /mcp and rejects the session methods it has no session for', async () => {
    const init = await route(
      request('POST', '/mcp', {
        body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }
      })
    )
    expect(init.status).toBe(200)
    expect(init.body).toMatchObject({ id: 1, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'dotpm' } } })

    const note = await route(request('POST', '/mcp', { body: { jsonrpc: '2.0', method: 'notifications/initialized' } }))
    expect(note.status).toBe(202)
    expect(note.body).toBeUndefined()

    const headers = { authorization: `Bearer ${TOKEN}`, accept: 'text/event-stream' }
    expect((await route(request('GET', '/mcp', { headers }))).status).toBe(405)
    expect((await route(request('DELETE', '/mcp'))).status).toBe(405)
  })

  it('hands an event stream back to the host untouched', async () => {
    const res = await route(
      request('POST', '/mcp', {
        headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/json, text/event-stream' },
        body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_projects' } }
      })
    )
    expect(res.headers).toMatchObject({ 'content-type': 'text/event-stream' })
    expect(res.body).toBeUndefined()
    expect(await new Response(res.stream).text()).toContain('"id":4')
  })

  it('needs the token for MCP too', async () => {
    const res = await route(request('POST', '/mcp', { headers: {}, body: { jsonrpc: '2.0', id: 1, method: 'ping' } }))
    expect(res.status).toBe(401)
  })
})

describe('tokenMatches', () => {
  it('needs an exact, non-empty match', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true)
    expect(tokenMatches('abd', 'abc')).toBe(false)
    expect(tokenMatches('ab', 'abc')).toBe(false)
    expect(tokenMatches(null, 'abc')).toBe(false)
    expect(tokenMatches('', '')).toBe(false)
  })
})
