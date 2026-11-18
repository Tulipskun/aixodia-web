//! A static mock of the machines screen: no fetching, no state, no calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownUp,
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
  /** Turned into "used / total" for readings that have a capacity. */
  total?: string
  /** Oldest to newest, one sample every 10 s: 60 samples is ten minutes. */
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

const SAMPLE_SECONDS = 10
const WINDOW_SAMPLES = 60
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
        total: '8 GB',
        series: sampleSeries(19, 5.2, 1.1),
      },
      {
        label: 'I/O',
        icon: ArrowDownUp,
        tone: 'warm',
        unit: ' MB/s',
        digits: 1,
        series: sampleSeries(31, 12, 14),
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
      { label: 'RAM', icon: MemoryStick, tone: 'cool', unit: ' GB', digits: 1, total: '8 GB', series: [] },
      { label: 'I/O', icon: ArrowDownUp, tone: 'warm', unit: ' MB/s', digits: 1, series: [] },
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

/** One reading, in the machine's units. */
function reading(metric: Metric, value: number): string {
  const rounded = value.toFixed(metric.digits)
  return metric.total ? `${rounded} / ${metric.total}` : `${rounded}${metric.unit}`
}

/** A table cell: the number and its own unit, never the capacity again. */
function cell(metric: Metric, value: number): string {
  return `${value.toFixed(metric.digits)}${metric.unit}`
}

/** The reading without its unit; the unit is set small beside it. */
function amount(metric: Metric): string {
  return metric.series.length ? metric.series[metric.series.length - 1].toFixed(metric.digits) : '—'
}

function unit(metric: Metric): string {
  return metric.total ? ` / ${metric.total}` : metric.unit
}

function Sparkline({ series, tone, label }: { series: number[]; tone: Metric['tone']; label: string }) {
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
  const high = Math.max(...series) * 1.15 || 1
  const step = (SPARK_WIDTH - 4) / (series.length - 1)
  const points = series.map((value, index) => {
    const x = 2 + index * step
    const y = SPARK_HEIGHT - 4 - (value / high) * (SPARK_HEIGHT - 12)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  // Straight segments: every one of the 60 samples shows up as its own corner.
  const line = `M ${points.join(' L ')}`
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
      <line
        className="spark-base"
        x1="0"
        y1={SPARK_HEIGHT - 4}
        x2={SPARK_WIDTH}
        y2={SPARK_HEIGHT - 4}
        vectorEffect="non-scaling-stroke"
      />
      <path className="spark-line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function RangeTable({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="range-block">
      <p className="range-caption">last 10 min · 1 sample / {SAMPLE_SECONDS} s</p>
      <table className="range">
        <thead>
          <tr>
            <th scope="col">metric</th>
            <th scope="col">min</th>
            <th scope="col">avg</th>
            <th scope="col">max</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => {
            const cells = metric.series.length
              ? [
                  Math.min(...metric.series),
                  metric.series.reduce((sum, value) => sum + value, 0) / metric.series.length,
                  Math.max(...metric.series),
                ].map((value) => cell(metric, value))
              : ['—', '—', '—']
            return (
              <tr key={metric.label}>
                <th scope="row">
                  <span className="range-label">
                    <metric.icon size={13} />
                    {metric.label}
                  </span>
                </th>
                {cells.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
              <HardDrive size={13} />
              disk
            </span>
            <span className="disk-value">
              {machine.storage.used}
              {machine.storage.total ? ` / ${machine.storage.total}` : ''}
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
              <metric.icon size={13} />
              {metric.label}
            </span>
            <strong className="metric-value">
              {amount(metric)}
              {metric.series.length > 0 && <span className="metric-unit">{unit(metric)}</span>}
            </strong>
            <Sparkline
              series={metric.series}
              tone={metric.tone}
              label={`${metric.label}, last 10 minutes, now ${reading(metric, Number(amount(metric)))}`}
            />
            {offline && <span className="metric-note">no data</span>}
          </div>
        ))}
      </div>

      <RangeTable metrics={machine.metrics} />

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
