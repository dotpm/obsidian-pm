import { createRouter } from '@dotpm/api'
import { FakeApi } from '@dotpm/api/testing'
import { describe, expect, it } from 'vitest'
import { bridge } from './mcp'

const TOKEN = 'secret-token-0123456789'

async function* lines(...items: string[]): AsyncIterable<string> {
  yield* items
}

interface Reply {
  id?: unknown
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

async function talk(input: string[], token = TOKEN): Promise<{ replies: Reply[]; seen: Request[] }> {
  const route = createRouter({ api: new FakeApi(), info: { name: 'dotpm', version: '9.9.9' }, token: () => TOKEN })
  const out: string[] = []
  const seen: Request[] = []
  await bridge({
    baseUrl: 'http://127.0.0.1:27151',
    token,
    lines: lines(...input),
    write: (line) => out.push(line),
    fetch: async (request) => {
      seen.push(request.clone())
      return route(request)
    }
  })
  return { replies: out.map((line) => JSON.parse(line) as Reply), seen }
}

const INIT = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }
})

describe('bridge', () => {
  it('answers each request on one line and nothing for a notification', async () => {
    const { replies, seen } = await talk([
      INIT,
      '',
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    ])
    expect(replies).toHaveLength(2)
    expect(replies[0].result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'dotpm' } })
    const tools = (replies[1].result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)
    expect(tools).toContain('list_projects')
    expect(seen[0].headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(seen[0].headers.get('mcp-protocol-version')).toBeNull()
    expect(seen[2].headers.get('mcp-protocol-version')).toBe('2025-06-18')
  })

  it('turns a refused or unreachable server into a JSON-RPC error', async () => {
    const { replies } = await talk([JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' })], 'wrong')
    expect(replies[0]).toMatchObject({ id: 7, error: { code: -32000 } })
    const out: string[] = []
    await bridge({
      baseUrl: 'http://127.0.0.1:1',
      token: TOKEN,
      lines: lines(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list' })),
      write: (line) => out.push(line),
      fetch: () => Promise.reject(new Error('ECONNREFUSED'))
    })
    expect(JSON.parse(out[0])).toMatchObject({
      id: 8,
      error: { message: 'could not reach http://127.0.0.1:1: ECONNREFUSED' }
    })
  })
})
