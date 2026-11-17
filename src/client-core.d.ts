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
