/**
 * The two things the console asks of its own origin: who is signed in, and which
 * engines exist.
 *
 * Everything else the console needs — shells, displays, health — is asked of the
 * engine itself at the address this function hands out. That is a deliberate move,
 * not a shortcut: a Pages Function cannot carry a socket. It re-creates the request
 * (`method` + headers + body) and calls `fetch`, so the `Upgrade` is gone and the
 * engine never sees a WebSocket. A terminal and a screen are both sockets, so a
 * proxy path on this origin could never serve them.
 *
 * The engine's own hostname is not open to the world: every origin sits behind a
 * Cloudflare Access application that admits only the gateway Worker's service token.
 * The browser reaches it through the gateway with the bearer this origin issues.
 */

const DEFAULT_AUTH = 'https://aixodia-auth.aixodia.workers.dev'
const DEFAULT_ENGINE_ENTRY = {
  id: 'default',
  name: 'Primary Engine',
  url: 'https://engine.aixodia.dpdns.org',
}

const DEFAULT_REGISTRY_URL = 'https://engine.aixodia.dpdns.org/api/engines'

function sanitizeId(raw, fallback) {
  const clean = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || fallback
}

/**
 * Which engines exist, asked of the engine gateway (`GET /api/engines`, read from
 * the `engines` table in D1). A registry that cannot answer is not a reason to stop
 * working: the default engine still answers on its own hostname.
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

export async function onRequest({ request, env = {} }) {
  const url = new URL(request.url)
  const subpath = url.pathname.replace(/^\/engine/, '') || '/'

  if (request.method === 'GET' && subpath === '/engines') {
    const engines = await loadEngineRegistry(env)
    // The engine's own address, not a path on this origin: the client that reads
    // this is going to open a socket, and only the engine can answer one.
    const publicList = engines.map((entry, index) => ({
      id: entry.id,
      name: entry.name,
      host: new URL(entry.url).host,
      url: entry.url,
      subtitle: entry.subtitle ?? null,
      tag: entry.tag ?? null,
      default: index === 0,
    }))
    return new Response(JSON.stringify({ engines: publicList }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }

  // Sign-in belongs to the auth Worker, on its own origin: it mints the bearer the
  // gateway accepts, and it does so whether or not any engine is up.
  if (subpath.startsWith('/auth/')) {
    const authOrigin = String(env.AUTH_URL || DEFAULT_AUTH).trim().replace(/\/+$/, '')
    const target = new URL(authOrigin + subpath + url.search)

    const headers = new Headers()
    for (const name of ['accept', 'accept-language', 'authorization', 'content-type', 'cookie', 'origin', 'referer', 'user-agent', 'cf-access-jwt-assertion']) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('host', new URL(authOrigin).host)

    const init = { method: request.method, headers, redirect: 'manual' }
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer()

    let upstream
    try {
      upstream = await fetch(target.toString(), init)
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'upstream_unreachable', code: 'AUTH_DOWN', detail: String(err?.message || err) }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      )
    }

    const responseHeaders = new Headers()
    for (const name of ['content-type', 'cache-control', 'location', 'set-cookie', 'www-authenticate']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  }

  return new Response('Not found', { status: 404 })
}
