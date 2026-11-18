/**
 * Proxy `/engine/*` to the service that owns the path, on the console's origin.
 *
 * Multi-engine routing:
 * * `/engine/auth/*` belongs to the shared auth Worker (`AUTH`). Sign-in works
 *   independently of whether any individual engine is up or down.
 * * `/engine/engines` returns the public registry of configured engines so the
 *   SPA can discover and switch between multiple engines without a rebuild.
 * * `/engine/by/<engineId>/*` forwards to that specific registered engine.
 * * `/engine/api/*`, `/engine/healthz`, `/engine/cdn-cgi/*` forward to the
 *   default (first) registered engine.
 */

const DEFAULT_AUTH = 'https://aixodia-auth.aixodia.workers.dev'
const DEFAULT_ENGINE_ENTRY = {
  id: 'default',
  name: 'Primary Engine',
  url: 'https://engine.aixodia.dpdns.org',
}

const AUTH_PREFIXES = ['/auth/']
const ENGINE_PREFIXES = ['/api/', '/healthz', '/cdn-cgi/']

const DEFAULT_REGISTRY_URL = 'https://engines.aixodia.dpdns.org/engines'

function sanitizeId(raw, fallback) {
  const clean = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || fallback
}

/**
 * Which engines exist, asked of the Worker that routes to them (`GET /engines`
 * on the engine gateway, read from the `engines` table in D1). A registry that
 * cannot answer is not a reason to stop working: the default engine still
 * answers on its own hostname.
 */
async function loadEngineRegistry(env = {}) {
  const registryUrl = String(env.ENGINE_REGISTRY_URL || DEFAULT_REGISTRY_URL).trim()
  try {
    const response = await fetch(registryUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })
    if (response.ok) {
      const body = await response.json()
      const engines = (Array.isArray(body?.engines) ? body.engines : [])
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') return null
          const url = String(entry.url || '').trim().replace(/\/+$/, '')
          if (!/^https?:\/\//i.test(url)) return null
          return {
            id: sanitizeId(entry.id || entry.name, `engine-${index + 1}`),
            name: String(entry.name || entry.id || url).trim(),
            url,
            subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
            tag: typeof entry.tag === 'string' ? entry.tag : undefined,
          }
        })
        .filter(Boolean)
      if (engines.length > 0) return engines
    }
  } catch {
    /* the registry is down or slow; the default engine is still an engine */
  }

  const singleUrl = String(env.ENGINE_URL || DEFAULT_ENGINE_ENTRY.url).trim().replace(/\/+$/, '')
  return [{ ...DEFAULT_ENGINE_ENTRY, url: singleUrl }]
}

function resolveRoute(subpath, engines, authOrigin) {
  if (AUTH_PREFIXES.some((prefix) => subpath.startsWith(prefix))) {
    return { kind: 'auth', upstreamBase: authOrigin, forwardPath: subpath, engineId: null }
  }

  let selected = engines[0]
  let forwardPath = subpath

  if (subpath === '/by' || subpath.startsWith('/by/')) {
    const rest = subpath.slice('/by/'.length)
    const slash = rest.indexOf('/')
    const requestedId = decodeURIComponent(slash >= 0 ? rest.slice(0, slash) : rest)
    const found = engines.find((entry) => entry.id === requestedId)
    if (!found) return { kind: 'unknown_engine', engineId: requestedId }
    selected = found
    forwardPath = slash >= 0 ? rest.slice(slash) : '/'
  }

  if (ENGINE_PREFIXES.some((prefix) => forwardPath.startsWith(prefix))) {
    return {
      kind: 'engine',
      upstreamBase: selected.url,
      forwardPath,
      engineId: selected.id,
    }
  }

  return null
}

export async function onRequest({ request, env = {} }) {
  const url = new URL(request.url)
  const subpath = url.pathname.replace(/^\/engine/, '') || '/'
  const authOrigin = String(env.AUTH_URL || DEFAULT_AUTH).trim().replace(/\/+$/, '')
  const engines = await loadEngineRegistry(env)

  if (request.method === 'GET' && subpath === '/engines') {
    const publicList = engines.map((entry, index) => ({
      id: entry.id,
      name: entry.name,
      host: new URL(entry.url).host,
      url: index === 0 && entry.id === 'default' ? '/engine' : `/engine/by/${encodeURIComponent(entry.id)}`,
      subtitle: entry.subtitle ?? null,
      tag: entry.tag ?? null,
      default: index === 0,
    }))
    return new Response(JSON.stringify({ engines: publicList }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }

  const route = resolveRoute(subpath, engines, authOrigin)
  if (!route) return new Response('Not found', { status: 404 })
  if (route.kind === 'unknown_engine') {
    return new Response(
      JSON.stringify({ error: `Unknown engine "${route.engineId}"`, code: 'UNKNOWN_ENGINE' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )
  }

  // A registry entry is a base URL, not just an origin: `…/m-8a7d1192` keeps its
  // path when a request for `/api/...` is joined onto it.
  const target = new URL(route.upstreamBase.replace(/\/+$/, '') + route.forwardPath + url.search)
  const isEngine = route.kind === 'engine'

  const headers = new Headers()
  for (const name of [
    'accept',
    'accept-language',
    'authorization',
    'content-type',
    'cookie',
    'origin',
    'referer',
    'user-agent',
    'cf-access-jwt-assertion',
  ]) {
    const value = request.headers.get(name)
    if (!value) continue
    if (name === 'cookie' && isEngine && route.forwardPath.startsWith('/api/')) continue
    headers.set(name, value)
  }
  headers.set('host', new URL(route.upstreamBase).host)

  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  let upstream
  try {
    upstream = await fetch(target.toString(), init)
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'upstream_unreachable',
        code: isEngine ? 'ENGINE_DOWN' : 'AUTH_DOWN',
        engine: route.engineId,
        detail: String(err?.message || err),
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }

  const responseHeaders = new Headers()
  for (const name of [
    'content-type',
    'cache-control',
    'location',
    'set-cookie',
    'www-authenticate',
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
  ]) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }

  const contentType = responseHeaders.get('content-type') || ''
  if (upstream.status >= 500 && !contentType.includes('json')) {
    return new Response(
      JSON.stringify({
        error: 'upstream_error',
        code: isEngine ? 'ENGINE_DOWN' : 'AUTH_DOWN',
        engine: route.engineId,
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}
