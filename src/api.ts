import type {
  ApiErrorBody,
  DeviceActionResult,
  DeviceToolsResponse,
  DevicesResponse,
  EngineAuthMode,
  EngineNode,
  EngineRun,
  EngineSession,
  EngineStatus,
  EngineTurn,
  EnginesDiscoveryResponse,
  Health,
  Session,
} from './types'
import {
  DEFAULT_ENGINE_ID,
  DEVICE_PATHS,
  engineCall,
  enginePath,
  mergeEngineCatalog,
  normalizeDeviceAction,
  normalizeDevices,
  normalizeDeviceTools,
  normalizeEngineNode,
  resolveEngineUrl,
  selectActiveEngine,
  slugifyEngineId,
} from './client-core.js'

// ---------------------------------------------------------------- config & multi-engine store
// Sign-in lives on the shared auth Worker reached through this origin's `/engine`
// proxy, independent of which individual AIxodia Engine is currently active.
const PROXY_ROOT = resolveEngineUrl(import.meta.env.VITE_ENGINE_URL)
const AUTH_URL = resolveEngineUrl(import.meta.env.VITE_AUTH_URL || PROXY_ROOT)

const ACTIVE_ENGINE_KEY = 'aixodia.active-engine.v1'
const CUSTOM_ENGINES_KEY = 'aixodia.custom-engines.v1'

// Path constants derived through enginePath() so legacy mappings stay unit-tested.
const P = {
  health: enginePath('/api/health'),                 // /healthz
  sessions: enginePath('/api/engine/api/sessions'),  // /api/sessions
  runs: enginePath('/api/engine/api/runs'),          // /api/runs
}

interface HealthzResponse {
  ok?: boolean
  starting?: boolean
  version?: string | null
  started?: number | null
  uptime_seconds?: number | null
  cpu_percent?: number | null
  memory_used_bytes?: number | null
  memory_total_bytes?: number | null
  memory_percent?: number | null
}

function loadSavedActiveId(): string {
  try {
    return (localStorage.getItem(ACTIVE_ENGINE_KEY) || '').trim() || DEFAULT_ENGINE_ID
  } catch {
    return DEFAULT_ENGINE_ID
  }
}

function saveActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_ENGINE_KEY, id)
  } catch {
    /* storage disabled */
  }
}

function loadCustomEngines(): EngineNode[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ENGINES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item, index) => normalizeEngineNode(item, { index, source: 'custom', proxyRoot: PROXY_ROOT }))
  } catch {
    return []
  }
}

function saveCustomEngines(list: EngineNode[]): void {
  try {
    const serializable = list.map(({ id, name, url, host, subtitle, tag, accent, authMode }) => ({
      id,
      name,
      url,
      host,
      subtitle,
      tag,
      accent,
      authMode,
      source: 'custom' as const,
    }))
    localStorage.setItem(CUSTOM_ENGINES_KEY, JSON.stringify(serializable))
  } catch {
    /* storage disabled */
  }
}

let proxyDiscoveredEngines: unknown[] = []
let staticConfigEngines: unknown[] = []
let customEngines: EngineNode[] = loadCustomEngines()
let catalogCache: EngineNode[] = mergeEngineCatalog(
  [{ items: customEngines, source: 'custom' }],
  PROXY_ROOT,
)
let activeEngineId: string = selectActiveEngine(catalogCache, loadSavedActiveId()).id

// Per-engine manual bearer tokens live strictly in memory (never written to storage).
const manualBearers = new Map<string, string>()

const engineListeners = new Set<() => void>()

function rebuildCatalog(): void {
  catalogCache = mergeEngineCatalog(
    [
      { items: proxyDiscoveredEngines, source: 'proxy' },
      { items: staticConfigEngines, source: 'config' },
      { items: customEngines, source: 'custom' },
    ],
    PROXY_ROOT,
  )
  const valid = selectActiveEngine(catalogCache, activeEngineId)
  if (valid.id !== activeEngineId) {
    activeEngineId = valid.id
    saveActiveId(activeEngineId)
  }
}

function notifyEngineListeners(): void {
  engineListeners.forEach((fn) => {
    try { fn() } catch { /* isolate listener errors */ }
  })
}

export function subscribeEngines(listener: () => void): () => void {
  engineListeners.add(listener)
  return () => { engineListeners.delete(listener) }
}

export function getEngines(): EngineNode[] {
  return catalogCache
}

export function getActiveEngineId(): string {
  return activeEngineId
}

export function getActiveEngine(): EngineNode {
  return selectActiveEngine(catalogCache, activeEngineId)
}

export function resolveTargetEngine(engineId?: string): EngineNode {
  if (engineId && engineId.trim()) {
    return selectActiveEngine(catalogCache, engineId)
  }
  return getActiveEngine()
}

export function setActiveEngineId(id: string): EngineNode {
  const chosen = selectActiveEngine(catalogCache, id)
  if (chosen.id !== activeEngineId) {
    activeEngineId = chosen.id
    saveActiveId(activeEngineId)
    notifyEngineListeners()
  }
  return chosen
}

export function setEngineBearerToken(engineId: string, token: string): void {
  const clean = token.trim()
  if (clean) {
    manualBearers.set(engineId, clean)
  } else {
    manualBearers.delete(engineId)
  }
  notifyEngineListeners()
}

export function hasEngineBearerToken(engineId: string): boolean {
  return Boolean(manualBearers.get(engineId))
}

export interface UpsertEngineInput {
  id?: string
  name: string
  url: string
  host?: string
  subtitle?: string
  tag?: string
  accent?: string
  authMode?: EngineAuthMode
  bearerToken?: string
}

export function upsertCustomEngine(input: UpsertEngineInput): EngineNode {
  const id = slugifyEngineId(input.id || input.name || input.host, `engine-${Date.now().toString(36)}`)
  const node = normalizeEngineNode(
    {
      id,
      name: input.name,
      url: input.url,
      host: input.host,
      subtitle: input.subtitle,
      tag: input.tag,
      accent: input.accent,
      authMode: input.authMode ?? 'access',
      source: 'custom',
    },
    { index: customEngines.length, source: 'custom', proxyRoot: PROXY_ROOT },
  )

  const existingIdx = customEngines.findIndex((item) => item.id === node.id)
  if (existingIdx >= 0) {
    customEngines = [
      ...customEngines.slice(0, existingIdx),
      node,
      ...customEngines.slice(existingIdx + 1),
    ]
  } else {
    customEngines = [...customEngines, node]
  }

  if (input.bearerToken !== undefined) {
    const clean = input.bearerToken.trim()
    if (clean) manualBearers.set(node.id, clean)
    else manualBearers.delete(node.id)
  }

  saveCustomEngines(customEngines)
  rebuildCatalog()
  activeEngineId = node.id
  saveActiveId(activeEngineId)
  notifyEngineListeners()
  return node
}

export function removeCustomEngine(id: string): void {
  customEngines = customEngines.filter((item) => item.id !== id)
  manualBearers.delete(id)
  saveCustomEngines(customEngines)
  rebuildCatalog()
  notifyEngineListeners()
}

/**
 * Discover operator-configured engines from `/engine/engines` (served by the Pages
 * Function) and merge with optional static `apps.config.json` engines + custom engines.
 */
export async function discoverEngines(configEngines?: unknown[]): Promise<EngineNode[]> {
  if (Array.isArray(configEngines)) {
    staticConfigEngines = configEngines
  }
  try {
    const res = await fetch(`${PROXY_ROOT}/engines`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as EnginesDiscoveryResponse | null
      if (body && Array.isArray(body.engines)) {
        proxyDiscoveredEngines = body.engines
      }
    }
  } catch {
    /* local dev without Pages Function: fall back to config + custom + default */
  }
  rebuildCatalog()
  notifyEngineListeners()
  return catalogCache
}

// ---------------------------------------------------------------- error
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly body: ApiErrorBody

  constructor(status: number, body: ApiErrorBody) {
    super(body.error || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code || 'HTTP_ERROR'
    this.body = body
  }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

// ---------------------------------------------------------------- session state
const PROFILE_KEY = 'aixodia.access-profile.v1'

interface AccessProfile {
  username: string
  expiresAt: number
}

function readProfile(): AccessProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AccessProfile
    if (!parsed || typeof parsed.username !== 'string' || typeof parsed.expiresAt !== 'number') return null
    if (parsed.expiresAt * 1000 <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function writeProfile(profile: AccessProfile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)) } catch { /* storage disabled */ }
}

function clearProfile(): void {
  try { localStorage.removeItem(PROFILE_KEY) } catch { /* storage disabled */ }
}

export function getSession(): Session {
  const profile = readProfile()
  if (!profile) return { authenticated: false, username: null, expiresAt: null }
  return {
    authenticated: true,
    username: profile.username,
    expiresAt: new Date(profile.expiresAt * 1000).toISOString(),
  }
}

/**
 * Shared auth-Worker bearer token, cached in memory only.
 * All Cloudflare Access-backed engines verify tokens against the same Auth Worker.
 */
let engineToken: string | null = null
let engineTokenExpiresAt = 0
let tokenRequest: Promise<string | null> | null = null

async function fetchEngineToken(): Promise<string | null> {
  try {
    const res = await fetch(`${AUTH_URL}/auth/token`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as { token?: string; expires_at?: number } | null
    const token = String(body?.token || '')
    if (!token) return null
    engineToken = token
    engineTokenExpiresAt = Number(body?.expires_at || 0) * 1000
    return token
  } catch {
    return null
  }
}

async function getSharedAccessToken(force = false): Promise<string | null> {
  const fresh = engineToken && engineTokenExpiresAt > Date.now() + 60_000
  if (fresh && !force) return engineToken
  if (!tokenRequest) {
    tokenRequest = fetchEngineToken().finally(() => { tokenRequest = null })
  }
  return tokenRequest
}

async function getBearerForEngine(engine: EngineNode, force = false): Promise<string | null> {
  if (engine.authMode === 'bearer') {
    return manualBearers.get(engine.id) ?? null
  }
  return getSharedAccessToken(force)
}

function forgetEngineToken(engine?: EngineNode): void {
  if (!engine || engine.authMode === 'access') {
    engineToken = null
    engineTokenExpiresAt = 0
  }
}

export async function refreshSession(): Promise<Session> {
  let res: Response
  try {
    res = await fetch(`${AUTH_URL}/auth/identity`, { credentials: 'include', cache: 'no-store' })
  } catch {
    return getSession()
  }
  if (res.status === 401 || res.status === 403) {
    clearProfile()
    return { authenticated: false, username: null, expiresAt: null }
  }
  if (!res.ok) return getSession()

  const body = (await res.json().catch(() => null)) as { email?: string } | null
  const username = String(body?.email || '').trim()
  if (!username) {
    clearProfile()
    return { authenticated: false, username: null, expiresAt: null }
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60
  writeProfile({ username, expiresAt })
  return {
    authenticated: true,
    username,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

/* Where the sign-in hop started, so the page it comes back to can tell "never tried"
   from "tried and Access did not hand us a session". Without this the second case
   looks exactly like the first, which is how a broken sign-in hides. */
const SIGNIN_HOP_KEY = 'aixodia.signin.hop.v1'
const SIGNIN_HOP_WINDOW_MS = 5 * 60 * 1000

export function signIn(): void {
  clearProfile()
  try { window.sessionStorage.setItem(SIGNIN_HOP_KEY, String(Date.now())) } catch { /* storage disabled */ }
  /* The hop through /engine/auth/start is what establishes the Access session; the
     `next` path is where it comes back to, so the console returns where it was. */
  const next = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/engine/auth/start?next=${encodeURIComponent(next)}`)
}

/** Clears the marker and says whether the browser has just come back from the hop. */
export function takeSignInReturn(now = Date.now()): boolean {
  let at = 0
  try {
    at = Number(window.sessionStorage.getItem(SIGNIN_HOP_KEY) || 0)
    window.sessionStorage.removeItem(SIGNIN_HOP_KEY)
  } catch {
    return false
  }
  return Number.isFinite(at) && at > 0 && now - at < SIGNIN_HOP_WINDOW_MS
}

export function logout(): void {
  clearProfile()
  forgetEngineToken()
  manualBearers.clear()
  const here = `${window.location.origin}${window.location.pathname}`
  window.location.assign(`/cdn-cgi/access/logout?redirect_url=${encodeURIComponent(here)}`)
}

// ---------------------------------------------------------------- transport
function buildHeaders(init: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const extra = init.headers
  if (extra instanceof Headers) {
    extra.forEach((value, key) => { headers[key] = value })
  } else if (Array.isArray(extra)) {
    extra.forEach(([key, value]) => { headers[key] = value })
  } else if (extra) {
    Object.assign(headers, extra)
  }
  return headers
}

function errorBody(data: unknown, status: number): ApiErrorBody {
  const raw = (data && typeof data === 'object' ? data : {}) as Partial<ApiErrorBody>
  return { error: raw.error || `HTTP ${status}`, code: raw.code || 'HTTP_ERROR', ...raw }
}

async function fetchResponse(engine: EngineNode, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = buildHeaders(init)
  if (!/^\/healthz(\?|$)/.test(path) && !path.startsWith('/api/auth/')) {
    const token = await getBearerForEngine(engine)
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`
  }
  try {
    return await fetch(`${engine.url}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
      headers,
    })
  } catch {
    throw new ApiError(0, { error: `Unable to connect to engine "${engine.name}".`, code: 'NETWORK_ERROR' })
  }
}

async function requestWithTokenRetry<T>(engine: EngineNode, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && engine.authMode === 'access') {
      forgetEngineToken(engine)
      await getBearerForEngine(engine, true)
      return await run()
    }
    throw error
  }
}

async function request<T>(path: string, init: RequestInit = {}, engineId?: string): Promise<T> {
  const engine = resolveTargetEngine(engineId)
  return requestWithTokenRetry(engine, async () => {
    const res = await fetchResponse(engine, path, init)
    const text = await res.text()
    let data: unknown = null
    if (text) { try { data = JSON.parse(text) } catch { data = null } }
    if (!res.ok) {
      if ((res.status === 401 || res.status === 403) && engine.authMode === 'access') onUnauthorized?.()
      throw new ApiError(res.status, errorBody(data, res.status))
    }
    return data as T
  })
}

async function requestText(path: string, engineId?: string): Promise<string> {
  const engine = resolveTargetEngine(engineId)
  return requestWithTokenRetry(engine, async () => {
    const res = await fetchResponse(engine, path)
    const text = await res.text()
    if (!res.ok) {
      let data: unknown = null
      try { data = JSON.parse(text) } catch { data = null }
      if ((res.status === 401 || res.status === 403) && engine.authMode === 'access') onUnauthorized?.()
      throw new ApiError(res.status, errorBody(data, res.status))
    }
    return text
  })
}

const post = <T,>(path: string, body: unknown, engineId?: string) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }, engineId)

// ---------------------------------------------------------------- health
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function fetchHealthz(engineId?: string): Promise<HealthzResponse> {
  return request<HealthzResponse>(P.health, {}, engineId)
}

export async function getHealth(engineId?: string): Promise<Health> {
  const data = await fetchHealthz(engineId)
  return { ok: data?.ok === true, authConfigured: true }
}

export async function getEngineStatus(engineId?: string): Promise<EngineStatus> {
  const data = await fetchHealthz(engineId)
  return {
    configured: true,
    online: data?.ok === true,
    checkedAt: new Date().toISOString(),
    reason: data?.starting ? 'starting' : null,
    version: data.version ?? null,
    startedAt: finite(data.started),
    uptimeSeconds: finite(data.uptime_seconds),
    metrics: {
      cpuPercent: finite(data.cpu_percent),
      memoryUsedBytes: finite(data.memory_used_bytes),
      memoryTotalBytes: finite(data.memory_total_bytes),
      memoryPercent: finite(data.memory_percent),
    },
  }
}

export async function getAllEngineStatuses(): Promise<Record<string, EngineStatus>> {
  const engines = getEngines()
  const entries = await Promise.all(
    engines.map(async (eng): Promise<[string, EngineStatus]> => {
      try {
        const status = await getEngineStatus(eng.id)
        return [eng.id, status]
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unreachable'
        return [
          eng.id,
          {
            configured: true,
            online: false,
            checkedAt: new Date().toISOString(),
            reason: message,
            version: null,
            startedAt: null,
            uptimeSeconds: null,
            metrics: null,
          },
        ]
      }
    }),
  )
  return Object.fromEntries(entries)
}

// ---------------------------------------------------------------- engine sessions & runs
export const getEngineSessions = (engineId?: string) =>
  request<{ sessions: EngineSession[] }>(P.sessions, {}, engineId)

export const createEngineSession = (title = 'New chat', engineId?: string) =>
  post<EngineSession>(P.sessions, { title }, engineId)

export const getEngineTurns = (id: string, engineId?: string) =>
  request<{ turns: EngineTurn[] }>(`${P.sessions}/${encodeURIComponent(id)}/turns?limit=100`, {}, engineId)

export const deleteEngineSession = (id: string, engineId?: string) =>
  request<{ deleted: boolean }>(`${P.sessions}/${encodeURIComponent(id)}`, { method: 'DELETE' }, engineId)

export const startEngineRun = (sessionId: string, message: string, engineId?: string) =>
  post<{ run: EngineRun }>(P.runs, { session_id: sessionId, message }, engineId)

export const getEngineEvents = (runId: string, after: number, engineId?: string) =>
  requestText(`${P.runs}/${encodeURIComponent(runId)}/events?after=${after}&poll=1`, engineId)

export const cancelEngineRun = (runId: string, engineId?: string) =>
  post<{ run: EngineRun }>(`${P.runs}/${encodeURIComponent(runId)}/cancel`, {}, engineId)

// ---------------------------------------------------------------- devices
async function deviceCall<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  engineId?: string,
): Promise<T> {
  const engine = resolveTargetEngine(engineId)
  return requestWithTokenRetry(engine, async () => {
    const token = await getBearerForEngine(engine)
    const result = await engineCall(fetch, engine.url, path, {
      method: init.method,
      body: init.body,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!result.ok) {
      if ((result.status === 401 || result.status === 403) && engine.authMode === 'access') onUnauthorized?.()
      throw new ApiError(result.status, {
        error: result.error ?? `HTTP ${result.status}`,
        code: result.code ?? 'HTTP_ERROR',
      })
    }
    return result.data as T
  })
}

export async function getDevices(_refresh = false, engineId?: string): Promise<DevicesResponse> {
  const data = await deviceCall<unknown>(DEVICE_PATHS.list, {}, engineId)
  return normalizeDevices(data)
}

export async function getDeviceTools(id: string, engineId?: string): Promise<DeviceToolsResponse> {
  const data = await deviceCall<unknown>(DEVICE_PATHS.tools(id), {}, engineId)
  return normalizeDeviceTools(data)
}

export async function callDeviceTool(
  id: string,
  tool: string,
  args: Record<string, unknown> = {},
  engineId?: string,
): Promise<DeviceActionResult> {
  const data = await deviceCall<unknown>(
    DEVICE_PATHS.action(id),
    { method: 'POST', body: { tool, arguments: args } },
    engineId,
  )
  return normalizeDeviceAction(data, id, tool)
}

// ---------------------------------------------------------------- terminals
/* A terminal socket cannot carry a header, so the bearer is spent on a
   single-use ticket first and the dial carries the ticket in its query. */
export interface TerminalTicket {
  ticket: string
  expiresAt: number
}

export async function createTerminalTicket(engineId?: string): Promise<TerminalTicket> {
  const data = await post<{ ticket?: string; expires_at?: number }>('/api/terminals/ticket', {}, engineId)
  if (!data?.ticket) throw new ApiError(502, { error: 'The engine did not issue a terminal ticket.', code: 'NO_TICKET' })
  return { ticket: data.ticket, expiresAt: Number(data.expires_at) || 0 }
}

/* The socket URL for an engine: same origin as its HTTP API, but the scheme has to
   follow the page — a wss:// URL on an http:// page is refused by the browser. */
export function terminalSocketUrl(engineId: string, ticket: string): string {
  const engine = resolveTargetEngine(engineId)
  const base = new URL(engine.url, window.location.href)
  const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${base.host}${base.pathname.replace(/\/+$/, '')}/terminal?ticket=${encodeURIComponent(ticket)}`
}
