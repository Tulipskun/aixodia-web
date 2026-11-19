//! A static mock of the machines screen: no fetching, no calls. The only state is
//! whether the drawer is open and, while a pointer is down, how far it has been
//! dragged.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Cpu,
  Ellipsis,
  HardDrive,
  MemoryStick,
  Menu,
  MonitorSmartphone,
  Smartphone,
  Sparkles,
  SquareTerminal,
  X,
} from 'lucide-react'

interface Metric {
  label: string
  icon: LucideIcon
  tone: 'accent' | 'cool' | 'warm'
  /** Suffix after the reading, e.g. "%" or " MB/s". */
  unit: string
  digits: number
  /** Capacity, as a plain number: the unit is in the label row. */
  total?: string
  /** Oldest to newest, one sample every 30 s: a full window is 20 points, ten
   *  minutes. The
   *  card draws what it is given — a partial window, a single sample or nothing —
   *  and reads the last one. */
  series: number[]
}

interface Machine {
  id: string
  name: string
  online: boolean
  /** Uptime when it is up, silence when it is not. */
  meta: string
  /** Why the controls are unavailable, when they are. */
  reason?: string
  metrics: Metric[]
}

const WINDOW_SAMPLES = 20
const MACHINES: Machine[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    online: true,
    meta: 'up 12h 40m',
    metrics: [
      {
        label: 'CPU',
        icon: Cpu,
        tone: 'accent',
        unit: '%',
        digits: 0,
        series: sampleSeries(7, 46, 26),
      },
      {
        label: 'RAM',
        icon: MemoryStick,
        tone: 'cool',
        unit: 'GB',
        digits: 1,
        total: '128',
        series: sampleSeries(19, 100.4, 1.6),
      },
      {
        label: 'DISK',
        icon: HardDrive,
        tone: 'warm',
        unit: 'GB',
        digits: 1,
        total: '256',
        series: Array.from({ length: WINDOW_SAMPLES }, () => 164.2),
      },
    ],
  },
  {
    id: 'beta',
    name: 'Beta',
    online: false,
    meta: 'last seen 4h ago',
    reason: 'Offline since 4h ago',
    metrics: [
      { label: 'CPU', icon: Cpu, tone: 'accent', unit: '%', digits: 0, series: [] },
      { label: 'RAM', icon: MemoryStick, tone: 'cool', unit: 'GB', digits: 1, total: '128', series: [] },
      { label: 'DISK', icon: HardDrive, tone: 'warm', unit: 'GB', digits: 1, total: '256', series: [] },
    ],
  },
]

const ACCOUNT = 'Tulipskun'

/* A drag that starts within EDGE of the left side opens the drawer; a drag that
   starts on the open drawer and heads left closes it again. Both commit on
   distance or on speed, so a short flick counts. */
const EDGE = 24
const COMMIT = 72
const FLICK = 0.35
const SLOP = 4

interface Drag {
  pointerId: number
  startX: number
  startY: number
  startedAt: number
  fromOpen: boolean
  width: number
  dx: number
}

const DRAWER: { id: string; label: string; icon: LucideIcon; current?: boolean }[] = [
  { id: 'engines', label: 'Engines', icon: Boxes, current: true },
  { id: 'droidime', label: 'Droidime', icon: Smartphone },
]

const ACTIONS = [
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'screen', label: 'Screen', icon: MonitorSmartphone },
  { id: 'more', label: 'More', icon: Ellipsis },
] as const

/** A deterministic walk, so the mock looks the same on every load. */
function sampleSeries(seed: number, base: number, swing: number): number[] {
  let state = seed
  return Array.from({ length: WINDOW_SAMPLES }, (_, index) => {
    state = (state * 1664525 + 1013904223) % 4294967296
    const noise = state / 4294967296 - 0.5
    const drift = Math.sin((index / WINDOW_SAMPLES) * Math.PI * 2)
    return base + drift * swing * 0.35 + noise * swing
  })
}


/** The chart behind a reading: the whole window, oldest to newest.
 *
 *  It is a texture, not a measurement — the number above it is the measurement —
 *  so it is scaled to its own window, with a floor on the span tied to the metric's
 *  ceiling: two thirds of a temperature degree an inch tall would be a lie, and a
 *  window that barely moved would otherwise look like a cliff.
 *
 *  Partial data is the normal case, not an error: a short window draws a short
 *  window, one sample draws a level, none draws nothing. */
function Spark({ values, ceiling, tone }: { values: number[]; ceiling: number; tone: string }) {
  if (!values.length) return null
  /* The box is the whole cell, so the margins the chart keeps are part of its
     geometry rather than CSS offsets: an absolutely positioned SVG with a viewBox
     keeps its own aspect ratio and refuses to be inset. The line runs close to the
     label and the reading, so it reads as theirs rather than as a band behind. */
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
    <svg
      className={`metric-spark is-${tone}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="spark-area" d={`${line} L${100 - SIDE} ${FLOOR} L${SIDE} ${FLOOR} Z`} />
      <path className="spark-line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** The last sample of a series, formatted. */
function last(samples: number[] | undefined, metric: Metric): string {
  return samples?.length ? samples[samples.length - 1].toFixed(metric.digits) : '—'
}

/** The headline number of the reading. */
function amount(metric: Metric): string {
  return last(metric.series, metric)
}

/** What the reading says: a share out of 100, or used over whole. */
function reading(metric: Metric): { value: string; unit: string } {
  if (!metric.series.length) return { value: '—', unit: '' }
  const used = Number(amount(metric)).toFixed(metric.digits)
  return metric.total
    ? { value: `${used}/${metric.total}`, unit: metric.unit }
    : { value: `${used}%`, unit: '' }
}

function Card({ machine }: { machine: Machine }) {
  const offline = !machine.online
  return (
    <article className={`card${offline ? ' is-offline' : ''}`} aria-label={machine.name}>
      <header className="card-head">
        <h2>{machine.name}</h2>
        <p className={`state${machine.online ? ' is-online' : ''}`}>
          <span className="state-dot" aria-hidden="true" />
          <span className="state-text">{machine.meta}</span>
        </p>
      </header>

      <div className="metrics">
        {machine.metrics.map((metric) => (
          <div
            key={metric.label}
            className="metric"
            role="img"
            aria-label={`${metric.label}, ${reading(metric).value} ${reading(metric).unit}`.trim()}
          >
            <Spark
              values={metric.series}
              ceiling={metric.total ? Number(metric.total) : 100}
              tone={metric.tone}
            />
            <span className="metric-label">
              <metric.icon size={13} className={`is-${metric.tone}`} />
              {metric.label}
            </span>
            <strong className="metric-value">
              {reading(metric).value}
              {reading(metric).unit && <span className="metric-unit">{reading(metric).unit}</span>}
            </strong>
          </div>
        ))}
      </div>

      <div className="actions">
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="action"
            disabled={offline}
            title={offline ? machine.reason : label}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </article>
  )
}

function Drawer({
  open,
  onClose,
  drag,
  panelRef,
}: {
  open: boolean
  onClose: () => void
  drag: Drag | null
  panelRef: React.RefObject<HTMLElement>
}) {
  /* While a pointer is down the panel follows it instead of the class, so the
     gesture reads as dragging the panel rather than waiting for it to appear. */
  const offset = drag ? (drag.fromOpen ? Math.min(0, drag.dx) : Math.min(0, drag.dx - drag.width)) : null
  return (
    <>
      <div
        className={`scrim${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
        style={
          offset === null
            ? undefined
            : { opacity: 1 + offset / (drag?.width ?? 1), transition: 'none' }
        }
      />
      <aside
        ref={panelRef}
        className={`drawer${open ? ' is-open' : ''}`}
        aria-label="Menu"
        aria-hidden={!open}
        style={offset === null ? undefined : { transform: `translateX(${offset}px)`, transition: 'none' }}
      >
        <div className="drawer-head">
          <img className="brand-mark" src="/brand/aixodia-mark.svg" alt="" width={24} height={24} />
          <span className="drawer-brand">AIxodia</span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>

        <nav className="drawer-list">
          {DRAWER.map(({ id, label, icon: Icon, current }) => (
            <button
              key={id}
              type="button"
              className={`drawer-item${current ? ' is-current' : ''}`}
              aria-current={current ? 'page' : undefined}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <p className="drawer-foot">
          <span className="drawer-account">{ACCOUNT}</span>
        </p>
      </aside>
    </>
  )
}

export function EnginesMock() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  /* The native touch listeners outlive a render, so the gesture reads from a ref
     and only the render values come from state. */
  const dragRef = useRef<Drag | null>(null)

  const hold = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }

  const begin = (clientX: number, clientY: number, insideDrawer: boolean) => {
    if (dragRef.current) return false
    if (menuOpen ? !insideDrawer : clientX > EDGE) return false
    const width = panelRef.current?.getBoundingClientRect().width
    if (!width) return false
    hold({
      pointerId: 0,
      startX: clientX,
      startY: clientY,
      startedAt: performance.now(),
      fromOpen: menuOpen,
      width,
      dx: 0,
    })
    return true
  }

  const follow = (clientX: number) => {
    const current = dragRef.current
    if (!current) return
    const dx = clientX - current.startX
    if (Math.abs(dx) < SLOP) return
    hold({ ...current, dx })
  }

  const settle = () => {
    const current = dragRef.current
    if (!current) return
    /* Distance travelled towards the commit, and how fast it went there. */
    const travelled = current.fromOpen ? -current.dx : current.dx
    const speed = travelled / Math.max(16, performance.now() - current.startedAt)
    const move = travelled > COMMIT || speed > FLICK
    setMenuOpen(current.fromOpen ? !move : move)
    hold(null)
  }

  /* Mouse and pen: pointer events, so a captured pointer keeps reporting outside
     the window. */
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const insideDrawer = Boolean((event.target as HTMLElement).closest('.drawer'))
    if (begin(event.clientX, event.clientY, insideDrawer)) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  /* Touch: pointer events get cancelled by the browser's own gesture detection,
     so the touch stream is handled directly and the moves it claims are
     prevented. This is the one path that has to be non-passive. */
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      begin(
        touch.clientX,
        touch.clientY,
        Boolean((event.target as HTMLElement).closest('.drawer')),
      )
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      const current = dragRef.current
      if (!touch || !current) return
      /* A gesture that turns out to be vertical belongs to the page: let it go
         before the drag claims any of it. */
      const dy = touch.clientY - current.startY
      if (current.dx === 0 && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(touch.clientX - current.startX)) {
        hold(null)
        return
      }
      event.preventDefault()
      follow(touch.clientX)
    }

    const onTouchEnd = () => settle()

    shell.addEventListener('touchstart', onTouchStart, { passive: true })
    shell.addEventListener('touchmove', onTouchMove, { passive: false })
    shell.addEventListener('touchend', onTouchEnd)
    shell.addEventListener('touchcancel', onTouchEnd)
    return () => {
      shell.removeEventListener('touchstart', onTouchStart)
      shell.removeEventListener('touchmove', onTouchMove)
      shell.removeEventListener('touchend', onTouchEnd)
      shell.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [menuOpen])

  return (
    <div
      ref={shellRef}
      className={`shell${drag ? ' is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        if (event.pointerType !== 'touch') follow(event.clientX)
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== 'touch') settle()
      }}
      onPointerCancel={() => hold(null)}
    >
      <header className="topbar">
        <button
          type="button"
          className="icon-button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={18} />
        </button>
        <div className="brand">
          <img className="brand-mark" src="/brand/aixodia-mark.svg" alt="" width={28} height={28} />
          <span className="brand-name">AIxodia</span>
        </div>
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} drag={drag} panelRef={panelRef} />

      <main className="screen">
        {MACHINES.map((machine) => (
          <Card key={machine.id} machine={machine} />
        ))}
      </main>

    </div>
  )
}
