import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../api'
import { useEngines } from '../EngineSwitcher'
import type { EngineStatus } from '../types'

/* The console's data, as the screens need it.
 *
 * Three things are being polled here and they are polled for different reasons: the
 * registry says which engines exist, each engine's /healthz says whether it is up and
 * what it is using, and /api/terminals says which shells are running. The sample
 * window is kept here rather than on the engine because it is a picture for a chart,
 * not a measurement anyone can ask for later. */

const WINDOW = 20
const POLL_MS = 20_000

export interface Series {
  cpu: number[]
  ram: number[]
  disk: number[]
}

export interface Machine {
  id: string
  name: string
  online: boolean
  /** What the card says under the name: uptime when up, the reason when not. */
  meta: string
  status: EngineStatus | undefined
  series: Series
}

const emptySeries = (): Series => ({ cpu: [], ram: [], disk: [] })

function push(list: number[], value: number | null | undefined): number[] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return list
  const next = [...list, value]
  return next.length > WINDOW ? next.slice(next.length - WINDOW) : next
}

function uptime(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `up ${days}d ${hours}h`
  if (hours > 0) return `up ${hours}h ${minutes}m`
  return `up ${minutes}m`
}

/* A reason is worth reading when it is a fact about the machine; a stack of transport
   words is not, and it would be cut off anyway. */
function describe(status: EngineStatus | undefined): string {
  if (!status) return 'checking…'
  if (status.online) return uptime(status.uptimeSeconds) ?? 'online'
  const reason = (status.reason ?? '').trim()
  return reason && reason.length <= 22 ? `offline · ${reason}` : 'offline · unreachable'
}

export function useMachines() {
  const { engines, statuses, refreshStatuses } = useEngines()
  /* The history lives in state, and it grows only when a reading is actually new: the
     stamp of when it was taken is what tells a fresh reading from a re-render. A reload
     starts the window again, which is honest — this browser has seen nothing older. */
  const [history, setHistory] = useState<Record<string, Series>>({})
  const stamped = useRef('')

  useEffect(() => {
    const stamp = engines.map(engine => `${engine.id}@${statuses[engine.id]?.checkedAt ?? ''}`).join('|')
    if (!stamp || stamp === stamped.current) return
    stamped.current = stamp
    setHistory(previous => {
      const next: Record<string, Series> = {}
      for (const engine of engines) {
        const status = statuses[engine.id]
        const current = previous[engine.id] ?? emptySeries()
        if (!status?.online) {
          next[engine.id] = current
          continue
        }
        next[engine.id] = {
          cpu: push(current.cpu, status.metrics?.cpuPercent),
          ram: push(current.ram, (status.metrics?.memoryUsedBytes ?? NaN) / 1024 ** 3),
          disk: push(current.disk, (status.metrics?.diskUsedBytes ?? NaN) / 1024 ** 3),
        }
      }
      return next
    })
  }, [engines, statuses])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshStatuses()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshStatuses])

  const machines = useMemo<Machine[]>(
    () =>
      engines.map(engine => {
        const status = statuses[engine.id]
        return {
          id: engine.id,
          name: engine.name,
          online: status?.online === true,
          meta: describe(status),
          status,
          series: history[engine.id] ?? emptySeries(),
        }
      }),
    [engines, statuses, history],
  )

  return { machines, refresh: refreshStatuses }
}

export interface LiveTerminal extends api.TerminalInfo {
  engine: string
}

/* The shells each engine has running. A terminal is not a screen that is rebuilt: it
   is a session, so the menu is the engine's own list and closing one closes it there. */
export function useTerminals(engineIds: string[]) {
  const [byEngine, setByEngine] = useState<Record<string, api.TerminalInfo[]>>({})
  /* The list of ids is rebuilt only when the set changes, so an unchanged set does not
     restart the poll on every render. */
  const key = engineIds.join(',')
  const ids = useMemo(() => (key ? key.split(',') : []), [key])

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      ids.map(async (id): Promise<[string, api.TerminalInfo[]]> => {
        try {
          return [id, await api.listTerminals(id)]
        } catch {
          return [id, []]
        }
      }),
    )
    setByEngine(Object.fromEntries(entries))
  }, [ids])

  useEffect(() => {
    if (!ids.length) return
    void refresh()
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [refresh, ids])

  const terminals = useMemo<LiveTerminal[]>(
    () =>
      ids.flatMap(id =>
        (byEngine[id] ?? []).map(item => ({ ...item, engine: id })),
      ),
    [byEngine, ids],
  )

  const close = useCallback(
    async (terminal: { id: string; engine: string }) => {
      await api.closeTerminal(terminal.id, terminal.engine)
      await refresh()
    },
    [refresh],
  )

  return { terminals, refresh, close }
}

export function useAccount(): string {
  const [name, setName] = useState('')
  useEffect(() => {
    setName(api.getSession().username ?? '')
  }, [])
  return name
}
