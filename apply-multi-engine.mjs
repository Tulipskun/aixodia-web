#!/usr/bin/env node
/**
 * AIxodia Web — Multi-Engine Installer & Patcher
 *
 * Run from the root of `aixodia-web`:
 *   node apply-multi-engine.mjs
 *
 * Idempotent: safe to run multiple times. Updates proxy, auth worker sync,
 * client-core, types, API store, EngineSwitcher UI, CSS, apps.config.json,
 * App.tsx topbar wiring, and unit tests, then runs `npm test` & `npm run build`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()

function ensureCheck() {
  const pkgPath = path.join(ROOT, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    console.error('Error: package.json not found. Run this script inside the aixodia-web directory.')
    process.exit(1)
  }
}

function writeFileRel(relPath, content) {
  const full = path.join(ROOT, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
  console.log(`  [updated] ${relPath}`)
}

// ---------------------------------------------------------------- 1. Pages Function Proxy
const PAGES_PROXY_JS = `/**
 * Proxy \`/engine/*\` to the service that owns the path, on the console's origin.
 *
 * Multi-engine routing:
 * * \`/engine/auth/*\` belongs to the shared auth Worker (\`AUTH\`). Sign-in works
 *   independently of whether any individual engine is up or down.
 * * \`/engine/engines\` returns the public registry of configured engines so the
 *   SPA can discover and switch between multiple engines without a rebuild.
 * * \`/engine/by/<engineId>/*\` forwards to that specific registered engine.
 * * \`/engine/api/*\`, \`/engine/healthz\`, \`/engine/cdn-cgi/*\` forward to the
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
          const rawUrl = String(item.url || '').trim().replace(/\\/+$/, '')
          if (!/^https?:\\/\\//i.test(rawUrl)) return null
          const host = new URL(rawUrl).host
          const id = sanitizeId(item.id || item.name || host, \`engine-\${idx + 1}\`)
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

  return trimmed
    .split(',')
    .map((part, idx) => {
      const token = part.trim()
      if (!token) return null
      const eq = token.indexOf('=')
      const rawName = eq > 0 ? token.slice(0, eq).trim() : ''
      const rawUrl = (eq > 0 ? token.slice(eq + 1) : token).trim().replace(/\\/+$/, '')
      if (!/^https?:\\/\\//i.test(rawUrl)) return null
      const host = new URL(rawUrl).host
      const id = sanitizeId(rawName || (idx === 0 ? 'default' : host), \`engine-\${idx + 1}\`)
      return { id, name: rawName || host, url: rawUrl }
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

  const singleUrl = String(env.ENGINE_URL || DEFAULT_ENGINE_ENTRY.url).trim().replace(/\\/+$/, '')
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
  const subpath = url.pathname.replace(/^\\/engine/, '') || '/'
  const authOrigin = String(env.AUTH_URL || DEFAULT_AUTH).trim().replace(/\\/+$/, '')
  const engines = await loadEngineRegistry(env)

  if (request.method === 'GET' && subpath === '/engines') {
    const publicList = engines.map((entry, index) => ({
      id: entry.id,
      name: entry.name,
      host: new URL(entry.url).host,
      url: index === 0 && entry.id === 'default' ? '/engine' : \`/engine/by/\${encodeURIComponent(entry.id)}\`,
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
      JSON.stringify({ error: \`Unknown engine "\${route.engineId}"\`, code: 'UNKNOWN_ENGINE' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )
  }

  const target = new URL(route.forwardPath + url.search, route.upstreamBase)
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
`

// ---------------------------------------------------------------- 2. Client Core & Types
const CLIENT_CORE_JS = `// Pure, framework-agnostic helpers shared by the browser client (src/api.ts)
// and the Node test suite.

/** @typedef {{ token: string, expiresAt: number, refreshToken?: string, refreshExpiresAt?: number, user: string, scope: string }} StoredSession */
/** @typedef {{ authenticated: boolean, username: string | null, expiresAt: string | null }} ClientSession */
/** @typedef {'access' | 'bearer'} EngineAuthMode */
/** @typedef {'proxy' | 'config' | 'custom'} EngineSource */
/** @typedef {{ id: string, name: string, url: string, host?: string, subtitle?: string, tag?: string, accent?: string, authMode: EngineAuthMode, source: EngineSource }} ClientEngineNode */

export const DEFAULT_ENGINE_URL = '/engine'
export const DEFAULT_ENGINE_ID = 'default'

export function resolveEngineUrl(value) {
  const base = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_ENGINE_URL
  return base.replace(/\\/+$/, '')
}

export function engineProxyBaseUrl(id, proxyRoot = DEFAULT_ENGINE_URL) {
  const root = resolveEngineUrl(proxyRoot)
  const cleanId = typeof id === 'string' && id.trim() ? id.trim() : DEFAULT_ENGINE_ID
  if (cleanId === DEFAULT_ENGINE_ID) return root
  return \`\${root}/by/\${encodeURIComponent(cleanId)}\`
}

export function slugifyEngineId(value, fallback = DEFAULT_ENGINE_ID) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\\/\\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || fallback
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function normalizeEngineNode(raw, opts = {}) {
  const item = (raw && typeof raw === 'object') ? raw : {}
  const index = typeof opts.index === 'number' ? opts.index : 0
  const source = opts.source === 'custom' || opts.source === 'config' ? opts.source : 'proxy'
  const proxyRoot = opts.proxyRoot || DEFAULT_ENGINE_URL

  const fallbackId = index === 0 ? DEFAULT_ENGINE_ID : \`engine-\${index + 1}\`
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

export function mergeEngineCatalog(groups, defaultBaseUrl = DEFAULT_ENGINE_URL) {
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
    return [
      normalizeEngineNode(
        { id: DEFAULT_ENGINE_ID, name: 'Primary Engine', url: resolveEngineUrl(defaultBaseUrl) },
        { index: 0, source: 'proxy', proxyRoot: defaultBaseUrl },
      ),
    ]
  }
  return Array.from(byId.values())
}

export function selectActiveEngine(engines, activeId) {
  const list = Array.isArray(engines) && engines.length > 0 ? engines : mergeEngineCatalog([])
  const wanted = typeof activeId === 'string' ? activeId.trim() : ''
  return list.find((entry) => entry.id === wanted) || list[0]
}

export function isExpired(expiresAtSeconds, nowMs = Date.now()) {
  if (typeof expiresAtSeconds !== 'number' || !Number.isFinite(expiresAtSeconds)) return true
  return expiresAtSeconds * 1000 <= nowMs
}

export function enginePath(legacyPath) {
  if (legacyPath === '/api/health' || legacyPath === '/api/engine/status') return '/healthz'
  if (legacyPath.startsWith('/api/engine/')) return legacyPath.slice('/api/engine'.length)
  if (legacyPath === '/api/engine') return '/'
  return legacyPath
}

export const DEVICE_PATHS = {
  list: '/api/devices',
  tools: (id) => \`/api/devices/\${encodeURIComponent(id)}/tools\`,
  action: (id) => \`/api/devices/\${encodeURIComponent(id)}/action\`,
}

export async function engineCall(fetchFn, baseUrl, path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetchFn(\`\${baseUrl}\${path}\`, {
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
      error: raw.error || \`HTTP \${res.status}\`,
      data,
    }
  }
  return { ok: true, status: res.status, data }
}

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
`

const CLIENT_CORE_DTS = `export type EngineAuthMode = 'access' | 'bearer'
export type EngineSource = 'proxy' | 'config' | 'custom'

export interface ClientEngineNode {
  id: string
  name: string
  url: string
  host?: string
  subtitle?: string
  tag?: string
  accent?: string
  authMode: EngineAuthMode
  source: EngineSource
}

export const DEFAULT_ENGINE_URL: string
export const DEFAULT_ENGINE_ID: string

export function resolveEngineUrl(value: unknown): string
export function engineProxyBaseUrl(id: string, proxyRoot?: string): string
export function slugifyEngineId(value: unknown, fallback?: string): string
export function normalizeEngineNode(
  raw: unknown,
  opts?: { index?: number; source?: EngineSource; proxyRoot?: string },
): ClientEngineNode
export function mergeEngineCatalog(
  groups: Array<{ items?: unknown[]; source?: EngineSource }>,
  defaultBaseUrl?: string,
): ClientEngineNode[]
export function selectActiveEngine(engines: ClientEngineNode[], activeId: unknown): ClientEngineNode

export function isExpired(expiresAtSeconds: unknown, nowMs?: number): boolean
export function enginePath(legacyPath: string): string

export const DEVICE_PATHS: {
  list: string
  tools: (id: string) => string
  action: (id: string) => string
}

export interface EngineCallResult {
  ok: boolean
  status: number
  data: unknown
  error?: string
  code?: string
}

export function engineCall(
  fetchFn: typeof fetch,
  baseUrl: string,
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<EngineCallResult>

export interface ClientDevice {
  id: string
  name: string
  host: string
  subtitle?: string
  tag?: string
  accent?: string
  status: {
    online: boolean
    latencyMs: number | null
    checkedAt: string
    reason: string | null
    version: string | null
  }
}

export interface DevicesResult {
  items: ClientDevice[]
  checkedAt: string
  ephemeral: boolean
  note: string | null
}

export function normalizeDevice(raw: unknown): ClientDevice
export function normalizeDevices(data: unknown): DevicesResult
export function normalizeDeviceTools(data: unknown): {
  tools: { name: string; description?: string; inputSchema?: Record<string, unknown> }[]
}
export function normalizeDeviceAction(
  data: unknown,
  id: string,
  tool: string,
): {
  ok: boolean
  device: string
  tool: string
  text: string
  screenshot: { mimeType: string; data: string } | null
  at: string
}
`

// ---------------------------------------------------------------- 3. Stylesheet Additions
const MULTI_ENGINE_CSS = `
/* ---------------------------------------------------------------- multi-engine switcher */
.hello-world-topbar .engine-switcher { margin-left: auto; }
.engine-switcher { position: relative; display: inline-flex; align-items: center; }
.engine-switcher-trigger {
  display: inline-flex; align-items: center; gap: 8px; min-height: 36px;
  padding: 6px 11px; border: 1px solid var(--border-strong); border-radius: 9px;
  background: var(--surface-2); color: var(--text); font-size: 12px; font-weight: 600;
}
.engine-switcher-trigger:hover { border-color: var(--accent); background: var(--surface-3); }
.engine-switcher-label { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.engine-switcher-badge {
  padding: 1px 6px; border-radius: 999px; background: var(--surface);
  border: 1px solid var(--border); color: var(--muted); font: 10px var(--mono);
}
.engine-switcher-popover {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 50;
  width: min(320px, calc(100vw - 28px)); padding: 10px;
  border: 1px solid var(--border-strong); border-radius: 12px;
  background: var(--surface-2); box-shadow: var(--shadow);
  display: flex; flex-direction: column; gap: 8px;
}
.engine-switcher-head {
  display: flex; align-items: center; justify-content: space-between;
  font: 10px var(--mono); letter-spacing: 0.1em; color: var(--dim);
}
.engine-switcher-list { display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
.engine-switcher-row { display: flex; align-items: center; gap: 4px; }
.engine-switcher-item {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px;
  padding: 8px 9px; border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: var(--muted); text-align: left;
}
.engine-switcher-item:hover, .engine-switcher-row.is-selected .engine-switcher-item {
  background: var(--surface-3); border-color: var(--border-strong); color: var(--text);
}
.engine-switcher-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.engine-switcher-copy strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.engine-switcher-copy small { font: 10px var(--mono); color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.engine-switcher-add { width: 100%; }
.engine-fleet-card { gap: 14px; }
.engine-fleet-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.engine-fleet-item {
  display: flex; flex-direction: column; gap: 12px; padding: 14px;
  border: 1px solid var(--border); border-radius: 12px; background: rgba(8, 8, 39, 0.65);
}
.engine-fleet-item.is-active { border-color: var(--accent); }
.engine-fleet-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.engine-fleet-top strong { display: block; font-size: 13px; }
.engine-fleet-top small { font: 10.5px var(--mono); color: var(--dim); }
.engine-modal-dialog { width: min(440px, 100%); }
.engine-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.engine-form-fields { display: flex; flex-direction: column; gap: 11px; margin-bottom: 18px; }
.engine-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
.engine-field input, .engine-field select {
  height: 38px; padding: 0 10px; border: 1px solid var(--border-strong);
  border-radius: 8px; background: var(--surface); color: var(--text); outline: none;
}
.engine-field input:focus, .engine-field select:focus { border-color: var(--accent); }
`

// ---------------------------------------------------------------- 4. Auth Worker Multi-Engine Sync Patch
function patchAuthWorkerDeviceJs() {
  const rel = 'workers/auth/src/device.js'
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return

  const src = fs.readFileSync(full, 'utf8')
  if (src.includes('resolveEngineTargets')) {
    console.log(`  [skipped] ${rel} (already patched)`)
    return
  }

  const oldFn = `async function pushSync(env, body) {
  const target = env.ENGINE_URL
  if (!target) return
  const secret = await syncSecret(env)
  if (!secret) throw new Error('required Workers KV key auth/sync_secret is missing')
  try {
    const res = await fetch(\`\${target.replace(/\\/$/, '')}/auth/sessions/sync\`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-sync': secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok && body.activate) {
      await env.DB.prepare(
        \`UPDATE auth_tokens SET sync_state = 'synced' WHERE token_hash IN (\${body.activate.map(() => '?').join(',')})\`,
      ).bind(...body.activate).run()
    }
  } catch {
    // Staying \`pending\` is the contract: the engine's re-sync will collect it.
  }
}`

  const newFn = `export async function resolveEngineTargets(env) {
  const urls = new Set()
  const addRaw = (raw) => {
    if (!raw) return
    const trimmed = String(raw).trim()
    if (!trimmed) return
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const u = typeof item === 'string' ? item : item?.url
            if (typeof u === 'string' && /^https?:\\/\\//i.test(u.trim())) {
              urls.add(u.trim().replace(/\\/+$/, ''))
            }
          }
        }
      } catch { /* ignore malformed JSON */ }
      return
    }
    for (const part of trimmed.split(',')) {
      const token = part.trim()
      if (!token) continue
      const eq = token.indexOf('=')
      const candidate = (eq > 0 ? token.slice(eq + 1) : token).trim().replace(/\\/+$/, '')
      if (/^https?:\\/\\//i.test(candidate)) urls.add(candidate)
    }
  }

  addRaw(env.ENGINE_URLS)
  addRaw(env.ENGINES_JSON)
  if (env.CONFIG && typeof env.CONFIG.get === 'function') {
    try { addRaw(await env.CONFIG.get('engines')) } catch { /* ignore KV error */ }
  }
  addRaw(env.ENGINE_URL)
  return Array.from(urls)
}

async function pushSync(env, body) {
  const targets = await resolveEngineTargets(env)
  if (targets.length === 0) return
  const secret = await syncSecret(env)
  if (!secret) throw new Error('required Workers KV key auth/sync_secret is missing')

  const outcomes = await Promise.allSettled(
    targets.map((target) =>
      fetch(\`\${target}/auth/sessions/sync\`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-auth-sync': secret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      }),
    ),
  )

  const allSynced = outcomes.every((r) => r.status === 'fulfilled' && r.value.ok)
  if (allSynced && body.activate) {
    await env.DB.prepare(
      \`UPDATE auth_tokens SET sync_state = 'synced' WHERE token_hash IN (\${body.activate.map(() => '?').join(',')})\`,
    ).bind(...body.activate).run()
  }
}`

  if (src.includes(oldFn)) {
    fs.writeFileSync(full, src.replace(oldFn, newFn), 'utf8')
    console.log(`  [updated] ${rel}`)
  } else {
    console.log(`  [note] ${rel}: custom pushSync shape detected, left untouched`)
  }
}

// ---------------------------------------------------------------- 5. Patch apps.config.json, styles.css, App.tsx & Tests
function patchAppsConfig() {
  const rel = 'apps.config.json'
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return

  const parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
  if (!Array.isArray(parsed.engines)) {
    parsed.engines = [
      {
        id: 'default',
        name: 'Primary Engine',
        url: '/engine',
        host: 'engine.aixodia.dpdns.org',
        subtitle: 'Cloudflare Named Tunnel',
        tag: 'PRIMARY',
      },
    ]
    fs.writeFileSync(full, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
    console.log(`  [updated] ${rel}`)
  } else {
    console.log(`  [skipped] ${rel} (engines already present)`)
  }
}

function patchStylesCss() {
  const rel = 'src/styles.css'
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return

  const css = fs.readFileSync(full, 'utf8')
  if (css.includes('multi-engine switcher')) {
    console.log(`  [skipped] ${rel} (styles already present)`)
    return
  }
  fs.writeFileSync(full, css.trimEnd() + '\n' + MULTI_ENGINE_CSS, 'utf8')
  console.log(`  [updated] ${rel}`)
}

function patchAppTsx() {
  const rel = 'src/App.tsx'
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return

  const original = fs.readFileSync(full, 'utf8')
  if (original.includes('EngineSwitcher')) {
    console.log(`  [skipped] ${rel} (EngineSwitcher already wired)`)
    return
  }

  const accountMarker = '<div className="hello-world-account-menu"'
  if (!original.includes(accountMarker)) {
    console.log(`  [note] ${rel}: mount <EngineSwitcher /> manually inside your header`)
    return
  }

  let next = `import { EngineSwitcher } from './EngineSwitcher'\n` + original
  next = next.replace(
    accountMarker,
    `<EngineSwitcher />\n          ${accountMarker}`,
  )
  fs.writeFileSync(full, next, 'utf8')
  console.log(`  [updated] ${rel} (wired <EngineSwitcher /> into topbar)`)
}

function patchClientCoreTests() {
  const rel = 'test/client-core.test.js'
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) return

  let src = fs.readFileSync(full, 'utf8')
  if (src.includes('mergeEngineCatalog')) {
    console.log(`  [skipped] ${rel} (multi-engine tests already present)`)
    return
  }

  src = src.replace(
    '  resolveEngineUrl,',
    '  resolveEngineUrl,\n  engineProxyBaseUrl,\n  normalizeEngineNode,\n  mergeEngineCatalog,\n  selectActiveEngine,',
  )

  const extraTests = `
// ---------------------------------------------------------------- multi-engine catalog

test('engineProxyBaseUrl keeps /engine for default and scopes named engines under /engine/by/<id>', () => {
  assert.equal(engineProxyBaseUrl('default'), '/engine')
  assert.equal(engineProxyBaseUrl('beta'), '/engine/by/beta')
  assert.equal(engineProxyBaseUrl('node 2', 'https://console.example/engine/'), 'https://console.example/engine/by/node%202')
})

test('mergeEngineCatalog deduplicates by id, lets custom override, and guarantees a fallback', () => {
  const fallback = mergeEngineCatalog([])
  assert.equal(fallback.length, 1)
  assert.equal(fallback[0].id, 'default')
  assert.equal(fallback[0].url, '/engine')

  const merged = mergeEngineCatalog([
    {
      source: 'proxy',
      items: [
        { id: 'default', name: 'Alpha', host: 'engine.aixodia.dpdns.org' },
        { id: 'beta', name: 'Beta', host: 'beta.aixodia.dpdns.org' },
      ],
    },
    {
      source: 'custom',
      items: [
        { id: 'beta', name: 'Beta Custom', url: 'https://custom-beta.example.com/', authMode: 'bearer' },
      ],
    },
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].url, '/engine')
  assert.equal(merged[1].name, 'Beta Custom')
  assert.equal(merged[1].url, 'https://custom-beta.example.com')
  assert.equal(merged[1].authMode, 'bearer')
  assert.equal(selectActiveEngine(merged, 'beta').id, 'beta')
  assert.equal(selectActiveEngine(merged, 'missing').id, 'default')
})
`
  fs.writeFileSync(full, src.trimEnd() + '\n' + extraTests, 'utf8')
  console.log(`  [updated] ${rel}`)
}

function main() {
  console.log('Applying Multi-Engine updates to aixodia-web...')
  ensureCheck()

  writeFileRel('functions/engine/[[path]].js', PAGES_PROXY_JS)
  writeFileRel('src/client-core.js', CLIENT_CORE_JS)
  writeFileRel('src/client-core.d.ts', CLIENT_CORE_DTS)
  patchAuthWorkerDeviceJs()
  patchAppsConfig()
  patchStylesCss()
  patchAppTsx()
  patchClientCoreTests()

  console.log('\nRunning verification (npm test && npm run build)...')
  try {
    execFileSync('npm', ['test'], { stdio: 'inherit', cwd: ROOT })
    execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: ROOT })
    console.log('\nAll Multi-Engine updates verified cleanly!')
  } catch (err) {
    console.error('\nVerification command reported an issue:', err.message)
    process.exit(1)
  }
}

main()
