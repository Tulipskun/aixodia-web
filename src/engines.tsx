import { useMemo } from 'react'
import { Cpu, MemoryStick, MessageSquare, RefreshCw, Server, WifiOff } from 'lucide-react'
import { useEngines } from './EngineSwitcher'
import type { EngineNode, EngineStatus } from './types'

/* The engines screen, on real data: the registry at /api/engines says what exists,
   each engine's /healthz says whether it is up and how much it is using. Nothing on
   this screen is invented — a value the engine does not report is an em dash, not a
   plausible number. */

function percent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '—'
}

function memory(status: EngineStatus | undefined): { used: string; of: string } {
  const metrics = status?.metrics
  const used = metrics?.memoryUsedBytes
  const total = metrics?.memoryTotalBytes
  if (typeof used !== 'number' || !Number.isFinite(used)) return { used: '—', of: '' }
  const gb = used / 1024 ** 3
  const whole = typeof total === 'number' && Number.isFinite(total) ? `of ${(total / 1024 ** 3).toFixed(1)}` : ''
  return { used: gb >= 1 ? gb.toFixed(1) : (used / 1024 ** 2).toFixed(0), of: `${whole}${gb >= 1 ? ' GB' : ' MB'}`.trim() }
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

/* What the card says under the engine's name: what it is, and — when it is up — how
   long it has been up. An offline engine says why instead of when. */
function describe(engine: EngineNode, status: EngineStatus | undefined): string {
  if (!status?.online) return status?.reason ? `offline · ${status.reason}` : 'offline'
  const since = uptime(status.uptimeSeconds)
  const base = engine.subtitle?.trim() || engine.host || engine.url
  return since ? `${base} · ${since}` : base
}

export function EnginesScreen({ onOpenChat }: { onOpenChat: (engineId: string) => void }) {
  const { engines, statuses, refreshing, refreshStatuses } = useEngines()

  /* A card per engine, in the order the registry answered. Offline engines keep
     their place: an engine that is down is a fact about the system, not a card to
     hide, and the count above says how many are up. */
  const cards = useMemo(
    () => engines.map(engine => ({ engine, status: statuses[engine.id] })),
    [engines, statuses],
  )
  const live = cards.filter(card => card.status?.online).length

  return (
    <section className="engines-screen" aria-label="Engines">
      <div className="engines-head">
        <h1>Engines</h1>
        <button
          type="button"
          className="engines-refresh"
          onClick={() => void refreshStatuses()}
          aria-label="Refresh engine status"
          aria-busy={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'is-spinning' : undefined} aria-hidden="true" />
          <span>{`${live}/${cards.length} up`}</span>
        </button>
      </div>

      {cards.length === 0 && (
        <p className="engines-empty">
          <Server size={15} aria-hidden="true" />
          No engines yet. Add one from the switcher above.
        </p>
      )}

      {cards.map(({ engine, status }) => {
        const online = status?.online === true
        const ram = memory(status)
        return (
          <article key={engine.id} className={`engines-card${online ? '' : ' is-offline'}`}>
            <div className="engines-card-head">
              <div className="engines-id">
                <h2>{engine.name}</h2>
                <p className="engines-meta">{describe(engine, status)}</p>
              </div>
              {/* The one colour on the card is the one fact that changes: up or not. */}
              <span className={`engines-state${online ? ' is-live' : ''}`}>
                {online ? null : <WifiOff size={12} aria-hidden="true" />}
                {online ? 'online' : 'offline'}
              </span>
            </div>

            <div className="engines-metrics">
              <div className="engines-metric">
                <span className="engines-metric-label">
                  <Cpu size={13} aria-hidden="true" />
                  CPU
                </span>
                <strong className="engines-metric-value">{percent(status?.metrics?.cpuPercent)}</strong>
              </div>
              <div className="engines-metric">
                <span className="engines-metric-label">
                  <MemoryStick size={13} aria-hidden="true" />
                  RAM
                </span>
                <strong className="engines-metric-value">
                  {ram.used}
                  {ram.of && <span className="engines-metric-unit">{ram.of}</span>}
                </strong>
              </div>
            </div>

            <div className="engines-actions">
              <button
                type="button"
                className="engines-action"
                disabled={!online}
                onClick={() => onOpenChat(engine.id)}
              >
                <MessageSquare size={15} aria-hidden="true" />
                <span>Chat</span>
              </button>
            </div>
          </article>
        )
      })}
    </section>
  )
}
