// Shared API models for the AIxodia web dashboard.

export interface Session {
  authenticated: boolean
  username: string | null
  expiresAt: string | null
}

export interface Health {
  ok: boolean
  authConfigured: boolean
}

export type EngineAuthMode = 'access' | 'bearer'
export type EngineSource = 'proxy' | 'config' | 'custom'

export interface EngineNode {
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

export interface EnginesDiscoveryResponse {
  engines: Array<{
    id: string
    name: string
    host?: string
    url?: string
    subtitle?: string | null
    tag?: string | null
    default?: boolean
  }>
}

export interface EngineMetrics {
  cpuPercent: number | null
  memoryUsedBytes: number | null
  memoryTotalBytes: number | null
  memoryPercent: number | null
  diskUsedBytes: number | null
  diskTotalBytes: number | null
  diskPercent: number | null
}

export interface EngineStatus {
  configured: boolean
  online: boolean
  checkedAt: string
  reason?: string | null
  version?: string | null
  startedAt?: number | null
  uptimeSeconds?: number | null
  metrics: EngineMetrics | null
}

export interface EngineSession {
  id: string
  title: string
  provider: string
  model: string
  updated_at: number
}

export interface EngineTurn {
  id: number
  seq: number
  role: string
  text: string
  created_at: number
  block?: string
  model?: string
  agent?: string
}

export interface EngineRun {
  id: string
  session_id: string
  status: string
  last_seq: number
}

export interface EngineEvent {
  seq: number
  kind: string
  data: Record<string, unknown>
}

export interface DeviceStatus {
  online: boolean
  latencyMs: number | null
  checkedAt: string
  reason: string | null
  version?: string | null
}

export interface Device {
  id: string
  name: string
  host: string
  subtitle?: string
  tag?: string
  accent?: string
  status: DeviceStatus
}

export interface DevicesResponse {
  items: Device[]
  checkedAt: string
  ephemeral: boolean
  note?: string | null
}

export interface DeviceTool {
  name: string
  description?: string
  inputSchema?: {
    type?: string
    properties?: Record<string, { type?: string; description?: string; default?: unknown }>
    required?: string[]
  }
}

export interface DeviceToolsResponse {
  tools: DeviceTool[]
}

export interface Screenshot {
  mimeType: string
  data: string
}

export interface DeviceActionResult {
  ok: boolean
  device: string
  tool: string
  text: string
  screenshot: Screenshot | null
  at: string
}

export interface ApiErrorBody {
  error: string
  code: string
  requestId?: string
  reason?: string | null
  detail?: string | null
  checkedAt?: string
  retryAfter?: number
}

export interface ConsoleInfo {
  name: string
  subtitle: string
  tagline: string
  owner: string
}

export interface Preset {
  id: string
  label: string
  tool: string
  arguments: Record<string, unknown>
  hint?: string
}

export type ToolFieldKind = 'percent' | 'int' | 'text' | 'points' | 'pointers' | 'keycodes'

export interface ToolField {
  key: string
  label: string
  kind: ToolFieldKind
  required: boolean
  default?: string | number
  placeholder?: string
  hint?: string
  min?: number
  max?: number
  maxLength?: number
}

export interface ToolDescriptor {
  name: string
  label: string
  description: string
  group: string
  fields: ToolField[]
}

export interface ActionResult {
  ok: boolean
  device: string
  tool: string
  arguments: Record<string, unknown>
  text: string
  screenshot: Screenshot | null
  durationMs: number
  at: string
  requestId: string
  platform?: string
}

export interface ConsoleConfig {
  console: ConsoleInfo
  engines?: EngineNode[]
  devices: Device[]
  presets: Preset[]
  protocolVersion?: string
  platform?: string
}

export interface CommandLogEntry {
  id: string
  at: string
  engineId?: string
  tool: string
  device: string
  ok: boolean
  durationMs: number | null
  hasScreenshot: boolean
  arguments?: Record<string, unknown>
  error?: { code: string; message: string } | null
}

export interface ToolsResponse {
  tools: ToolDescriptor[]
  source: 'catalog' | 'device'
  deviceTools: Array<{ name: string; description: string; inputSchema: unknown }> | null
  protocolVersion: string
  note: string
}

export interface CommandsResponse {
  items: CommandLogEntry[]
  cap: number
  ephemeral: boolean
}
