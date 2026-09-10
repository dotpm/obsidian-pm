import { createRequire } from 'node:module'
import { bearerAuth } from '@dotpm/api'
import { beforeAll, describe, expect, it } from 'vitest'
import { FakeApi } from '../../packages/api/test/fakeApi'
import { LocalApiServer } from './LocalApiServer'

const TOKEN = 'secret-token-0123456789'
const PORT = 39871

describe('LocalApiServer', () => {
  let base: string

  beforeAll(async () => {
    ;(globalThis as unknown as { window: unknown }).window = { require: createRequire(import.meta.url) }
    const server = new LocalApiServer(
      { api: new FakeApi(), info: { name: 'dotpm', version: '9.9.9' }, authorized: bearerAuth(() => TOKEN) },
      () => PORT
    )
    await server.start()
    base = server.address ?? ''
    return async () => {
      await server.stop()
    }
  })

  it('answers health', async () => {
    const res = await fetch(`${base}/v1/health`)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('speaks MCP with a plain JSON reply', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 1, result: { serverInfo: { name: 'dotpm' } } })
  })

  it('streams a tool call when the client accepts events', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_projects' } })
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('content-length')).toBeNull()
    const body = await res.text()
    expect(body.startsWith('data: ')).toBe(true)
    expect(body).toContain('Demo')
  })

  it('refuses a request without the token', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
  })
})
