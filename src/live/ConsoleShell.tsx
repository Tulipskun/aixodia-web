import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes, Cpu, HardDrive, Menu, MemoryStick, MessagesSquare, Plus, SquareTerminal, X,
} from 'lucide-react'
import type { Machine } from './useLive'
import { TerminalPane } from './TerminalPane'

/* The console: a bar, a drawer, and whatever the menu is showing.
 *
 * The chrome is the one the mock settled on — a bar that is never covered, a panel
 * that starts under it, and a sideways drag that opens it. What is new is where the
 * facts come from: the registry for the names, each engine's /healthz for the
 * readings, and /api/terminals for the shells. */

type Screen = 'engines' | 'terminal'

const ENTER_DELAY = 100
const ENTER_STEP = 80
const COMMIT = 72
const FLICK = 0.35
const SLOP = 4

interface Drag {
  startX: number
  startY: number
  startedAt: number
  fromOpen: boolean
  width: number
  dx: number
  active: boolean
}

export interface TerminalRef {
  id: string
  engine: string
  title: string
}

/** A reading: a number, and the history of it this browser has seen. */
function Spark({ values, ceiling }: { values: number[]; ceiling: number }) {
  if (!values.length) return null
  const TOP = 8
  const FLOOR = 92
  const SIDE = 4
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, ceiling * 0.04)
  const low = (min + max) / 2 - span / 2
  const y = (value: number) => {
    const ratio = Math.min(1, Math.max(0, (value - low) / span))
    return FLOOR - ratio * (FLOOR - TOP)
  }
  const x = (index: number) =>
    values.length === 1 ? SIDE : SIDE + (index / (values.length - 1)) * (100 - SIDE * 2)

  const first = y(values[0])
  const line =
    values.length === 1
      ? `M${SIDE} ${first.toFixed(2)} L${100 - SIDE} ${first.toFixed(2)}`
      : values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')

  return (
    <svg className="metric-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path className="spark-area" d={`${line} L${100 - SIDE} ${FLOOR} L${SIDE} ${FLOOR} Z`} />
      <path className="spark-line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

interface Reading {
  label: string
  icon: LucideIcon
  unit: string
  digits: number
  total?: string
  series: number[]
}

/* The three readings a server reports, and how each is said: a share out of a
   hundred, or used over whole. */
function readings(machine: Machine): Reading[] {
  const metrics = machine.status?.metrics
  const gb = (bytes: number | null | undefined) =>
    typeof bytes === 'number' && Number.isFinite(bytes) ? bytes / 1024 ** 3 : undefined
  return [
    { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: machine.series.cpu },
    {
      label: 'RAM', icon: MemoryStick, unit: 'GB', digits: 1,
      total: gb(metrics?.memoryTotalBytes)?.toFixed(0), series: machine.series.ram,
    },
    {
      label: 'DISK', icon: HardDrive, unit: 'GB', digits: 1,
      total: gb(metrics?.diskTotalBytes)?.toFixed(0), series: machine.series.disk,
    },
  ]
}

function reading(metric: Reading): { value: string; unit: string } {
  if (!metric.series.length) return { value: '—', unit: '' }
  const used = metric.series[metric.series.length - 1].toFixed(metric.digits)
  return metric.total ? { value: `${used}/${metric.total}`, unit: metric.unit } : { value: `${used}%`, unit: '' }
}

function Card({ machine, index, onTerminal, onChat }: {
  machine: Machine
  index: number
  onTerminal: () => void
  onChat?: () => void
}) {
  const offline = !machine.online
  return (
    <article
      className={`card${offline ? ' is-offline' : ''}`}
      style={
        {
          animationDelay: `${ENTER_DELAY + index * ENTER_STEP}ms`,
          '--enter': `${ENTER_DELAY + index * ENTER_STEP}ms`,
        } as CSSProperties
      }
      aria-label={machine.name}
    >
      <header className="card-head">
        <h2>{machine.name}</h2>
        <p className={`state${machine.online ? ' is-online' : ''}`}>
          <span className="state-dot" aria-hidden="true" />
          <span className="state-text">{machine.meta}</span>
        </p>
      </header>

      <div className="metrics">
        {readings(machine).map(metric => (
          <div
            key={metric.label}
            className="metric"
            role="img"
            aria-label={`${metric.label}, ${reading(metric).value} ${reading(metric).unit}`.trim()}
          >
            <Spark values={metric.series} ceiling={metric.total ? Number(metric.total) : 100} />
            <span className="metric-label">
              <metric.icon size={13} aria-hidden="true" />
              {metric.label}
            </span>
            <strong className="metric-value">
              {reading(metric).value}
              {reading(metric).unit && <span className="metric-unit">{reading(metric).unit}</span>}
            </strong>
          </div>
        ))}
      </div>

      {/* Two verbs, and only the ones that work: a shell on this machine, and the
          conversation with it. Anything still to be wired is not drawn — a button that
          cannot do its job is worse than no button. */}
      <div className={`actions${onChat ? ' is-pair' : ''}`}>
        {onChat && (
          <button type="button" className="action" disabled={offline} onClick={onChat}>
            <MessagesSquare size={15} aria-hidden="true" />
            <span>Chat</span>
          </button>
        )}
        <button type="button" className="action" disabled={offline} onClick={onTerminal}>
          <SquareTerminal size={15} aria-hidden="true" />
          <span>Terminal</span>
        </button>
      </div>
    </article>
  )
}

function Confirm({ terminal, engine, onKeep, onClose }: {
  terminal: TerminalRef
  engine: string
  onKeep: () => void
  onClose: () => void
}) {
  const keepRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    keepRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onKeep()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKeep])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const buttons = panelRef.current?.querySelectorAll('button')
    if (!buttons?.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      ;(last as HTMLButtonElement).focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      ;(first as HTMLButtonElement).focus()
    }
  }

  return (
    <div className="dialog-scrim" onMouseDown={onKeep}>
      <div
        ref={panelRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 className="dialog-title" id="confirm-title">{`Close ${terminal.title}?`}</h2>
        <p className="dialog-body" id="confirm-body">
          {`The shell on ${engine} stops. Anything still running in it ends with it.`}
        </p>
        <div className="dialog-actions">
          <button ref={keepRef} type="button" className="dialog-cancel" onClick={onKeep}>Cancel</button>
          <button type="button" className="dialog-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export function ConsoleShell({
  machines,
  terminals,
  account,
  current,
  screen,
  onOpenTerminal,
  onSelectTerminal,
  onCloseTerminal,
  onTerminalReady,
  onOpenChat,
  onSignOut,
  onScreen,
}: {
  machines: Machine[]
  terminals: TerminalRef[]
  account: string
  current: string
  screen: Screen
  onOpenTerminal: (engine: string) => void
  onSelectTerminal: (id: string) => void
  onCloseTerminal: (terminal: TerminalRef) => void
  onTerminalReady: () => void
  onOpenChat?: (engineId: string) => void
  onSignOut: () => void
  onScreen: (screen: Screen) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [asking, setAsking] = useState<TerminalRef | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const topbarRef = useRef<HTMLElement>(null)
  const dragRef = useRef<Drag | null>(null)

  const full = screen === 'terminal'
  const revealed = drag
    ? 1 + (drag.fromOpen ? Math.min(0, drag.dx) : Math.min(0, drag.dx - drag.width)) / drag.width
    : null

  const hold = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next?.active ? next : null)
  }

  const begin = (target: EventTarget | null, clientX: number, clientY: number) => {
    if (dragRef.current) return false
    if (target instanceof Element && target.closest('[data-no-drag]')) return false
    const width = panelRef.current?.getBoundingClientRect().width
    if (!width) return false
    hold({ startX: clientX, startY: clientY, startedAt: performance.now(), fromOpen: menuOpen, width, dx: 0, active: false })
    return true
  }

  /* Across is the measure, the way the app's own panel gesture does it: the drag is
     the panel's once it is wider than it is tall. */
  const follow = (clientX: number, clientY: number) => {
    const current = dragRef.current
    if (!current) return
    const dx = clientX - current.startX
    const dy = clientY - current.startY
    if (!current.active) {
      if (Math.abs(dx) < SLOP) return
      if (Math.abs(dx) <= Math.abs(dy)) {
        hold(null)
        return
      }
      hold({ ...current, active: true, dx })
      return
    }
    hold({ ...current, dx })
  }

  const settle = () => {
    const current = dragRef.current
    if (!current) return
    if (!current.active) {
      hold(null)
      return
    }
    const travelled = current.fromOpen ? -current.dx : current.dx
    const speed = travelled / Math.max(16, performance.now() - current.startedAt)
    const move = travelled > COMMIT || speed > FLICK
    setMenuOpen(current.fromOpen ? !move : move)
    hold(null)
  }

  useEffect(() => {
    topbarRef.current?.toggleAttribute('inert', full && !menuOpen)
  }, [full, menuOpen])

  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', !menuOpen)
  }, [menuOpen])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return
      begin(event.target, event.clientX, event.clientY)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      follow(event.clientX, event.clientY)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      settle()
    }
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      begin(event.target, touch.clientX, touch.clientY)
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch || !dragRef.current) return
      follow(touch.clientX, touch.clientY)
      if (dragRef.current?.active) event.preventDefault()
    }
    const onTouchEnd = () => settle()

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', () => hold(null))
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [menuOpen])

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  /* Sessions are grouped by the engine they run on, in the registry's own order, and
     an engine with nothing running on it earns no heading. */
  const groups = machines
    .map(machine => ({ machine, shells: terminals.filter(terminal => terminal.engine === machine.id) }))
    .filter(group => group.shells.length)

  const offset = drag ? (drag.fromOpen ? Math.min(0, drag.dx) : Math.min(0, drag.dx - drag.width)) : null
  const currentTerminal = terminals.find(terminal => terminal.id === current)

  return (
    <div
      className={`shell${drag ? ' is-dragging' : ''}${full ? ' is-full' : ''}${full && menuOpen ? ' is-menu' : ''}`}
    >
      <a className="skip-link" href="#content">Skip to content</a>

      <header
        className="topbar"
        ref={topbarRef}
        style={
          full && revealed !== null
            ? {
                transform: `translateY(${-100 * (1 - revealed)}%)`,
                opacity: revealed,
                pointerEvents: revealed > 0.6 ? 'auto' : 'none',
                transition: 'none',
              }
            : undefined
        }
      >
        <button
          type="button"
          className="icon-button"
          aria-label={menuOpen ? 'Close menu' : 'Menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(wasOpen => !wasOpen)}
        >
          <Menu size={18} />
        </button>
        <div className="brand">
          <img className="brand-mark" src="/brand/aixodia-mark.svg" alt="" width={22} height={22} />
          <span className="brand-name">AIxodia</span>
        </div>
      </header>

      <div
        className={`scrim${menuOpen ? ' is-open' : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
        style={offset === null ? undefined : { opacity: 1 + offset / (drag?.width ?? 1), transition: 'none' }}
      />
      <aside
        ref={panelRef}
        className={`drawer${menuOpen ? ' is-open' : ''}`}
        aria-label="Menu"
        aria-hidden={!menuOpen}
        style={offset === null ? undefined : { transform: `translateX(${offset}px)`, transition: 'none' }}
      >
        <nav className="drawer-list">
          <button
            type="button"
            className={`drawer-item${screen === 'engines' ? ' is-current' : ''}`}
            aria-current={screen === 'engines' ? 'page' : undefined}
            onClick={() => {
              onScreen('engines')
              closeMenu()
            }}
          >
            <Boxes size={16} />
            <span>Engines</span>
          </button>
        </nav>

        {/* The shells belong to the terminal they switch between: on the list of
            engines there is no shell open, so there is no strip to show. */}
        {screen === 'terminal' && (
          <div className="drawer-scroll">
            <p className="drawer-label">{`Terminals · ${terminals.length}`}</p>

            {groups.map(({ machine, shells }) => (
              <section className="drawer-group" key={machine.id}>
                <p className="drawer-head">
                  <span className={`drawer-dot${machine.online ? ' is-live' : ''}`} aria-hidden="true" />
                  {machine.name}
                  <span className="drawer-count">{shells.length}</span>
                </p>

                {shells.map(shell => (
                  <div key={shell.id} className={`drawer-session${shell.id === current ? ' is-current' : ''}`}>
                    <button
                      type="button"
                      className="drawer-session-open"
                      aria-current={shell.id === current ? 'true' : undefined}
                      onClick={() => {
                        onSelectTerminal(shell.id)
                        closeMenu()
                      }}
                    >
                      <SquareTerminal size={16} />
                      <span className="drawer-session-title">{shell.title}</span>
                    </button>
                    <button
                      type="button"
                      className="drawer-session-close"
                      aria-label={`Close ${shell.title}`}
                      onClick={() => setAsking(shell)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="drawer-new"
                  onClick={() => {
                    onOpenTerminal(machine.id)
                    closeMenu()
                  }}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>New terminal</span>
                </button>
              </section>
            ))}
          </div>
        )}

        {/* Who you are, and the one thing to do about it. The menu is where the
            account lives, so signing out must be reachable from it rather than from a
            second bar that only the old page had. */}
        <div className="drawer-foot">
          <span className="drawer-account">{account || 'Signed in'}</span>
          <button type="button" className="drawer-signout" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      {asking && (
        <Confirm
          terminal={asking}
          engine={machines.find(machine => machine.id === asking.engine)?.name ?? asking.engine}
          onKeep={() => setAsking(null)}
          onClose={() => {
            onCloseTerminal(asking)
            setAsking(null)
          }}
        />
      )}

      <main className="screen" id="content" tabIndex={-1}>
        {screen === 'engines' && (
          <>
            <div className="screen-head">
              <h1>Engines</h1>
              <span className="screen-count">{`${machines.filter(machine => machine.online).length}/${machines.length} up`}</span>
            </div>
            {machines.map((machine, index) => (
              <Card
                key={machine.id}
                machine={machine}
                index={index}
                onTerminal={() => onOpenTerminal(machine.id)}
                onChat={onOpenChat ? () => onOpenChat(machine.id) : undefined}
              />
            ))}
            {machines.length === 0 && (
              <p className="terminal-hint">No engines yet. The registry has not answered.</p>
            )}
          </>
        )}

        {screen === 'terminal' && currentTerminal && (
          <TerminalPane
            key={currentTerminal.id}
            engineId={currentTerminal.engine}
            terminalId={currentTerminal.id}
            onReady={onTerminalReady}
          />
        )}
      </main>
    </div>
  )
}

export type { Machine }
