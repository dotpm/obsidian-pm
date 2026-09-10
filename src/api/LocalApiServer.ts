/// <reference types="node" />
import { createRouter, type HttpHost } from '@dotpm/api'

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
 * The localhost socket in front of the router: a Node request becomes a `Request`, and
 * whatever comes back is written out as it arrives. Node's `http` is reached through the
 * desktop app's `require`, so this file loads on mobile but `start` refuses there.
 */
export class LocalApiServer {
  private server: Server | null = null
  private boundPort = 0
  private readonly route: (request: Request) => Response | Promise<Response>

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
    const body = await this.read(req)
    if (body === null) {
      res.writeHead(413).end()
      return
    }
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : (value ?? ''))
    }
    const method = req.method ?? 'GET'
    const request = new Request(`http://127.0.0.1${req.url ?? '/'}`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body
    })
    await this.write(res, await this.route(request))
  }

  /** The body as text, or null when the client sent more than we are willing to hold. */
  private async read(req: IncomingMessage): Promise<string | null> {
    const decoder = new TextDecoder()
    let raw = ''
    let size = 0
    for await (const chunk of req as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) return null
      raw += decoder.decode(chunk, { stream: true })
    }
    return raw + decoder.decode()
  }

  private async write(res: ServerResponse, response: Response): Promise<void> {
    res.writeHead(response.status, Object.fromEntries(response.headers))
    const stream = response.body
    if (!stream) {
      res.end()
      return
    }
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  }
}
