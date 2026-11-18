//! A static mock of the machines screen: no fetching, no state, no calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import { useId } from 'react'
import { Boxes, Ellipsis, Home, Menu, MonitorSmartphone, Sparkles, SquareTerminal } from 'lucide-react'

interface Metric {
  label: string
  value: string
  /** Oldest to newest; the chart is scaled to its own range. */
  series: number[]
  tone: 'accent' | 'cool' | 'warm'
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
  version: string
  meta: string
  /** Why the controls are unavailable, when they are. */
  reason?: string
  metrics: Metric[]
  storage: Storage
}

const MACHINES: Machine[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    online: true,
    version: 'v1.177',
    meta: 'Debian 13 · up 12h 40m',
    metrics: [
      {
        label: 'CPU',
        value: '50%',
        tone: 'accent',
        series: [20, 32, 26, 44, 39, 57, 47, 52],
      },
      {
        label: 'RAM',
        value: '5 / 8 GB',
        tone: 'cool',
        series: [41, 45, 48, 52, 55, 58, 60, 62],
      },
      {
        label: 'I/O',
        value: '12.4 MB/s',
        tone: 'warm',
        series: [7, 12, 5, 19, 24, 10, 7, 15],
      },
    ],
    storage: { used: '164', total: '256 GB', percent: 64 },
  },
  {
    id: 'beta',
    name: 'Beta',
    online: false,
    version: 'v1.170',
    meta: 'Last seen 4h ago',
    reason: 'Offline since 4h ago',
    metrics: [
      { label: 'CPU', value: '—', tone: 'accent', series: [] },
      { label: 'RAM', value: '—', tone: 'cool', series: [] },
      { label: 'I/O', value: '—', tone: 'warm', series: [] },
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

/** Catmull-Rom through the points, as cubic beziers: a curve, not a zigzag. */
function sparkPath(points: { x: number; y: number }[]): string {
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const before = points[i - 1] ?? points[i]
    const from = points[i]
    const to = points[i + 1]
    const after = points[i + 2] ?? to
    const c1x = from.x + (to.x - before.x) / 8
    const c1y = from.y + (to.y - before.y) / 8
    const c2x = to.x - (after.x - from.x) / 8
    const c2y = to.y - (after.y - from.y) / 8
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
  }
  return d
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
  const points = series.map((value, index) => ({
    x: 2 + (index * (SPARK_WIDTH - 4)) / (series.length - 1),
    y: SPARK_HEIGHT - 4 - (value / high) * (SPARK_HEIGHT - 12),
  }))
  const line = sparkPath(points)
  const last = points[points.length - 1]
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
          <stop className="spark-stop" offset="0" stopOpacity="0.32" />
          <stop className="spark-stop" offset="1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="spark-area" d={`${line} L ${SPARK_WIDTH} ${SPARK_HEIGHT} L 0 ${SPARK_HEIGHT} Z`} fill={`url(#fill-${gradientId})`} />
      <line
        className="spark-base"
        x1="0"
        y1={SPARK_HEIGHT - 4}
        x2={SPARK_WIDTH}
        y2={SPARK_HEIGHT - 4}
        vectorEffect="non-scaling-stroke"
      />
      <path className="spark-line" d={line} vectorEffect="non-scaling-stroke" />
      <circle className="spark-halo" cx={last.x} cy={last.y} r="4" />
      <circle className="spark-tip" cx={last.x} cy={last.y} r="1.8" />
    </svg>
  )
}

function Card({ machine }: { machine: Machine }) {
  const offline = !machine.online
  return (
    <article className={`card${offline ? ' is-offline' : ''}`} aria-label={machine.name}>
      <header className="card-head">
        <div className="card-identity">
          <h2>
            {machine.name}
            <span className="version">{machine.version}</span>
          </h2>
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
            <span className="disk-label">disk</span>
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
            <span className="metric-label">{metric.label}</span>
            <strong className="metric-value">{metric.value}</strong>
            <Sparkline
              series={metric.series}
              tone={metric.tone}
              label={`${metric.label} ${metric.value}`}
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
