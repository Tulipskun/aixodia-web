// Type declarations for the plain-JS client core. These mirror client-core.js
// exactly; keep them in sync when the implementation changes.

export type EngineAuthMode = 'access' | 'bearer'
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

/** Default engine proxy origin (`/engine`). */
export const DEFAULT_ENGINE_URL: string

/** Default primary engine ID (`default`). */
export const DEFAULT_ENGINE_ID: string

/** Resolve a configured engine URL, falling back to the default. */
export function resolveEngineUrl(value: unknown): string

/** Build the same-origin proxy base path for a named engine ID. */
export function engineProxyBaseUrl(id: string, proxyRoot?: string): string

/** Convert a label or hostname into a stable lowercase engine ID. */
export function slugifyEngineId(value: unknown, fallback?: string): string

/** Normalize one engine descriptor into a ClientEngineNode. */
export function normalizeEngineNode(
  raw: unknown,
  opts?: { index?: number; source?: EngineSource; proxyRoot?: string },
): ClientEngineNode

/** Merge engine descriptor groups without duplicate IDs, guaranteeing at least one entry. */
export function mergeEngineCatalog(
  groups: Array<{ items?: unknown[]; source?: EngineSource }>,
  defaultBaseUrl?: string,
): ClientEngineNode[]

/** Pick the active engine by ID, falling back to the first entry. */
export function selectActiveEngine(engines: ClientEngineNode[], activeId: unknown): ClientEngineNode

/** True when a unix-seconds expiry is at/before now, or is not a finite number. */
export function isExpired(expiresAtSeconds: unknown, nowMs?: number): boolean

/** Map the historical client-facing /api/* paths to the engine's direct paths. */
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
