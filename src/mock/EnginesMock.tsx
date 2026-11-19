//! A static mock of the machines screen: no fetching, no state, no calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import type { LucideIcon } from 'lucide-react'
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Ellipsis,
  Menu,
  MonitorSmartphone,
  Sparkles,
  SquareTerminal,
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
        digits: 0,
        total: '128',
        series: sampleSeries(19, 100.4, 1.6),
      },
      {
        label: 'DISK',
        icon: HardDrive,
        tone: 'warm',
        unit: 'GB',
        digits: 0,
        total: '256',
        // Slow to move and slow to fill: a short window still draws.
        series: sampleSeries(3, 164, 0.6).slice(0, 17),
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
      { label: 'DISK', icon: HardDrive, tone: 'warm', unit: 'GB', digits: 0, total: '256', series: [] },
    ],
  },
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
  /* The box is the whole cell, so the margins the chart keeps from the frame are
     part of its geometry rather than CSS offsets: an absolutely positioned SVG
     with a viewBox keeps its own aspect ratio and refuses to be inset. */
  const TOP = 14
  const FLOOR = 88
  const SIDE = 8
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
  const used = String(Math.round(Number(amount(metric))))
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

export function EnginesMock() {
  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="icon-button" aria-label="Menu">
          <Menu size={18} />
        </button>
        <div className="brand">
          <img className="brand-mark" src="/brand/aixodia-mark.svg" alt="" width={28} height={28} />
          <span className="brand-name">AIxodia</span>
        </div>
        <button type="button" className="avatar" aria-label="Account">
          P
        </button>
      </header>

      <main className="screen">
        {MACHINES.map((machine) => (
          <Card key={machine.id} machine={machine} />
        ))}
      </main>

    </div>
  )
}
