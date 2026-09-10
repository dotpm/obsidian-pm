import { ApiRequestError, ERROR_STATUS, type DomainApi } from './contract'
import { createMcpHandler, type ServerInfo } from './mcp'
import { parseTaskSearch } from './resources'

export interface HttpRequest {
  method: string
  /** Pathname only, no query string. */
  path: string
  query: Record<string, string>
  /** Lower-cased header names. */
  headers: Record<string, string>
  body: unknown
}

export interface HttpResponse {
  status: number
  body?: unknown
  headers?: Record<string, string>
  /** Set instead of `body` when the host must pipe the bytes through unchanged. */
  stream?: ReadableStream<Uint8Array>
}

export interface HttpHost {
  api: DomainApi
  info: ServerInfo
  authorized(req: HttpRequest): boolean
}

function json(status: number, body: unknown): HttpResponse {
  return { status, body }
}

function error(code: keyof typeof ERROR_STATUS, message: string): HttpResponse {
  return json(ERROR_STATUS[code], { error: { code, message } })
}

/** Matches `/v1/tasks/:id/move` style patterns, returning the named segments. */
function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/')
  const have = path.split('/')
  if (want.length !== have.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) {
      if (!have[i]) return null
      params[want[i].slice(1)] = decodeURIComponent(have[i])
    } else if (want[i] !== have[i]) {
      return null
    }
  }
  return params
}

function bearer(req: HttpRequest): string | null {
  const header = req.headers['authorization'] ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null
}

/** Constant-time compare, so the token can't be guessed byte by byte through timing. */
export function tokenMatches(presented: string | null, expected: string): boolean {
  if (!presented || !expected || presented.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export function bearerAuth(token: () => string): (req: HttpRequest) => boolean {
  return (req) => tokenMatches(bearer(req), token())
}

async function route(req: HttpRequest, host: HttpHost): Promise<HttpResponse> {
  const { api } = host
  const { method, path } = req
  let p: Record<string, string> | null

  if (path === '/v1/projects' && method === 'GET') return json(200, await api.listProjects())

  if ((p = match('/v1/projects/:id', path)) && method === 'GET') return json(200, await api.getProject(p['id']))

  if ((p = match('/v1/projects/:id/tasks', path))) {
    if (method === 'GET') return json(200, await api.listTasks(p['id'], req.query['includeArchived'] === 'true'))
    if (method === 'POST') return json(201, await api.createTask(p['id'], req.body))
  }

  if ((p = match('/v1/tasks/:id', path))) {
    if (method === 'GET') return json(200, await api.getTask(p['id']))
    if (method === 'PATCH') {
      const expected = req.headers['if-match']?.replace(/^"|"$/g, '')
      return json(200, await api.updateTask(p['id'], req.body, expected))
    }
    if (method === 'DELETE') {
      await api.deleteTask(p['id'])
      return { status: 204 }
    }
  }

  if ((p = match('/v1/tasks/:id/move', path)) && method === 'POST') {
    return json(200, await api.moveTask(p['id'], req.body))
  }

  if ((p = match('/v1/tasks/:id/archive', path)) && method === 'POST') {
    const body = (req.body ?? {}) as { archived?: unknown }
    return json(200, await api.archiveTask(p['id'], body.archived !== false))
  }

  if (path === '/v1/search' && method === 'GET') {
    return json(
      200,
      await api.searchTasks(parseTaskSearch({ ...req.query, query: req.query['q'] ?? req.query['query'] }))
    )
  }

  if (path === '/v1/changes' && method === 'GET') {
    const since = req.query['since']
    const cursor = since === undefined || since === '' ? null : Number(since)
    if (cursor !== null && !Number.isInteger(cursor)) return error('invalid', 'since must be an integer cursor')
    return json(200, await api.changes(cursor))
  }

  return error('not_found', `no route for ${method} ${path}`)
}

/** The MCP transport speaks fetch, so the request is rebuilt and the reply unwrapped. */
async function mcp(handle: (request: Request) => Promise<Response>, req: HttpRequest): Promise<HttpResponse> {
  const headers = new Headers(req.headers)
  headers.delete('content-length')
  const response = await handle(
    new Request('http://127.0.0.1/mcp', {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body)
    })
  )
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.startsWith('text/event-stream') && response.body) {
    return { status: response.status, stream: response.body, headers: { 'content-type': contentType } }
  }
  if (!contentType.startsWith('application/json')) return { status: response.status }
  const raw = await response.text()
  return { status: response.status, body: raw ? JSON.parse(raw) : undefined }
}

/**
 * The whole HTTP surface, independent of any server: the host reads the request, hands
 * it here, and writes whatever comes back. `/v1/health` needs no token. The MCP server
 * behind `/mcp` is built once, so build the router once too.
 */
export function createRouter(host: HttpHost): (req: HttpRequest) => Promise<HttpResponse> {
  const handleMcp = createMcpHandler(host.api, host.info)
  return async (req) => {
    if (req.path === '/v1/health' && req.method === 'GET') {
      return json(200, { ok: true, name: host.info.name, version: host.info.version })
    }
    if (!host.authorized(req)) return error('unauthorized', 'missing or wrong bearer token')
    try {
      return req.path === '/mcp' ? await mcp(handleMcp, req) : await route(req, host)
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) return error(err.code, err.message)
      console.error('[PM] api request failed', err)
      return json(500, { error: { code: 'internal', message: 'request failed; see the developer console' } })
    }
  }
}
