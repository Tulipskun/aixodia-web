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
 *
 * Only registered engine origins and explicit path prefixes are forwarded, so
 * this function never acts as an open egress proxy.
 */

const DEFAULT_AUTH = 'https://aixodia-auth.aixodia.workers.dev'
const DEFAULT_ENGINE_ENTRY = {
  id: 'default',
  name: 'Primary Engine',
  url: 'https://engine.aixodia.dpdns.org',
}

const AUTH_PREFIXES = ['/auth/']
// No /terminal here: that is a WebSocket upgrade, and a Pages Function cannot
// proxy one — the engine is dialled directly for it.
const ENGINE_PREFIXES = ['/api/', '/healthz', '/cdn-cgi/']

function sanitizeId(raw, fallback) {
  const clean = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || fallback
}

function parseEngineList(raw) {
  if (!raw) return []
  const trimmed = String(raw).trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((item, idx) => {
          if (!item || typeof item !== 'object') return null
          const rawUrl = String(item.url || '').trim().replace(/\/+$/, '')
          if (!/^https?:\/\//i.test(rawUrl)) return null
          const host = new URL(rawUrl).host
          const id = sanitizeId(item.id || item.name || host, `engine-${idx + 1}`)
          const name = String(item.name || host || id).trim()
          return {
            id,
            name,
            url: rawUrl,
            subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
            tag: typeof item.tag === 'string' ? item.tag : undefined,
          }
        })
        .filter(Boolean)
    } catch {
      return []
    }
  }

  // Comma-separated format: `alpha=https://engine-1.example.com,beta=https://engine-2.example.com`
  // or plain URLs `https://engine-1.example.com,https://engine-2.example.com`.
  return trimmed
    .split(',')
    .map((part, idx) => {
      const token = part.trim()
      if (!token) return null
      const eq = token.indexOf('=')
      const rawName = eq > 0 ? token.slice(0, eq).trim() : ''
      const rawUrl = (eq > 0 ? token.slice(eq + 1) : token).trim().replace(/\/+$/, '')
      if (!/^https?:\/\//i.test(rawUrl)) return null
      const host = new URL(rawUrl).host
      const id = sanitizeId(rawName || (idx === 0 ? 'default' : host), `engine-${idx + 1}`)
      return {
        id,
        name: rawName || host,
        url: rawUrl,
      }
    })
    .filter(Boolean)
}

async function loadEngineRegistry(env = {}) {
  let raw = env.ENGINES_JSON || env.ENGINE_URLS || ''
  if (!raw && env.CONFIG && typeof env.CONFIG.get === 'function') {
    try {
      raw = (await env.CONFIG.get('engines')) || ''
    } catch {
      raw = ''
    }
  }
  const parsed = parseEngineList(raw)
  if (parsed.length > 0) return parsed

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
    if (!found) {
      return { kind: 'unknown_engine', engineId: requestedId }
    }
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
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  }

  const route = resolveRoute(subpath, engines, authOrigin)
  if (!route) {
    return new Response('Not found', { status: 404 })
  }
  if (route.kind === 'unknown_engine') {
    return new Response(
      JSON.stringify({
        error: `Unknown engine "${route.engineId}"`,
        code: 'UNKNOWN_ENGINE',
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )
  }

  const target = new URL(route.forwardPath + url.search, route.upstreamBase)
  const isEngine = route.kind === 'engine'

  // Copy the headers that carry identity and content negotiation; drop the ones
  // that describe this hop rather than the request.
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
    // This origin's cookies belong to this host. Forwarding them to an engine
    // sends a CF_AppSession issued for the wrong hostname, which Access reads as
    // a stale session and answers with a 302. Engines authorise by bearer token.
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
