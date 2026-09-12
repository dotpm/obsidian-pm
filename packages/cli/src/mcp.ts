export interface BridgeOptions {
  baseUrl: string
  token: string
  lines: AsyncIterable<string>
  write: (line: string) => void
  fetch: (request: Request) => Promise<Response>
}

const SERVER_ERROR = -32000

function requestId(line: string): unknown {
  try {
    const parsed = JSON.parse(line) as { id?: unknown }
    return parsed.id ?? null
  } catch {
    return null
  }
}

function rpcError(id: unknown, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code: SERVER_ERROR, message } })
}

/** A reply that is not JSON-RPC, such as the router refusing the token, becomes one. */
function fromHttp(status: number, text: string, id: unknown): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return rpcError(id, `HTTP ${status}: ${text.trim()}`)
  }
  const message = (parsed as { jsonrpc?: unknown; error?: { message?: unknown } } | null) ?? {}
  if (message.jsonrpc === '2.0') return JSON.stringify(parsed)
  const reason = typeof message.error?.message === 'string' ? message.error.message : text.trim()
  return rpcError(id, `HTTP ${status}: ${reason}`)
}

/**
 * MCP over stdio for clients that cannot speak Streamable HTTP or set an auth header:
 * each line on stdin is one message posted to the server, and each reply is one line on
 * stdout. Notifications get no reply. The protocol version the server chose at
 * `initialize` is sent back with every later message, as the transport expects.
 */
export async function bridge(options: BridgeOptions): Promise<void> {
  let protocolVersion: string | null = null
  for await (const line of options.lines) {
    if (!line.trim()) continue
    const headers: Record<string, string> = {
      authorization: `Bearer ${options.token}`,
      'content-type': 'application/json',
      accept: 'application/json'
    }
    if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion
    let text: string
    let status: number
    try {
      const response = await options.fetch(
        new Request(`${options.baseUrl}/mcp`, { method: 'POST', headers, body: line })
      )
      status = response.status
      text = await response.text()
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      options.write(rpcError(requestId(line), `could not reach ${options.baseUrl}: ${reason}`))
      continue
    }
    if (!text.trim()) continue
    const reply = fromHttp(status, text, requestId(line))
    const result = (JSON.parse(reply) as { result?: { protocolVersion?: unknown } }).result
    if (typeof result?.protocolVersion === 'string') protocolVersion = result.protocolVersion
    options.write(reply)
  }
}
