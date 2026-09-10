import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { except } from 'hono/combine'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ApiRequestError, ERROR_STATUS, type ApiErrorCode, type DomainApi } from './contract'
import { createMcpHandler, type ServerInfo } from './mcp'
import { parseTaskSearch } from './resources'

export interface HttpHost {
  api: DomainApi
  info: ServerInfo
  token: () => string
}

function fail(code: ApiErrorCode, message: string): { error: { code: ApiErrorCode; message: string } } {
  return { error: { code, message } }
}

/** Constant-time compare, so the token can't be guessed byte by byte through timing. */
export function tokenMatches(presented: string, expected: string): boolean {
  if (!presented || !expected || presented.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/** An empty body is not a mistake: `archive` and the pickers read their defaults from it. */
async function body(c: Context): Promise<unknown> {
  const raw = await c.req.text()
  if (!raw.trim()) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    throw new ApiRequestError('invalid', 'body is not valid JSON')
  }
}

/** Hono's own failures already carry a response; ours become the error shape clients read. */
function toResponse(err: unknown, c: Context): Response {
  if (err instanceof HTTPException) return err.getResponse()
  if (err instanceof ApiRequestError) {
    return c.json(fail(err.code, err.message), ERROR_STATUS[err.code] as ContentfulStatusCode)
  }
  console.error('[PM] api request failed', err)
  return c.json({ error: { code: 'internal', message: 'request failed; see the developer console' } }, 500)
}

/** A query string carries only strings, while the search fields are typed. */
function search(c: Context): Record<string, unknown> {
  const { includeArchived, limit, q, query, ...rest } = c.req.query()
  return {
    ...rest,
    query: q ?? query,
    ...(includeArchived === undefined ? {} : { includeArchived: includeArchived === 'true' }),
    ...(limit === undefined ? {} : { limit: Number(limit) })
  }
}

/**
 * The whole HTTP surface as a fetch handler, so it runs in front of any server that can
 * hand it a `Request`. `/v1/health` is the one route that needs no token. The MCP server
 * behind `/mcp` is built once, so build the router once too.
 */
export function createRouter(host: HttpHost): (request: Request) => Response | Promise<Response> {
  const { api } = host
  const mcp = createMcpHandler(api, host.info)
  const app = new Hono()

  app.use(async (c, next) => {
    await next()
    c.header('cache-control', 'no-store')
  })

  app.use(
    except(
      '/v1/health',
      bearerAuth({
        verifyToken: (token) => tokenMatches(token, host.token()),
        noAuthenticationHeader: { message: fail('unauthorized', 'missing or wrong bearer token') },
        invalidAuthenticationHeader: { message: fail('invalid', 'the authorization header is malformed') },
        invalidToken: { message: fail('unauthorized', 'missing or wrong bearer token') }
      })
    )
  )

  app.get('/v1/health', (c) => c.json({ ok: true, name: host.info.name, version: host.info.version }))

  app.all('/mcp', (c) => mcp(c.req.raw))

  app.get('/v1/projects', async (c) => c.json(await api.listProjects()))

  app.get('/v1/projects/:id', async (c) => c.json(await api.getProject(c.req.param('id'))))

  app.get('/v1/projects/:id/tasks', async (c) =>
    c.json(await api.listTasks(c.req.param('id'), c.req.query('includeArchived') === 'true'))
  )

  app.post('/v1/projects/:id/tasks', async (c) => c.json(await api.createTask(c.req.param('id'), await body(c)), 201))

  app.get('/v1/tasks/:id', async (c) => c.json(await api.getTask(c.req.param('id'))))

  app.patch('/v1/tasks/:id', async (c) => {
    const expected = c.req.header('if-match')?.replace(/^"|"$/g, '')
    return c.json(await api.updateTask(c.req.param('id'), await body(c), expected))
  })

  app.delete('/v1/tasks/:id', async (c) => {
    await api.deleteTask(c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/v1/tasks/:id/move', async (c) => c.json(await api.moveTask(c.req.param('id'), await body(c))))

  app.post('/v1/tasks/:id/archive', async (c) => {
    const asked = ((await body(c)) ?? {}) as { archived?: unknown }
    return c.json(await api.archiveTask(c.req.param('id'), asked.archived !== false))
  })

  app.get('/v1/search', async (c) => c.json(await api.searchTasks(parseTaskSearch(search(c)))))

  app.get('/v1/changes', async (c) => {
    const since = c.req.query('since')
    const cursor = since === undefined || since === '' ? null : Number(since)
    if (cursor !== null && !Number.isInteger(cursor)) {
      throw new ApiRequestError('invalid', 'since must be an integer cursor')
    }
    return c.json(await api.changes(cursor))
  })

  app.notFound((c) => c.json(fail('not_found', `no route for ${c.req.method} ${c.req.path}`), 404))

  app.onError(toResponse)

  return app.fetch
}
