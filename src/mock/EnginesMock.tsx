//! A static mock of the machines screen: no fetching, no state, no calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUp,
  Boxes,
  Cpu,
  Ellipsis,
  HardDrive,
  Home,
  MemoryStick,
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
  /** Oldest to newest, one sample every 30 s: 20 samples is ten minutes. */
  series: number[]
  /** A second line on the same scale, e.g. writes next to reads. */
  write?: number[]
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
const SAMPLE_SECONDS = 30
const MACHINES: Machine[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    online: true,
    meta: 'Debian 13 · up 12h 40m',
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
        unit: ' GB',
        digits: 1,
        total: '8',
        series: sampleSeries(19, 5.2, 1.1),
      },
      {
        label: 'I/O',
        icon: ArrowUp,
        tone: 'warm',
        unit: ' MB/s',
        digits: 1,
        series: sampleSeries(31, 12, 12),
        write: sampleSeries(43, 4.4, 5),
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
      { label: 'CPU', icon: Cpu, tone: 'accent', unit: '%', digits: 0, series: [] },
      { label: 'RAM', icon: MemoryStick, tone: 'cool', unit: ' GB', digits: 1, total: '8', series: [] },
      { label: 'I/O', icon: ArrowUp, tone: 'warm', unit: ' MB/s', digits: 1, series: [] },
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

const SPARK_WIDTH = 100
const SPARK_HEIGHT = 32

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

/** The headline number of the reading; the qualifier is set small beside it. */
function amount(metric: Metric): string {
  return last(metric.series, metric)
}

/** What sits after the number: a capacity, a second reading, or nothing. */
function qualifier(metric: Metric): string | null {
  if (metric.total) return `/${metric.total}`
  if (metric.write) return `/${last(metric.write, metric)}`
  return null
}

/** The down-up glyph, split into two paths so each direction can carry its colour. */
function IoArrows() {
  return (
    <svg
      className="io-arrows"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="is-read">
        <path d="M7 4v16" />
        <path d="m3 16 4 4 4-4" />
      </g>
      <g className="is-write">
        <path d="M17 20V4" />
        <path d="m13 8 4-4 4 4" />
      </g>
    </svg>
  )
}

function Sparkline({
  series,
  write,
  tone,
  label,
}: {
  series: number[]
  write?: number[]
  tone: Metric['tone']
  label: string
}) {
  const gradientId = useId()
  if (series.length < 2) {
    return (
      <div className="spark is-empty" aria-hidden="true">
        <span className="spark-empty-line" />
      </div>
    )
  }
  // Scale from zero with headroom, so two charts at the same height mean the same
  // thing instead of each one inventing its own drama.
  // One scale for both lines, from zero, so read and write are comparable.
  const high = Math.max(...series, ...(write ?? [])) * 1.15 || 1
  const lineFor = (samples: number[]) =>
    `M ${samples
      .map((value, index) => {
        const x = 2 + (index * (SPARK_WIDTH - 4)) / (samples.length - 1)
        const y = SPARK_HEIGHT - 4 - (value / high) * (SPARK_HEIGHT - 12)
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' L ')}`
  const line = lineFor(series)
  // Straight segments: every one of the 60 samples shows up as its own corner.
  const writeLine = write ? lineFor(write) : null
  return (
    <svg
      className={`spark is-${tone}`}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={`fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop className="spark-stop" offset="0" stopOpacity="0.28" />
          <stop className="spark-stop" offset="1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className="spark-area"
        d={`${line} L ${SPARK_WIDTH} ${SPARK_HEIGHT} L 0 ${SPARK_HEIGHT} Z`}
        fill={`url(#fill-${gradientId})`}
      />
      <g className="spark-grid" aria-hidden="true">
        {[0.25, 0.5, 0.75, 1].map((share) => (
          <line
            key={share}
            x1="0"
            y1={SPARK_HEIGHT - 4 - share * (SPARK_HEIGHT - 12)}
            x2={SPARK_WIDTH}
            y2={SPARK_HEIGHT - 4 - share * (SPARK_HEIGHT - 12)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* one line per 30 s sample interval: twenty divisions across ten minutes */}
        {Array.from({ length: WINDOW_SAMPLES - 1 }, (_, index) => {
          const x = (SPARK_WIDTH / WINDOW_SAMPLES) * (index + 1)
          return <line key={x} className="is-tick" x1={x} y1="0" x2={x} y2={SPARK_HEIGHT - 4} vectorEffect="non-scaling-stroke" />
        })}
      </g>
      <line
        className="spark-base"
        x1="0"
        y1={SPARK_HEIGHT - 4}
        x2={SPARK_WIDTH}
        y2={SPARK_HEIGHT - 4}
        vectorEffect="non-scaling-stroke"
      />
      <path className={`spark-line${writeLine ? ' is-read' : ''}`} d={line} vectorEffect="non-scaling-stroke" />
      {writeLine && <path className="spark-line is-write" d={writeLine} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

function Card({ machine }: { machine: Machine }) {
  const offline = !machine.online
  return (
    <article className={`card${offline ? ' is-offline' : ''}`} aria-label={machine.name}>
      <header className="card-head">
        <div className="card-identity">
          <h2>{machine.name}</h2>
          <p className="meta">{machine.meta}</p>
        </div>
        <div className="card-aside">
          <span className={`pill is-${machine.online ? 'online' : 'offline'}`}>
            <span className="pill-dot" aria-hidden="true" />
            {machine.online ? 'online' : 'offline'}
          </span>
          <div
            className="disk"
            role="img"
            aria-label={`Storage ${machine.storage.used} of ${machine.storage.total}, ${machine.storage.percent} percent`}
          >
            <span className="disk-label">
              <HardDrive size={13} className="is-accent" />
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
        </div>
      </header>

      <div className="metrics">
        {machine.metrics.map((metric) => (
          <div key={metric.label} className="metric">
            <span className="metric-label">
              {metric.write ? (
                <IoArrows />
              ) : (
                <metric.icon size={13} className={`is-${metric.tone}`} />
              )}
              {metric.label}
              <span className="metric-unit">{metric.unit.trim()}</span>
            </span>
            <strong className="metric-value">
              {amount(metric)}
              {metric.series.length > 0 && qualifier(metric) && (
                <span className="metric-unit">{qualifier(metric)}</span>
              )}
            </strong>
            <Sparkline
              series={metric.series}
              write={metric.write}
              tone={metric.tone}
              label={`${metric.label}, last 10 minutes, one sample every ${SAMPLE_SECONDS} s, now ${amount(
                metric,
              )}${metric.unit}${metric.total ? ` of ${metric.total}${metric.unit}` : ''}${
                metric.write ? `, write ${last(metric.write, metric)}${metric.unit}` : ''
              }`}
            />
            {offline && <span className="metric-note">no data</span>}
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
