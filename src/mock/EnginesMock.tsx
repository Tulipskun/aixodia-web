//! A static mock of the engines screen: no fetching, no state, no engine calls.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import {
  Boxes,
  Ellipsis,
  Menu,
  MonitorSmartphone,
  Server,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'

interface Gauge {
  label: string
  value: string
  /** 0–100; what the ring fills to. */
  percent: number
  tone?: 'accent' | 'warm' | 'cool'
}

interface EngineCard {
  id: string
  name: string
  online: boolean
  version: string
  subtitle: string
  gauges: Gauge[]
  note?: string
}

const ENGINES: EngineCard[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    online: true,
    version: 'v1.177',
    subtitle: 'Debian 13 · x86_64 · up 12h 40m',
    gauges: [
      { label: 'CPU', value: '50%', percent: 50, tone: 'accent' },
      { label: 'RAM', value: '5 / 8 GB', percent: 62, tone: 'cool' },
      { label: 'Storage', value: '164 / 256 GB', percent: 64, tone: 'warm' },
      { label: 'I/O', value: '12.4 MB/s', percent: 25, tone: 'accent' },
    ],
  },
  {
    id: 'beta',
    name: 'Beta',
    online: false,
    version: 'v1.170',
    subtitle: 'Last seen 4h ago',
    gauges: [
      { label: 'CPU', value: '—', percent: 0 },
      { label: 'RAM', value: '—', percent: 0 },
      { label: 'Storage', value: '—', percent: 0 },
      { label: 'I/O', value: '—', percent: 0 },
    ],
  },
]

const ACTIONS = [
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'screen', label: 'Screen', icon: MonitorSmartphone },
  { id: 'more', label: 'More', icon: Ellipsis },
] as const

function Ring({ percent, tone }: { percent: number; tone?: Gauge['tone'] }) {
  // A hollow ring, one stroke, drawn on a 44px box so the centre label sits in
  // the middle of the arc rather than beside it.
  const radius = 19
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(100, percent)) / 100
  return (
    <svg className={`mock-ring is-${tone ?? 'dim'}`} viewBox="0 0 44 44" aria-hidden="true">
      <circle className="mock-ring-track" cx="22" cy="22" r={radius} />
      <circle
        className="mock-ring-fill"
        cx="22"
        cy="22"
        r={radius}
        strokeDasharray={`${circumference * filled} ${circumference}`}
        transform="rotate(-90 22 22)"
      />
    </svg>
  )
}

function EnginePanel({ engine }: { engine: EngineCard }) {
  const offline = !engine.online
  return (
    <article className={`mock-engine${offline ? ' is-offline' : ''}`} aria-label={`${engine.name} engine`}>
      <header className="mock-engine-head">
        <div className="mock-engine-title">
          <h2>{engine.name}</h2>
          <p>{engine.subtitle}</p>
        </div>
        <span className={`mock-state is-${engine.online ? 'online' : 'offline'}`}>
          <span className="mock-state-dot" />
          {engine.online ? 'online' : 'offline'}
        </span>
      </header>

      <ul className="mock-gauges">
        {engine.gauges.map((gauge) => (
          <li key={gauge.label} className="mock-gauge">
            <Ring percent={gauge.percent} tone={gauge.tone} />
            <span className="mock-gauge-label">{gauge.label}</span>
            <strong className="mock-gauge-value">{gauge.value}</strong>
          </li>
        ))}
      </ul>

      <div className="mock-actions">
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`mock-action${id === 'ai' ? ' is-primary' : ''}`}
            disabled={offline}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <footer className="mock-engine-foot">
        <span>{offline ? 'Cannot reach this engine' : engine.version}</span>
        {engine.online && <span className="mock-foot-live">live</span>}
      </footer>
    </article>
  )
}

export function EnginesMock() {
  return (
    <div className="mock-shell">
      <header className="mock-topbar">
        <button type="button" className="mock-icon-button" aria-label="Menu">
          <Menu size={18} />
        </button>
        <div className="mock-brand">
          <span className="mock-brand-name">AIxodia</span>
          <span className="mock-brand-dot" aria-hidden="true" />
        </div>
        <button type="button" className="mock-avatar" aria-label="Account">
          P
        </button>
      </header>

      <main className="mock-screen">
        <div className="mock-screen-head">
          <div>
            <p className="mock-eyebrow">Engines</p>
            <h1>Your phone&apos;s engines</h1>
          </div>
          <span className="mock-chip">mock</span>
        </div>

        <div className="mock-list">
          {ENGINES.map((engine) => (
            <EnginePanel key={engine.id} engine={engine} />
          ))}
        </div>
      </main>

      <nav className="mock-tabbar" aria-label="Sections">
        <button type="button" className="mock-tab is-active" aria-current="page">
          <Server size={17} />
          <span>Engines</span>
        </button>
        <button type="button" className="mock-tab">
          <Boxes size={17} />
          <span>MCP</span>
        </button>
      </nav>
    </div>
  )
}
