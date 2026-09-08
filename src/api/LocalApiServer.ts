/// <reference types="node" />
import { handleHttp, type HttpHost } from '@dotpm/api'

type HttpModule = typeof import('node:http')
type Server = import('node:http').Server
type IncomingMessage = import('node:http').IncomingMessage
type ServerResponse = import('node:http').ServerResponse

const MAX_BODY_BYTES = 1024 * 1024

export function generateToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The localhost server in front of `handleHttp`. Node's `http` is reached through the
 * desktop app's `require`, so this file loads on mobile but `start` refuses there.
 */
export class LocalApiServer {
  private server: Server | null = null
  private boundPort = 0

  constructor(
    private readonly host: HttpHost,
    private readonly port: () => number
  ) {}

  get running(): boolean {
    return this.server !== null
  }

  get address(): string | null {
    return this.server ? `http://127.0.0.1:${this.boundPort}` : null
  }

  async start(): Promise<void> {
    if (this.server) return
    const nodeRequire = (window as Window & { require?: (id: string) => unknown }).require
    if (!nodeRequire) throw new Error('the local API needs the desktop app')
    const http = nodeRequire('http') as HttpModule
    const server = http.createServer((req, res) => {
      void this.respond(req, res)
    })
    const port = this.port()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    this.boundPort = port
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  private async respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const decoder = new TextDecoder()
    let raw = ''
    let size = 0
    for await (const chunk of req as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) {
        res.writeHead(413).end()
        return
      }
      raw += decoder.decode(chunk, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    if (raw.trim()) {
      try {
        body = JSON.parse(raw)
      } catch {
        this.write(res, 400, { error: { code: 'invalid', message: 'body is not valid JSON' } })
        return
      }
    }
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      headers[name] = Array.isArray(value) ? value.join(', ') : (value ?? '')
    }
    const response = await handleHttp(
      { method: req.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body },
      this.host
    )
    this.write(res, response.status, response.body, response.headers)
  }

  private write(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
    const payload = body === undefined ? '' : JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(payload).byteLength),
      'cache-control': 'no-store',
      ...extra
    })
    res.end(payload)
  }
}
