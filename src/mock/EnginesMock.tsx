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
  /** Oldest to newest, one sample every 30 s: 20 samples is ten minutes. The card
   *  reads the last one; the series stays because the registry will send a window. */
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
        unit: ' GB',
        digits: 0,
        total: '128',
        series: sampleSeries(19, 100.4, 1.6),
      },
      {
        label: 'DISK',
        icon: HardDrive,
        tone: 'warm',
        unit: ' GB',
        digits: 0,
        total: '256',
        series: Array.from({ length: WINDOW_SAMPLES }, () => 164),
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
      { label: 'RAM', icon: MemoryStick, tone: 'cool', unit: ' GB', digits: 1, total: '128', series: [] },
      { label: 'DISK', icon: HardDrive, tone: 'warm', unit: ' GB', digits: 0, total: '256', series: [] },
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

/** The AIxodia mark: a lit core inside two rings, with agents running the lanes
 *  around it. Colours come from the palette, so it sits in the theme rather than on
 *  top of it. */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="brand-mark-core" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="var(--info)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <circle className="mark-disc" cx="256" cy="256" r="210" />
      <circle className="mark-inner" cx="256" cy="256" r="104" />
      <path
        className="mark-core"
        d="M 247.47 215.38 Q 256.00 198.00 264.53 215.38 L 273.44 233.53 Q 275.09 236.91 278.47 238.56 L 296.62 247.47 Q 314.00 256.00 296.62 264.53 L 278.47 273.44 Q 275.09 275.09 273.44 278.47 L 264.53 296.62 Q 256.00 314.00 247.47 296.62 L 238.56 278.47 Q 236.91 275.09 233.53 273.44 L 215.38 264.53 Q 198.00 256.00 215.38 247.47 L 233.53 238.56 Q 236.91 236.91 238.56 233.53 Z"
      />
      <g className="mark-agents">
        <path
          className="is-lead"
          d="M 251.40 76.68 Q 256.00 68.00 260.60 76.68 L 277.50 108.60 Q 283.00 119.00 271.90 115.10 L 257.06 109.87 Q 256.00 109.50 254.94 109.87 L 240.10 115.10 Q 229.00 119.00 234.50 108.60 Z"
        />
        <path d="M 425.12 196.22 Q 434.80 197.90 427.96 204.96 L 402.82 230.90 Q 394.64 239.34 394.92 227.58 L 395.30 211.85 Q 395.33 210.73 394.65 209.83 L 385.09 197.33 Q 377.95 187.99 389.54 190.01 Z" />
        <path d="M 365.12 398.37 Q 366.50 408.10 357.68 403.77 L 325.25 387.88 Q 314.68 382.71 325.95 379.34 L 341.03 374.84 Q 342.11 374.52 342.75 373.59 L 351.69 360.65 Q 358.37 350.97 360.03 362.61 Z" />
        <path d="M 154.32 403.77 Q 145.50 408.10 146.88 398.37 L 151.97 362.61 Q 153.63 350.97 160.31 360.65 L 169.25 373.59 Q 169.89 374.52 170.97 374.84 L 186.05 379.34 Q 197.32 382.71 186.75 387.88 Z" />
        <path d="M 84.04 204.96 Q 77.20 197.90 86.88 196.22 L 122.46 190.01 Q 134.05 187.99 126.91 197.33 L 117.35 209.83 Q 116.67 210.73 116.70 211.85 L 117.08 227.58 Q 117.36 239.34 109.18 230.90 Z" />
      </g>
    </svg>
  )
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
            aria-label={`${metric.label}, ${reading(metric).value}${reading(metric).unit}`}
          >
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
          <BrandMark />
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
