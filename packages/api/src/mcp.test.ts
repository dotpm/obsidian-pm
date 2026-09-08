import { beforeEach, describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { handleMcp, MCP_PROTOCOL_VERSION, type JsonRpcResponse } from './mcp'

const INFO = { name: 'dotpm', version: '9.9.9' }

function rpc(method: string, params?: unknown, id: number | string = 1): unknown {
  return { jsonrpc: '2.0', id, method, params }
}

function parsed(reply: JsonRpcResponse | JsonRpcResponse[] | null): unknown {
  const one = reply as JsonRpcResponse
  const content = (one.result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0].text)
}

describe('handleMcp', () => {
  let api: FakeApi

  beforeEach(() => {
    api = new FakeApi()
  })

  it('initializes with a supported protocol version and falls back to the newest', async () => {
    const old = (await handleMcp(rpc('initialize', { protocolVersion: '2024-11-05' }), api, INFO)) as JsonRpcResponse
    expect(old.result).toMatchObject({ protocolVersion: '2024-11-05', capabilities: { tools: {} } })
    const unknown = (await handleMcp(
      rpc('initialize', { protocolVersion: '1999-01-01' }),
      api,
      INFO
    )) as JsonRpcResponse
    expect(unknown.result).toMatchObject({ protocolVersion: MCP_PROTOCOL_VERSION })
  })

  it('lists tools with schemas and reports unknown methods', async () => {
    const tools = (await handleMcp(rpc('tools/list'), api, INFO)) as JsonRpcResponse
    const names = (tools.result as { tools: Array<{ name: string; inputSchema: object }> }).tools.map((t) => t.name)
    expect(names).toEqual([
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
    const missing = (await handleMcp(rpc('nope/method'), api, INFO)) as JsonRpcResponse
    expect(missing.error?.code).toBe(-32601)
  })

  it('calls tools and returns JSON text content', async () => {
    const reply = await handleMcp(rpc('tools/call', { name: 'list_projects', arguments: {} }), api, INFO)
    expect(parsed(reply)).toEqual([expect.objectContaining({ id: 'p1', title: 'Demo' })])

    const created = await handleMcp(
      rpc('tools/call', { name: 'create_task', arguments: { projectId: 'p1', title: 'Via MCP', tags: ['agent'] } }),
      api,
      INFO
    )
    expect(parsed(created)).toMatchObject({ id: 't3', title: 'Via MCP', tags: ['agent'] })
    expect(api.calls).toContain('createTask p1')

    await handleMcp(
      rpc('tools/call', {
        name: 'update_task',
        arguments: { taskId: 't3', status: 'done', expectedUpdatedAt: 'stale' }
      }),
      api,
      INFO
    )
    expect(api.calls.at(-1)).toBe('updateTask t3 if stale')
  })

  it('reports a client mistake as a tool error instead of a protocol error', async () => {
    const reply = (await handleMcp(
      rpc('tools/call', { name: 'get_task', arguments: { taskId: 'zzz' } }),
      api,
      INFO
    )) as JsonRpcResponse
    expect(reply.error).toBeUndefined()
    expect(reply.result).toMatchObject({ isError: true })
    expect(parsed(reply)).toEqual({ error: 'not_found', message: 'task zzz not found' })
  })

  it('exposes projects as resources and reads tasks by uri', async () => {
    const list = (await handleMcp(rpc('resources/list'), api, INFO)) as JsonRpcResponse
    expect(list.result).toEqual({
      resources: [expect.objectContaining({ uri: 'dotpm://projects/p1', name: 'Demo', mimeType: 'application/json' })]
    })
    const read = (await handleMcp(rpc('resources/read', { uri: 'dotpm://tasks/t1' }), api, INFO)) as JsonRpcResponse
    const contents = (read.result as { contents: Array<{ uri: string; text: string }> }).contents
    expect(contents[0].uri).toBe('dotpm://tasks/t1')
    expect(JSON.parse(contents[0].text)).toMatchObject({ id: 't1', title: 'First' })
    const project = (await handleMcp(
      rpc('resources/read', { uri: 'dotpm://projects/p1' }),
      api,
      INFO
    )) as JsonRpcResponse
    expect(JSON.parse((project.result as { contents: Array<{ text: string }> }).contents[0].text)).toMatchObject({
      id: 'p1',
      tasks: [expect.objectContaining({ id: 't1' }), expect.objectContaining({ id: 't2' })]
    })
  })

  it('handles batches and stays quiet for notifications', async () => {
    expect(await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, api, INFO)).toBeNull()
    const batch = (await handleMcp(
      [rpc('ping', undefined, 'a'), { jsonrpc: '2.0', method: 'notifications/initialized' }],
      api,
      INFO
    )) as JsonRpcResponse[]
    expect(batch).toEqual([{ jsonrpc: '2.0', id: 'a', result: {} }])
    const bad = (await handleMcp({ hello: 'world' }, api, INFO)) as JsonRpcResponse
    expect(bad.error?.code).toBe(-32600)
  })
})
