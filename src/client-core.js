// Pure, framework-agnostic helpers shared by the browser client (src/api.ts)
// and the Node test suite. Nothing here references browser globals directly:
// `fetch` is injected into the network helpers, and there is no import.meta.env
// / sessionStorage access, so `node --test` can import this module directly.

/** @typedef {{ token: string, expiresAt: number, refreshToken?: string, refreshExpiresAt?: number, user: string, scope: string }} StoredSession */
/** @typedef {{ authenticated: boolean, username: string | null, expiresAt: string | null }} ClientSession */
/** @typedef {'access' | 'bearer'} EngineAuthMode */
/** @typedef {'proxy' | 'config' | 'custom'} EngineSource */
/** @typedef {{ id: string, name: string, url: string, host?: string, subtitle?: string, tag?: string, accent?: string, authMode: EngineAuthMode, source: EngineSource }} ClientEngineNode */

/**
 * Where the SPA reaches the default engine and shared auth Worker proxy.
 *
 * `/engine` is served by the Pages Function in `functions/engine/[[path]].js`,
 * which forwards `/engine/auth/*` to the shared auth Worker, `/engine/by/<id>/*`
 * to a named engine, and `/engine/*` to the default engine on the same origin.
 */
export const DEFAULT_ENGINE_URL = '/engine'

export const DEFAULT_ENGINE_ID = 'default'

/**
 * Normalize a configured engine base URL.
 * @param {unknown} value
 * @returns {string}
 */
export function resolveEngineUrl(value) {
  const base = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_ENGINE_URL
  return base.replace(/\/+$/, '')
}

/**
 * Build the same-origin proxy base path for a named engine ID.
 * @param {string} id
 * @param {string} [proxyRoot]
 * @returns {string}
 */
export function engineProxyBaseUrl(id, proxyRoot = DEFAULT_ENGINE_URL) {
  const root = resolveEngineUrl(proxyRoot)
  const cleanId = typeof id === 'string' && id.trim() ? id.trim() : DEFAULT_ENGINE_ID
  if (cleanId === DEFAULT_ENGINE_ID) return root
  return `${root}/by/${encodeURIComponent(cleanId)}`
}

/**
 * Convert an arbitrary label or hostname into a stable lowercase engine ID.
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function slugifyEngineId(value, fallback = DEFAULT_ENGINE_ID) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || fallback
}

/** @returns {string} */
function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

/**
 * Normalize one engine descriptor from `/engine/engines`, `apps.config.json`, or
 * user-saved custom engines.
 * @param {unknown} raw
 * @param {{ index?: number, source?: EngineSource, proxyRoot?: string }} [opts]
 * @returns {ClientEngineNode}
 */
export function normalizeEngineNode(raw, opts = {}) {
  const item = (raw && typeof raw === 'object') ? raw : {}
  const index = typeof opts.index === 'number' ? opts.index : 0
  const source = opts.source === 'custom' || opts.source === 'config' ? opts.source : 'proxy'
  const proxyRoot = opts.proxyRoot || DEFAULT_ENGINE_URL

  const fallbackId = index === 0 ? DEFAULT_ENGINE_ID : `engine-${index + 1}`
  const id = slugifyEngineId(item.id || item.name || item.host, fallbackId)
  const rawUrl = str(item.url).trim()
  const url = rawUrl ? resolveEngineUrl(rawUrl) : engineProxyBaseUrl(id, proxyRoot)
  const host = str(item.host).trim() || undefined
  const name = str(item.name).trim() || host || (id === DEFAULT_ENGINE_ID ? 'Primary Engine' : id)
  const authMode = item.authMode === 'bearer' ? 'bearer' : 'access'

  return {
    id,
    name,
    url,
    host,
    subtitle: typeof item.subtitle === 'string' && item.subtitle.trim() ? item.subtitle.trim() : undefined,
    tag: typeof item.tag === 'string' && item.tag.trim() ? item.tag.trim() : undefined,
    accent: typeof item.accent === 'string' && item.accent.trim() ? item.accent.trim() : undefined,
    authMode,
    source: item.source === 'custom' || item.source === 'config' || item.source === 'proxy' ? item.source : source,
  }
}

/**
 * Merge multiple lists of engine descriptors (proxy discovery, static config,
 * custom browser-added engines) without duplicate IDs. Later lists with the
 * same `id` override earlier entries so custom edits take precedence.
 * Always guarantees at least one default engine entry.
 *
 * @param {Array<{ items?: unknown[], source?: EngineSource }>} groups
 * @param {string} [defaultBaseUrl]
 * @returns {ClientEngineNode[]}
 */
export function mergeEngineCatalog(groups, defaultBaseUrl = DEFAULT_ENGINE_URL) {
  /** @type {Map<string, ClientEngineNode>} */
  const byId = new Map()

  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!group || !Array.isArray(group.items)) continue
      const source = group.source || 'proxy'
      group.items.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') return
        const node = normalizeEngineNode(raw, { index, source, proxyRoot: defaultBaseUrl })
        byId.set(node.id, node)
      })
    }
  }

  if (byId.size === 0) {
    const fallback = normalizeEngineNode(
      { id: DEFAULT_ENGINE_ID, name: 'Primary Engine', url: resolveEngineUrl(defaultBaseUrl) },
      { index: 0, source: 'proxy', proxyRoot: defaultBaseUrl },
    )
    return [fallback]
  }

  return Array.from(byId.values())
}

/**
 * Pick the active engine from a catalog by ID, falling back to the first entry.
 * @param {ClientEngineNode[]} engines
 * @param {unknown} activeId
 * @returns {ClientEngineNode}
 */
export function selectActiveEngine(engines, activeId) {
  const list = Array.isArray(engines) && engines.length > 0 ? engines : mergeEngineCatalog([])
  const wanted = typeof activeId === 'string' ? activeId.trim() : ''
  return list.find((entry) => entry.id === wanted) || list[0]
}

/**
 * True when a unix-seconds expiry is at/before now, or is not a finite number.
 * @param {unknown} expiresAtSeconds
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isExpired(expiresAtSeconds, nowMs = Date.now()) {
  if (typeof expiresAtSeconds !== 'number' || !Number.isFinite(expiresAtSeconds)) return true
  return expiresAtSeconds * 1000 <= nowMs
}

/**
 * Map the historical client-facing /api/* paths to the engine's direct paths.
 * @param {string} legacyPath
 * @returns {string}
 */
export function enginePath(legacyPath) {
  if (legacyPath === '/api/health' || legacyPath === '/api/engine/status') return '/healthz'
  if (legacyPath.startsWith('/api/engine/')) return legacyPath.slice('/api/engine'.length)
  if (legacyPath === '/api/engine') return '/'
  return legacyPath
}

// ---------------------------------------------------------------- devices
export const DEVICE_PATHS = {
  list: '/api/devices',
  tools: (id) => `/api/devices/${encodeURIComponent(id)}/tools`,
  action: (id) => `/api/devices/${encodeURIComponent(id)}/action`,
}

/**
 * One engine call. Returns a discriminated result instead of throwing so it
 * stays easy to unit-test with a mock fetch.
 *
 * @param {(url: string, init: object) => Promise<{ ok: boolean, status: number, text: () => Promise<string> }>} fetchFn
 * @param {string} baseUrl
 * @param {string} path
 * @param {{ method?: string, body?: unknown, headers?: Record<string, string> }} [options]
 * @returns {Promise<{ ok: boolean, status: number, data: unknown, error?: string, code?: string }>}
 */
export async function engineCall(fetchFn, baseUrl, path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetchFn(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    })
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK_ERROR',
      error: 'Unable to connect to the engine.',
      data: null,
    }
  }
  const text = typeof res.text === 'function' ? await res.text() : ''
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = null }
  }
  if (!res.ok) {
    const raw = (data && typeof data === 'object') ? data : {}
    return {
      ok: false,
      status: res.status,
      code: raw.code || 'HTTP_ERROR',
      error: raw.error || `HTTP ${res.status}`,
      data,
    }
  }
  return { ok: true, status: res.status, data }
}

/** Normalize one engine device record into the client's Device shape. */
export function normalizeDevice(raw) {
  const item = (raw && typeof raw === 'object') ? raw : {}
  const s = (item.status && typeof item.status === 'object') ? item.status : {}
  const latency = typeof s.latencyMs === 'number'
    ? s.latencyMs
    : (typeof s.latency_ms === 'number' ? s.latency_ms : null)
  return {
    id: str(item.id, str(item.name)),
    name: str(item.name, str(item.id)),
    host: str(item.host),
    subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
    tag: typeof item.tag === 'string' ? item.tag : undefined,
    accent: typeof item.accent === 'string' ? item.accent : undefined,
    status: {
      online: s.online === true,
      latencyMs: latency,
      checkedAt: str(s.checkedAt),
      reason: s.reason == null ? null : str(s.reason, String(s.reason)),
      version: typeof s.version === 'string' ? s.version : null,
    },
  }
}

/**
 * Normalize GET /api/devices.
 * @param {unknown} data
 */
export function normalizeDevices(data) {
  const root = (data && typeof data === 'object') ? data : {}
  const devices = Array.isArray(root.devices) ? root.devices : []
  const items = Array.isArray(root.items) ? root.items : []
  const list = devices.length >= items.length ? devices : items
  return {
    items: list.map(normalizeDevice),
    checkedAt: str(root.checkedAt, new Date().toISOString()),
    ephemeral: root.ephemeral !== false,
    note: typeof root.note === 'string' && root.note ? root.note : null,
  }
}

/** Normalize GET /api/devices/{id}/tools into `{ tools }`. @param {unknown} data */
export function normalizeDeviceTools(data) {
  const root = (data && typeof data === 'object') ? data : {}
  const raw = Array.isArray(root.tools) ? root.tools : []
  const tools = raw
    .map((t) => ({
      name: str(t && t.name),
      description: (t && typeof t.description === 'string') ? t.description : undefined,
      inputSchema: (t && t.inputSchema && typeof t.inputSchema === 'object') ? t.inputSchema : undefined,
    }))
    .filter((t) => t.name.length > 0)
  return { tools }
}

/**
 * Normalize POST /api/devices/{id}/action into a DeviceActionResult.
 * @param {unknown} data
 * @param {string} id
 * @param {string} tool
 */
export function normalizeDeviceAction(data, id, tool) {
  const root = (data && typeof data === 'object') ? data : {}
  let screenshot = null
  if (root.screenshot && typeof root.screenshot === 'object' && typeof root.screenshot.data === 'string') {
    screenshot = {
      mimeType: str(root.screenshot.mimeType, 'image/png'),
      data: root.screenshot.data,
    }
  }
  return {
    ok: root.ok !== false,
    device: str(root.device, id),
    tool: str(root.tool, tool),
    text: str(root.text),
    screenshot,
    at: str(root.at, new Date().toISOString()),
  }
}
