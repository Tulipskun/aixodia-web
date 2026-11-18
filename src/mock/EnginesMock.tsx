//! A static mock of the machines screen: no fetching, no state, no calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import { Boxes, Ellipsis, Home, Menu, MonitorSmartphone, Sparkles, SquareTerminal } from 'lucide-react'

interface Chart {
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
  subtitle: string
  charts: Chart[]
  storage: Storage
}

const MACHINES: Machine[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    online: true,
    version: 'v1.177',
    subtitle: 'Debian 13 · x86_64 · up 12h 40m',
    charts: [
      {
        label: 'CPU',
        value: '50%',
        tone: 'accent',
        series: [18, 26, 22, 41, 38, 52, 44, 61, 47, 39, 55, 50, 46, 58, 50],
      },
      {
        label: 'RAM',
        value: '5 / 8 GB',
        tone: 'cool',
        series: [40, 42, 45, 44, 48, 51, 50, 54, 57, 56, 59, 60, 58, 61, 62],
      },
      {
        label: 'I/O',
        value: '12.4 MB/s',
        tone: 'warm',
        series: [4, 9, 3, 14, 22, 8, 5, 18, 26, 11, 7, 19, 12, 6, 13],
      },
    ],
    storage: { used: '164', total: '256 GB', percent: 64 },
  },
  {
    id: 'beta',
    name: 'Beta',
    online: false,
    version: 'v1.170',
    subtitle: 'Last seen 4h ago',
    charts: [
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

const CHART_WIDTH = 100
const CHART_HEIGHT = 34

function Sparkline({ series, tone }: { series: number[]; tone: Chart['tone'] }) {
  if (series.length < 2) {
    return <div className="spark is-empty" aria-hidden="true" />
  }
  const high = Math.max(...series)
  const low = Math.min(...series)
  const span = high - low || 1
  const step = CHART_WIDTH / (series.length - 1)
  const points = series.map((value, index) => {
    const x = index * step
    // A little headroom above and below keeps the line off the edges.
    const y = CHART_HEIGHT - 3 - ((value - low) / span) * (CHART_HEIGHT - 6)
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${CHART_HEIGHT} ${line} ${CHART_WIDTH},${CHART_HEIGHT}`
  return (
    <svg
      className={`spark is-${tone}`}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon className="spark-area" points={area} />
      <polyline className="spark-line" points={line} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Card({ machine }: { machine: Machine }) {
  const offline = !machine.online
  return (
    <article className={`card${offline ? ' is-offline' : ''}`} aria-label={machine.name}>
      <header className="card-head">
        <div className="card-title">
          <h2>{machine.name}</h2>
          <p>{machine.subtitle}</p>
        </div>
        <span className={`pill is-${machine.online ? 'online' : 'offline'}`}>
          <span className="pill-dot" />
          {machine.online ? 'online' : 'offline'}
        </span>
      </header>

      <div className="charts">
        {machine.charts.map((chart) => (
          <div key={chart.label} className="chart">
            <span className="chart-label">{chart.label}</span>
            <Sparkline series={chart.series} tone={chart.tone} />
            <strong className="chart-value">{chart.value}</strong>
          </div>
        ))}
      </div>

      <div className="storage">
        <div className="storage-head">
          <span className="chart-label">Storage</span>
          <span className="storage-value">
            {machine.storage.used}
            {machine.storage.total ? ` / ${machine.storage.total}` : ''}
          </span>
        </div>
        <div className="bar" role="img" aria-label={`Storage ${machine.storage.percent}%`}>
          <span className="bar-fill" style={{ width: `${machine.storage.percent}%` }} />
        </div>
      </div>

      <div className="actions">
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`action${id === 'ai' ? ' is-primary' : ''}`}
            disabled={offline}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <footer className="card-foot">
        <span>{machine.version}</span>
        {machine.online && <span className="foot-live">live</span>}
      </footer>
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
