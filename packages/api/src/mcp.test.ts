import { beforeEach, describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { createMcpHandler } from './mcp'

const INFO = { name: 'dotpm', version: '9.9.9' }

interface Reply {
  status: number
  id?: unknown
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

describe('createMcpHandler', () => {
  let api: FakeApi
  let handle: (request: Request) => Promise<Response>

  beforeEach(() => {
    api = new FakeApi()
    handle = createMcpHandler(api, INFO)
  })

  async function rpc(method: string, params?: unknown, id: number | string = 1): Promise<Reply> {
    const response = await handle(
      new Request('http://127.0.0.1/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
      })
    )
    const raw = await response.text()
    return { status: response.status, ...(raw ? JSON.parse(raw) : {}) }
  }

  function parsed(reply: Reply): unknown {
    const content = (reply.result as { content: Array<{ text: string }> }).content
    return JSON.parse(content[0].text)
  }

  async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
    return rpc('tools/call', { name, arguments: args })
  }

  it('initializes with a supported protocol version and instructions', async () => {
    const old = await rpc('initialize', { protocolVersion: '2025-03-26' })
    expect(old.result).toMatchObject({
      protocolVersion: '2025-03-26',
      serverInfo: INFO,
      capabilities: { tools: {} },
      instructions: expect.stringContaining('status and priority ids')
    })
    const unknown = await rpc('initialize', { protocolVersion: '1999-01-01' })
    expect(unknown.result).toMatchObject({ protocolVersion: '2025-03-26' })
  })

  it('lists tools with schemas and reports unknown methods', async () => {
    const tools = await rpc('tools/list')
    const listed = (tools.result as { tools: Array<{ name: string; inputSchema: object }> }).tools
    expect(listed.map((tool) => tool.name)).toEqual([
      'list_projects',
      'get_project',
      'list_tasks',
      'get_task',
      'search_tasks',
      'create_task',
      'update_task',
      'move_task',
      'archive_task',
      'delete_task',
      'list_changes'
    ])
    expect(listed[1].inputSchema).toMatchObject({ required: ['projectId'] })
    expect((await rpc('nope/method')).error?.code).toBe(-32601)
  })

  it('advertises the schema the arguments are checked against', async () => {
    const tools = await rpc('tools/list')
    const create = (
      tools.result as { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> }
    ).tools.find((tool) => tool.name === 'create_task')
    expect(create?.inputSchema).toMatchObject({
      type: 'object',
      required: ['projectId', 'title'],
      properties: {
        progress: { type: 'integer', minimum: 0, maximum: 100 },
        type: { enum: ['task', 'milestone', 'subtask'] },
        due: { type: 'string', description: expect.stringContaining('YYYY-MM-DD') }
      }
    })
    expect(create?.inputSchema['$schema']).toBeUndefined()

    const refused = await call('create_task', { projectId: 'p1', title: 'Too far', progress: 101 })
    expect(refused.error).toMatchObject({
      code: -32602,
      message: expect.stringContaining('progress must be an integer')
    })
    expect(api.calls).not.toContain('createTask p1')
  })

  it('calls tools and returns JSON text content', async () => {
    expect(parsed(await rpc('tools/call', { name: 'list_projects' }))).toEqual([
      expect.objectContaining({ id: 'p1', title: 'Demo' })
    ])

    const created = await call('create_task', { projectId: 'p1', title: 'Via MCP', tags: ['agent'] })
    expect(parsed(created)).toMatchObject({ id: 't3', title: 'Via MCP', tags: ['agent'] })
    expect(api.calls).toContain('createTask p1')

    await call('update_task', { taskId: 't3', status: 'done', expectedUpdatedAt: 'stale' })
    expect(api.calls.at(-1)).toBe('updateTask t3 if stale')
  })

  it('reports a client mistake as a tool error instead of a protocol error', async () => {
    const reply = await call('get_task', { taskId: 'zzz' })
    expect(reply.error).toBeUndefined()
    expect(reply.result).toMatchObject({ isError: true })
    expect(parsed(reply)).toEqual({ error: 'not_found', message: 'task zzz not found' })
  })

  it('exposes projects as resources and reads them by uri', async () => {
    const list = await rpc('resources/list')
    expect(list.result).toEqual({
      resources: [expect.objectContaining({ uri: 'dotpm://projects/p1', name: 'Demo', mimeType: 'application/json' })]
    })
    const templates = await rpc('resources/templates/list')
    expect((templates.result as { resourceTemplates: Array<{ uriTemplate: string }> }).resourceTemplates).toEqual([
      expect.objectContaining({ uriTemplate: 'dotpm://projects/{projectId}' }),
      expect.objectContaining({ uriTemplate: 'dotpm://tasks/{taskId}' })
    ])

    const read = await rpc('resources/read', { uri: 'dotpm://tasks/t1' })
    const contents = (read.result as { contents: Array<{ uri: string; text: string }> }).contents
    expect(contents[0].uri).toBe('dotpm://tasks/t1')
    expect(JSON.parse(contents[0].text)).toMatchObject({ id: 't1', title: 'First' })

    const project = await rpc('resources/read', { uri: 'dotpm://projects/p1' })
    expect(JSON.parse((project.result as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      id: 'p1',
      tasks: [expect.objectContaining({ id: 't1' }), expect.objectContaining({ id: 't2' })]
    })
  })

  it('answers a notification with 202 and no body', async () => {
    const response = await handle(
      new Request('http://127.0.0.1/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
      })
    )
    expect(response.status).toBe(202)
    expect(await response.text()).toBe('')
  })

  it('streams the reply when the client asks for events', async () => {
    const response = await handle(
      new Request('http://127.0.0.1/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'list_projects' } })
      })
    )
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const frames = await response.text()
    expect(frames).toContain('"id":7')
    expect(frames).toContain('Demo')
  })

  it('refuses a malformed message and a standalone event stream', async () => {
    const bad = await handle(
      new Request('http://127.0.0.1/mcp', { method: 'POST', body: JSON.stringify({ hello: 'world' }) })
    )
    expect(bad.status).toBe(400)
    const stream = await handle(
      new Request('http://127.0.0.1/mcp', { method: 'GET', headers: { accept: 'text/event-stream' } })
    )
    expect(stream.status).toBe(405)
  })
})
