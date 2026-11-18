//! A static mock of the machines screen: no fetching, no state, no calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import {
  Boxes,
  Ellipsis,
  HardDrive,
  Home,
  Menu,
  MonitorSmartphone,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'

interface Metric {
  label: string
  tone: 'accent' | 'cool' | 'warm'
  /** Suffix after the reading, e.g. "%" or " MB/s". */
  unit: string
  digits: number
  /** Capacity, as a plain number: the unit is in the label row. */
  total?: string
  /** Oldest to newest, one sample every 30 s: 20 samples is ten minutes. The card
   *  reads the last one; the series stays because the registry will send a window. */
  series: number[]
}

interface Storage {
  used: string
  total: string
  percent: number
}

interface Machine {
  id: string
  name: string
  online: boolean
  meta: string
  /** Why the controls are unavailable, when they are. */
  reason?: string
  metrics: Metric[]
  storage: Storage
}

const WINDOW_SAMPLES = 20
const MACHINES: Machine[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    online: true,
    meta: 'Debian 13 · up 12h 40m',
    metrics: [
      {
        label: 'CPU',
        tone: 'accent',
        unit: '%',
        digits: 0,
        series: sampleSeries(7, 46, 26),
      },
      {
        label: 'RAM',
        tone: 'cool',
        unit: ' GB',
        digits: 1,
        total: '128',
        series: sampleSeries(19, 100.4, 1.6),
      },
    ],
    storage: { used: '164', total: '256 GB', percent: 64 },
  },
  {
    id: 'beta',
    name: 'Beta',
    online: false,
    meta: 'Last seen 4h ago',
    reason: 'Offline since 4h ago',
    metrics: [
      { label: 'CPU', tone: 'accent', unit: '%', digits: 0, series: [] },
      { label: 'RAM', tone: 'cool', unit: ' GB', digits: 1, total: '128', series: [] },
    ],
    storage: { used: '—', total: '', percent: 0 },
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


/** The last sample of a series, formatted. */
function last(samples: number[] | undefined, metric: Metric): string {
  return samples?.length ? samples[samples.length - 1].toFixed(metric.digits) : '—'
}

/** The headline number of the reading. */
function amount(metric: Metric): string {
  return last(metric.series, metric)
}

/** How full the metric is, when that question has an answer. */
function percent(metric: Metric): number | null {
  if (!metric.series.length) return null
  const value = Number(amount(metric))
  if (metric.total) return Math.min(100, (value / Number(metric.total)) * 100)
  if (metric.unit === '%') return Math.min(100, value)
  return null
}

/** The capacity a reading is measured against, e.g. "of 128 GB". */
function capacity(metric: Metric): string | null {
  if (metric.total) return `of ${metric.total}${metric.unit}`
  if (metric.unit === '%') return 'of 100%'
  return null
}

/** A round gauge: the arc is how full the metric is, the middle says by how much.
 *  Without a reading it keeps the track and drops the arc, so an offline card
 *  holds the same shape as an online one. */
function Gauge({ percent: value, tone, label }: { percent: number | null; tone: Metric['tone']; label: string }) {
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const reading = value === null ? '—' : String(Math.round(value))
  return (
    <div
      className={`gauge is-${tone}`}
      role="img"
      aria-label={value === null ? `${label}, no reading` : `${label}, ${Math.round(value)} percent`}
    >
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="gauge-track" cx="42" cy="42" r={radius} />
        {value !== null && (
          <circle
            className="gauge-arc"
            cx="42"
            cy="42"
            r={radius}
            strokeDasharray={`${(Math.min(100, value) / 100) * circumference} ${circumference}`}
            transform="rotate(-90 42 42)"
          />
        )}
      </svg>
      <span className="gauge-read">
        {reading}
        {value !== null && <span className="gauge-unit">%</span>}
      </span>
    </div>
  )
}

function Card({ machine }: { machine: Machine }) {
  const offline = !machine.online
  return (
    <article className={`card${offline ? ' is-offline' : ''}`} aria-label={machine.name}>
      <header className="card-head">
        <div className="card-title">
          <h2>{machine.name}</h2>
          <span className={`pill is-${machine.online ? 'online' : 'offline'}`}>
            <span className="pill-dot" aria-hidden="true" />
            {machine.online ? 'online' : 'offline'}
          </span>
        </div>
        <p className="meta">{machine.meta}</p>
      </header>

      <div
        className="disk"
        role="img"
        aria-label={`Storage ${machine.storage.used} of ${machine.storage.total}, ${machine.storage.percent} percent`}
      >
        <span className="disk-label">
          <HardDrive size={12} className="is-accent" />
          disk
        </span>
        <span className="disk-value">
          {machine.storage.used}
          {machine.storage.total && <span className="disk-total"> / {machine.storage.total}</span>}
        </span>
        <span className="disk-bar">
          <span className="disk-fill" style={{ width: `${machine.storage.percent}%` }} />
        </span>
      </div>

      <div className="metrics">
        {machine.metrics.map((metric) => (
          <div key={metric.label} className="metric">
            <Gauge percent={percent(metric)} tone={metric.tone} label={metric.label} />
            <span className="metric-label">{metric.label}</span>
            <span className="metric-capacity">{capacity(metric)}</span>
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
          <span className="brand-name">AIxodia</span>
          <span className="brand-dot" aria-hidden="true" />
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

      <nav className="tabbar" aria-label="Sections">
        <button type="button" className="tab is-active" aria-current="page">
          <Home size={17} />
          <span>Home</span>
        </button>
        <button type="button" className="tab">
          <Boxes size={17} />
          <span>MCP</span>
        </button>
      </nav>
    </div>
  )
}
