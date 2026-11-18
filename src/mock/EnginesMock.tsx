//! A static mock of the machines screen: no fetching, no state, no calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

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
    meta: 'Debian 13 · x86_64 · up 12h 40m',
    metrics: [
      {
        label: 'CPU',
        value: '50%',
        tone: 'accent',
        series: [18, 30, 24, 44, 38, 57, 46, 39, 58, 48, 53, 50],
      },
      {
        label: 'RAM',
        value: '5 / 8 GB',
        tone: 'cool',
        series: [40, 43, 45, 47, 50, 52, 55, 57, 56, 59, 61, 62],
      },
      {
        label: 'I/O',
        value: '12.4 MB/s',
        tone: 'warm',
        series: [6, 11, 4, 17, 24, 9, 6, 20, 26, 12, 8, 14],
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
const SPARK_HEIGHT = 28

function Sparkline({ series, tone, label }: { series: number[]; tone: Metric['tone']; label: string }) {
  if (series.length < 2) return <div className="spark is-empty" aria-hidden="true" />
  const high = Math.max(...series)
  const low = Math.min(...series)
  const span = high - low || 1
  const step = SPARK_WIDTH / (series.length - 1)
  const points = series.map((value, index) => {
    const y = SPARK_HEIGHT - 3 - ((value - low) / span) * (SPARK_HEIGHT - 8)
    return `${(index * step).toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg
      className={`spark is-${tone}`}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polygon className="spark-area" points={`0,${SPARK_HEIGHT} ${points.join(' ')} ${SPARK_WIDTH},${SPARK_HEIGHT}`} />
      <polyline className="spark-line" points={points.join(' ')} vectorEffect="non-scaling-stroke" />
      <line
        className="spark-base"
        x1="0"
        y1={SPARK_HEIGHT - 0.5}
        x2={SPARK_WIDTH}
        y2={SPARK_HEIGHT - 0.5}
        vectorEffect="non-scaling-stroke"
      />
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
        <span className={`pill is-${machine.online ? 'online' : 'offline'}`}>
          <span className="pill-dot" aria-hidden="true" />
          {machine.online ? 'online' : 'offline'}
        </span>
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

      <div className="storage">
        <span className="metric-label">Storage</span>
        <span className="storage-value">
          {machine.storage.used}
          {machine.storage.total ? ` / ${machine.storage.total}` : ''}
        </span>
        <div className="bar" role="img" aria-label={`Storage ${machine.storage.percent} percent`}>
          <span className="bar-fill" style={{ width: `${machine.storage.percent}%` }} />
        </div>
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
