//! A static mock of the machines screen: no fetching, no calls. The only state is
//! whether the drawer is open and, while a pointer is down, how far it has been
//! dragged.
//!
//! It exists so the shape of the screen can be argued about before any of it is
//! wired to the registry. Everything below is a literal.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BatteryMedium,
  Boxes,
  Cpu,
  Eye,
  Ellipsis,
  HardDrive,
  MemoryStick,
  Menu,
  MonitorSmartphone,
  MousePointerClick,
  RotateCw,
  Smartphone,
  Sparkles,
  SquareTerminal,
  Trash2,
} from 'lucide-react'

interface Metric {
  label: string
  icon: LucideIcon
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
        unit: '%',
        digits: 0,
        series: sampleSeries(7, 46, 26),
      },
      {
        label: 'RAM',
        icon: MemoryStick,
        unit: 'GB',
        digits: 1,
        total: '128',
        series: sampleSeries(19, 100.4, 1.6),
      },
      {
        label: 'DISK',
        icon: HardDrive,
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
    metrics: [
      { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: [] },
      { label: 'RAM', icon: MemoryStick, unit: 'GB', digits: 1, total: '128', series: [] },
      { label: 'DISK', icon: HardDrive, unit: 'GB', digits: 1, total: '256', series: [] },
    ],
  },
]

const ACCOUNT = 'Tulipskun'

/* A sideways drag anywhere on the page opens the drawer, and one headed left
   anywhere closes it again. Both commit on distance or on speed, so a short flick
   counts. */
/* The panel takes 220ms to leave, so the list starts after it is mostly gone. */
const ENTER_DELAY = 100
const ENTER_STEP = 80

const COMMIT = 72
const FLICK = 0.35

/* How a drag is told apart from a scroll, the way react-native-gesture-handler
   asks for it: a pan activates at ±10px across and fails at ±5px up or down.
   Whichever line the finger crosses first decides — two to one, about 26°. */
const ACTIVATE_X = 10
const FAIL_Y = 5

interface Drag {
  startX: number
  startY: number
  startedAt: number
  fromOpen: boolean
  width: number
  dx: number
  /* False while the gesture is still undecided: it is only the drawer's once the
     finger has crossed the across line without crossing the up-or-down one. */
  active: boolean
}

/* The phones DroidIME runs on: the same card, read as a device rather than a
   server. */
const DEVICES: Machine[] = [
  {
    id: 'pixel-8',
    name: 'Pixel 8',
    online: true,
    meta: 'tunnel live 2m ago',
    metrics: [
      { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: sampleSeries(31, 24, 12) },
      {
        label: 'RAM',
        icon: MemoryStick,
        unit: 'GB',
        digits: 1,
        total: '8',
        series: sampleSeries(53, 5.2, 0.3),
      },
      { label: 'BATTERY', icon: BatteryMedium, unit: '%', digits: 0, series: sampleSeries(88, 86, 2) },
    ],
  },
  {
    id: 'pixel-4a',
    name: 'Pixel 4a',
    online: false,
    meta: 'last seen 2d ago',
    metrics: [
      { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: [] },
      { label: 'RAM', icon: MemoryStick, unit: 'GB', digits: 1, total: '6', series: [] },
      { label: 'BATTERY', icon: BatteryMedium, unit: '%', digits: 0, series: [] },
    ],
  },
]

type Screen = 'engines' | 'droidime' | 'terminal'

/** The screens that are a list of cards. A terminal is one session, not a list. */
type ListedScreen = Exclude<Screen, 'terminal'>

type ScreenInfo =
  | { id: ListedScreen; title: string; count: string; machines: Machine[] }
  /* A terminal has no list to head and no count to state: the panel is the
     screen, and the instance id is already written in its transcript. */
  | { id: 'terminal'; machines: null }

const SCREENS: ScreenInfo[] = [
  { id: 'engines', title: 'Engines', count: `${MACHINES.length} engines`, machines: MACHINES },
  { id: 'droidime', title: 'Droidime', count: `${DEVICES.length} devices`, machines: DEVICES },
  /* A terminal belongs to one engine, so the right of the heading names it. */
  { id: 'terminal', machines: null },
]

const DRAWER: { id: Screen; label: string; icon: LucideIcon }[] = [
  { id: 'engines', label: 'Engines', icon: Boxes },
  { id: 'droidime', label: 'Droidime', icon: Smartphone },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
]

/* The keys a phone keyboard does not have, in the app's two rows: what a shell
   needs and a phone does not offer. The typing itself stays the phone's keyboard,
   which already knows every language the phone does. */
const KEY_ROWS: string[][] = [
  ['Esc', 'Tab', 'CMD', 'PgUp', '↑', 'PgDn', 'trash'],
  ['Ctrl', 'Shift', 'Alt', '←', '↓', '→', 'reload'],
]

/* A modifier is held for one key. CMD is not one of them: it is the shortcut the
   app binds to ctrl+p, and it sends that itself. */
const MODIFIERS = ['Ctrl', 'Shift', 'Alt']
const CMD = 'ctrl+p'

/* What a shell on the engine has to say. The lines are literal: the lease and the
   instance id are what the engine actually reports. */
interface Line {
  kind: 'cmd' | 'out' | 'note' | 'sent'
  text: string
}

const TRANSCRIPT: Line[] = [
  { kind: 'cmd', text: 'aixodia status' },
  { kind: 'out', text: 'engine   m-8a7d1192 · v1.177' },
  { kind: 'out', text: 'lease    3s ago · ttl 60s' },
  { kind: 'cmd', text: 'aixodia lease' },
  { kind: 'out', text: 'writer   engine · every 20s' },
  { kind: 'out', text: 'reader   gateway · every 10s' },
  { kind: 'cmd', text: 'curl -s engine/healthz' },
  { kind: 'note', text: '{"ok":true,"ms":0.7}' },
  { kind: 'cmd', text: 'tail -n 2 aeo.ndjson' },
  { kind: 'note', text: '{"t":"run","ok":true,"ms":41}' },
  { kind: 'note', text: '{"t":"beat","ok":true}' },
]

/* Each screen offers what that thing can actually do: a server is opened, a phone
   is driven. */
const ACTIONS: Record<ListedScreen, { id: string; label: string; icon: LucideIcon }[]> = {
  engines: [
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'screen', label: 'Screen', icon: MonitorSmartphone },
    { id: 'more', label: 'More', icon: Ellipsis },
  ],
  /* A phone is watched or driven, nothing else: two ways to see its screen. */
  droidime: [
    { id: 'view', label: 'View screen', icon: Eye },
    { id: 'control', label: 'Control screen', icon: MousePointerClick },
  ],
}

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
function Spark({ values, ceiling }: { values: number[]; ceiling: number }) {
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
      className="metric-spark"
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

function Card({
  machine,
  screen,
  index,
  onTerminal,
}: {
  machine: Machine
  screen: ListedScreen
  /* Cards arrive in order when the screen changes, so the switch is felt as a
     change of screen rather than as text being swapped in place. */
  index: number
  onTerminal: () => void
}) {
  const offline = !machine.online
  return (
    <article
      className={`card${offline ? ' is-offline' : ''}`}
      /* The card's start time is also its parts' reference point: the name, the
         readings and the actions follow it in that order. */
      style={
        {
          animationDelay: `${ENTER_DELAY + index * ENTER_STEP}ms`,
          '--enter': `${ENTER_DELAY + index * ENTER_STEP}ms`,
        } as CSSProperties
      }
      aria-label={machine.name}
    >
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
            />
            <span className="metric-label">
              <metric.icon size={13} aria-hidden="true" />
              {metric.label}
            </span>
            <strong className="metric-value">
              {reading(metric).value}
              {reading(metric).unit && <span className="metric-unit">{reading(metric).unit}</span>}
            </strong>
          </div>
        ))}
      </div>

      <div className={`actions${ACTIONS[screen].length === 2 ? ' is-pair' : ''}`}>
        {ACTIONS[screen].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="action"
            disabled={offline}
            /* The one action that has a screen behind it goes there. */
            onClick={id === 'terminal' ? onTerminal : undefined}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </article>
  )
}

function Terminal() {
  /* Typing and keys only add to this screen's own transcript: nothing is sent
     anywhere, and a reload starts it over. */
  const [lines, setLines] = useState<Line[]>([])
  const [wiped, setWiped] = useState(false)
  const [draft, setDraft] = useState('')
  /* A modifier applies to the next key only, the way a physical chord works. */
  const [held, setHeld] = useState<string[]>([])
  const logRef = useRef<HTMLPreElement>(null)

  const chord = held.map((key) => key.toLowerCase()).join('+')
  const transcript = wiped ? [] : TRANSCRIPT

  useEffect(() => {
    /* A terminal keeps its newest line in view. */
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [lines, wiped])

  const sendKey = (key: string) => {
    setLines((sent) => [...sent, { kind: 'sent', text: `· ${chord ? `${chord}+` : ''}${key}` }])
    setHeld([])
  }

  const toggle = (key: string) =>
    setHeld((on) => (on.includes(key) ? on.filter((name) => name !== key) : [...on, key]))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const command = draft.trim()
    if (!command) return
    setLines((sent) => [...sent, { kind: 'cmd', text: command }])
    setDraft('')
    setWiped(false)
  }

  /* Trash empties the screen: everything printed, base transcript included. */
  const clearAll = () => {
    setLines([])
    setWiped(true)
    setHeld([])
  }

  /* Reset replaces the shell, so the screen starts again from a prompt — the same
     thing `exec $SHELL` does to a live session. */
  const restart = () => {
    setLines([{ kind: 'cmd', text: 'exec $SHELL' }])
    setWiped(true)
    setHeld([])
  }

  return (
    <section className="terminal" aria-label="Terminal">
      <pre className="terminal-log" ref={logRef}>
        {[...transcript, ...lines].map(({ kind, text }, index) => (
          <span key={`${index}-${text}`} className={`terminal-line is-${kind}`}>
            {kind === 'cmd' ? (
              <>
                {/* Real spaces, not margins: what is copied out of the log is a
                    prompt and a command, not three words run together. */}
                <span className="terminal-user">root</span>{' '}
                <span className="terminal-cwd">~</span>{' '}
                <span className="terminal-mark">$</span> <span>{text}</span>
              </>
            ) : (
              text
            )}
          </span>
        ))}
      </pre>

      <div className="terminal-bar">
        {/* An input, so tapping it raises the phone's own keyboard: every language
            and every layout already lives there. The prompt sits outside the field,
            the way the app draws it. */}
        <div className="terminal-composer" data-no-drag>
          <SquareTerminal className="terminal-composer-mark" size={16} aria-hidden="true" />
          <form className="terminal-field" onSubmit={submit}>
            <input
              className="terminal-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={held.length ? 'key for the chord…' : 'Type a command…'}
              aria-label="Command"
              enterKeyHint="send"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </form>
        </div>

        {KEY_ROWS.map((row) => (
          <div className="terminal-keys" key={row.join()} data-no-drag>
            {row.map((key) => {
              const isModifier = MODIFIERS.includes(key)
              const on = held.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  className={`terminal-key${on ? ' is-held' : ''}`}
                  aria-pressed={isModifier ? on : undefined}
                  aria-label={key === 'trash' ? 'Clear' : key === 'reload' ? 'Reset' : key}
                  onClick={() => {
                    if (isModifier) toggle(key)
                    else if (key === 'CMD') sendKey(CMD)
                    else if (key === 'trash') clearAll()
                    else if (key === 'reload') restart()
                    else sendKey(key)
                  }}
                >
                  {key === 'trash' ? (
                    <Trash2 size={14} aria-hidden="true" />
                  ) : key === 'reload' ? (
                    <RotateCw size={14} aria-hidden="true" />
                  ) : (
                    key
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

function Drawer({
  open,
  onClose,
  screen,
  onScreen,
  drag,
  panelRef,
}: {
  open: boolean
  /* The panel carries no close button: the bar above it is never covered, so the
     menu button is the close button. Only the scrim closes it from here. */
  onClose: () => void
  screen: Screen
  onScreen: (next: Screen) => void
  drag: Drag | null
  panelRef: React.RefObject<HTMLElement>
}) {
  /* While a pointer is down the panel follows it instead of the class, so the
     gesture reads as dragging the panel rather than waiting for it to appear. */
  const offset = drag ? (drag.fromOpen ? Math.min(0, drag.dx) : Math.min(0, drag.dx - drag.width)) : null

  useEffect(() => {
    /* Sliding the panel off screen leaves its buttons reachable by Tab, which puts
       the pointer nowhere near where the keyboard thinks it is. While closed the
       panel is inert, so it is skipped. */
    panelRef.current?.toggleAttribute('inert', !open)
  }, [open, panelRef])

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
        <nav className="drawer-list">
          {DRAWER.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`drawer-item${id === screen ? ' is-current' : ''}`}
              aria-current={id === screen ? 'page' : undefined}
              onClick={() => {
                onScreen(id)
                onClose()
              }}
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
  const [screenId, setScreenId] = useState<Screen>('engines')
  const screen = SCREENS.find((entry) => entry.id === screenId) ?? SCREENS[0]
  const [drag, setDrag] = useState<Drag | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  /* The native touch listeners outlive a render, so the gesture reads from a ref
     and only the render values come from state. */
  const dragRef = useRef<Drag | null>(null)

  const hold = (next: Drag | null) => {
    dragRef.current = next
    /* An undecided gesture moves nothing on screen. */
    setDrag(next?.active ? next : null)
  }

  const begin = (target: EventTarget | null, clientX: number, clientY: number) => {
    if (dragRef.current) return false
    /* A sideways drag is the drawer's — except inside something that scrolls
       sideways itself, or a field where a drag selects text. */
    if (target instanceof Element && target.closest('[data-no-drag]')) return false
    const width = panelRef.current?.getBoundingClientRect().width
    if (!width) return false
    hold({
      startX: clientX,
      startY: clientY,
      startedAt: performance.now(),
      fromOpen: menuOpen,
      width,
      dx: 0,
      active: false,
    })
    return true
  }

  /* Two lines, and whichever the finger crosses first wins: across by 10px makes
     this the drawer's gesture, up or down by 5px gives it to the page. Once it is
     the drawer's, vertical drift no longer takes it back — the finger already said
     what it meant. */
  const follow = (clientX: number, clientY: number) => {
    const current = dragRef.current
    if (!current) return
    const dx = clientX - current.startX
    const dy = clientY - current.startY
    if (!current.active) {
      if (Math.abs(dy) >= FAIL_Y) {
        hold(null)
        return
      }
      if (Math.abs(dx) < ACTIVATE_X) return
      hold({ ...current, active: true, dx })
      return
    }
    hold({ ...current, dx })
  }

  const settle = () => {
    const current = dragRef.current
    if (!current) return
    if (!current.active) {
      hold(null)
      return
    }
    /* Distance travelled towards the commit, and how fast it went there. */
    const travelled = current.fromOpen ? -current.dx : current.dx
    const speed = travelled / Math.max(16, performance.now() - current.startedAt)
    const move = travelled > COMMIT || speed > FLICK
    setMenuOpen(current.fromOpen ? !move : move)
    hold(null)
  }

  /* The whole page drags, so the listeners sit on the document: on a wide screen
     the app is a column in the middle and the page around it is just as much part
     of the screen. Mouse and pen use pointer events; touch can't, because Chrome
     cancels the pointer the moment its own gesture detection engages, so the
     touch stream is read directly and the moves it claims are prevented (the one
     listener that has to be non-passive). */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return
      begin(event.target, event.clientX, event.clientY)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      follow(event.clientX, event.clientY)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      settle()
    }

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      begin(event.target, touch.clientX, touch.clientY)
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch || !dragRef.current) return
      follow(touch.clientX, touch.clientY)
      /* Only a gesture the drawer has claimed is prevented: everything else stays
         the page's to scroll. */
      if (dragRef.current?.active) event.preventDefault()
    }
    const onTouchEnd = () => settle()

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', () => hold(null))
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [menuOpen])

  return (
    <div
      ref={shellRef}
      className={`shell${drag ? ' is-dragging' : ''}${screen.machines ? '' : ' is-full'}`}
    >
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header className="topbar">
        <button
          type="button"
          className="icon-button"
          aria-label={menuOpen ? 'Close menu' : 'Menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((wasOpen) => !wasOpen)}
        >
          <Menu size={18} />
        </button>
        <div className="brand">
          <img className="brand-mark" src="/brand/aixodia-mark.svg" alt="" width={22} height={22} />
          <span className="brand-name">AIxodia</span>
        </div>
      </header>

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        screen={screenId}
        onScreen={setScreenId}
        drag={drag}
        panelRef={panelRef}
      />

      <main className="screen" id="content" tabIndex={-1}>
        {/* A list says what it is before it lists anything; a terminal already says
            it in its own head, so it gets the whole screen instead. */}
        {screen.machines && (
          <div className="screen-head">
            {/* Keyed by screen, so the heading is a new element on a switch and its
                entrance runs with the cards instead of the text swapping in place. */}
            <h1 key={screen.id}>{screen.title}</h1>
            <span key={`${screen.id}-count`} className="screen-count">
              {screen.count}
            </span>
          </div>
        )}

        {screen.machines ? (
          screen.machines.map((machine, index) => (
            <Card
              key={machine.id}
              machine={machine}
              screen={screen.id}
              index={index}
              onTerminal={() => setScreenId('terminal')}
            />
          ))
        ) : (
          <Terminal key={screen.id} />
        )}
      </main>

    </div>
  )
}
