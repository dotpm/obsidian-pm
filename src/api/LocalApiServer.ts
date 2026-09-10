/// <reference types="node" />
import { createRouter, type HttpHost, type HttpRequest, type HttpResponse } from '@dotpm/api'

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
 * The localhost server in front of the router. Node's `http` is reached through the
 * desktop app's `require`, so this file loads on mobile but `start` refuses there.
 */
export class LocalApiServer {
  private server: Server | null = null
  private boundPort = 0
  private readonly route: (req: HttpRequest) => Promise<HttpResponse>

  constructor(
    host: HttpHost,
    private readonly port: () => number
  ) {
    this.route = createRouter(host)
  }

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
    const response = await this.route({
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      body
    })
    if (response.stream) {
      await this.pipe(res, response.status, response.stream, response.headers)
      return
    }
    this.write(res, response.status, response.body, response.headers)
  }

  private async pipe(
    res: ServerResponse,
    status: number,
    stream: ReadableStream<Uint8Array>,
    extra: Record<string, string> = {}
  ): Promise<void> {
    res.writeHead(status, { 'cache-control': 'no-store', ...extra })
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
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
