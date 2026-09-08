import { beforeEach, describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { bearerAuth, handleHttp, tokenMatches, type HttpHost, type HttpRequest } from './router'

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

describe('handleHttp', () => {
  let api: FakeApi
  let host: HttpHost

  beforeEach(() => {
    api = new FakeApi()
    host = { api, info: { name: 'dotpm', version: '9.9.9' }, authorized: bearerAuth(() => TOKEN) }
  })

  it('answers health without a token', async () => {
    const res = await handleHttp(request('GET', '/v1/health', { headers: {} }), host)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, name: 'dotpm', version: '9.9.9' })
  })

  it('refuses everything else without the token', async () => {
    const res = await handleHttp(request('GET', '/v1/projects', { headers: {} }), host)
    expect(res.status).toBe(401)
    expect(api.calls).toEqual([])
  })

  it('lists and reads projects and tasks', async () => {
    expect((await handleHttp(request('GET', '/v1/projects'), host)).body).toEqual([
      expect.objectContaining({ id: 'p1', title: 'Demo', taskCount: 2, doneCount: 1 })
    ])
    expect((await handleHttp(request('GET', '/v1/projects/p1'), host)).body).toMatchObject({
      id: 'p1',
      statuses: expect.any(Array)
    })
    const tasks = await handleHttp(request('GET', '/v1/projects/p1/tasks'), host)
    expect((tasks.body as unknown[]).length).toBe(2)
    expect((await handleHttp(request('GET', '/v1/tasks/t2'), host)).body).toMatchObject({ id: 't2', position: 1 })
  })

  it('maps client mistakes to statuses', async () => {
    expect((await handleHttp(request('GET', '/v1/projects/nope'), host)).status).toBe(404)
    expect((await handleHttp(request('GET', '/v1/nothing/here'), host)).status).toBe(404)
    const bad = await handleHttp(request('POST', '/v1/projects/p1/tasks', { body: { title: '' } }), host)
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({ error: { code: 'invalid', message: 'title must not be empty' } })
  })

  it('creates, updates with If-Match, moves, archives and deletes', async () => {
    const created = await handleHttp(
      request('POST', '/v1/projects/p1/tasks', { body: { title: 'Third', due: '2030-01-02' } }),
      host
    )
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ id: 't3', title: 'Third', due: '2030-01-02' })

    const stale = await handleHttp(
      request('PATCH', '/v1/tasks/t3', {
        body: { status: 'done' },
        headers: { authorization: `Bearer ${TOKEN}`, 'if-match': '"old"' }
      }),
      host
    )
    expect(stale.status).toBe(412)
    const updated = await handleHttp(request('PATCH', '/v1/tasks/t3', { body: { status: 'done' } }), host)
    expect(updated.body).toMatchObject({ status: 'done' })

    await handleHttp(request('POST', '/v1/tasks/t3/move', { body: { parentId: 't1' } }), host)
    expect(api.calls).toContain('moveTask t3 {"parentId":"t1"}')

    expect((await handleHttp(request('POST', '/v1/tasks/t3/archive'), host)).body).toMatchObject({ archived: true })
    expect(
      (await handleHttp(request('POST', '/v1/tasks/t3/archive', { body: { archived: false } }), host)).body
    ).toMatchObject({
      archived: false
    })

    expect((await handleHttp(request('DELETE', '/v1/tasks/t3'), host)).status).toBe(204)
    expect((await handleHttp(request('GET', '/v1/tasks/t3'), host)).status).toBe(404)
  })

  it('searches with the q parameter and pages changes by cursor', async () => {
    const found = await handleHttp(request('GET', '/v1/search', { query: { q: 'sec', limit: '5' } }), host)
    expect((found.body as Array<{ id: string }>).map((t) => t.id)).toEqual(['t2'])
    expect(api.calls.at(-1)).toBe('searchTasks {"query":"sec","limit":5}')

    expect((await handleHttp(request('GET', '/v1/changes', { query: { since: 'x' } }), host)).status).toBe(400)
    await handleHttp(request('GET', '/v1/changes', { query: { since: '3' } }), host)
    expect(api.calls.at(-1)).toBe('changes 3')
  })

  it('serves MCP on /mcp and rejects other methods there', async () => {
    const init = await handleHttp(
      request('POST', '/mcp', {
        body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }
      }),
      host
    )
    expect(init.status).toBe(200)
    expect(init.body).toMatchObject({ id: 1, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'dotpm' } } })
    const note = await handleHttp(
      request('POST', '/mcp', { body: { jsonrpc: '2.0', method: 'notifications/initialized' } }),
      host
    )
    expect(note.status).toBe(202)
    expect((await handleHttp(request('GET', '/mcp'), host)).status).toBe(405)
    expect((await handleHttp(request('DELETE', '/mcp'), host)).status).toBe(204)
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
