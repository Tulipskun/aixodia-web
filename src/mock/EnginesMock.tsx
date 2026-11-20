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
  Keyboard,
  MemoryStick,
  Menu,
  MonitorSmartphone,
  MousePointerClick,
  Plus,
  RotateCw,
  Smartphone,
  Sparkles,
  SquareTerminal,
  Trash2,
  X,
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

/* How a drag is told apart from a scroll, the way Discord's own panel gesture does
   it: the drag is the drawer's once it has moved SLOP px across and that sideways
   travel is larger than the up-or-down travel — a one-to-one ratio, so the line sits
   at forty-five degrees. No angle is measured. */
const SLOP = 4

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

/* The menu's own navigation. A terminal is not on it: a terminal is a session, and
   sessions are the list below. */
const DRAWER: { id: ListedScreen; label: string; icon: LucideIcon }[] = [
  { id: 'engines', label: 'Engines', icon: Boxes },
  { id: 'droidime', label: 'Droidime', icon: Smartphone },
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

/* A tab. Terminals belong to an engine, and a person keeps more than one open, on
   more than one engine, at the same time — so the menu lists sessions, not screens. */
interface Session {
  id: string
  engine: string
  title: string
}

const SESSIONS: Session[] = [
  { id: 's1', engine: 'alpha', title: 'shell 1' },
  { id: 's2', engine: 'alpha', title: 'shell 2' },
  { id: 's3', engine: 'beta', title: 'logs' },
]

/* One tab's whole state: what it printed, what is being typed into it, and which
   of the two input surfaces it is on. Held per session, so switching tabs is
   switching back to exactly where that tab was. */
interface Shell {
  lines: Line[]
  wiped: boolean
  draft: string
  typed: string
  direct: boolean
  /* A modifier applies to the next key only, the way a physical chord works. */
  held: string[]
}

const freshShell = (): Shell => ({
  lines: [],
  wiped: false,
  draft: '',
  typed: '',
  direct: false,
  held: [],
})

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

/* One tab on screen. Everything it remembers lives in the parent, keyed by
   session, so the drawer can switch between tabs without any of them forgetting a
   half-typed line. */
function Terminal({
  shell,
  onChange,
}: {
  shell: Shell
  onChange: (patch: Partial<Shell>) => void
}) {
  const { lines, wiped, draft, typed, direct, held } = shell
  const logRef = useRef<HTMLPreElement>(null)
  const tapRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  const chord = held.map((key) => key.toLowerCase()).join('+')
  const transcript = wiped ? [] : TRANSCRIPT

  useEffect(() => {
    /* A terminal keeps its newest line in view. */
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [lines, wiped, direct])

  /* The box grows with a multi-line command instead of scrolling inside 44px. */
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 96)}px`
  }, [draft, direct])

  const sendKey = (key: string) => {
    onChange({
      lines: [...lines, { kind: 'sent', text: `· ${chord ? `${chord}+` : ''}${key}` }],
      held: [],
    })
  }

  const toggle = (key: string) =>
    onChange({ held: held.includes(key) ? held.filter((name) => name !== key) : [...held, key] })

  const submit = () => {
    const command = draft.trim()
    if (!command) return
    onChange({ lines: [...lines, { kind: 'cmd', text: command }], draft: '', wiped: false })
  }

  /* Enter is the ordinary return key, as in the app: at the end of the text it hands
     the line to the shell, anywhere else it is a line break, so a loop or a here-doc
     can be written over several lines before it goes. */
  const onBoxKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return
    const box = event.currentTarget
    const atEnd = box.selectionStart === box.value.length && box.selectionEnd === box.value.length
    if (!atEnd) return
    event.preventDefault()
    submit()
  }

  /* Trash empties the screen: everything printed, base transcript included. */
  const clearAll = () => onChange({ lines: [], wiped: true, held: [] })

  /* Reset replaces the shell, so the screen starts again from a prompt — the same
     thing `exec $SHELL` does to a live session. */
  const restart = () => onChange({ lines: [{ kind: 'cmd', text: 'exec $SHELL' }], wiped: true, held: [] })

  /* The switch offers the surface a tap would take you to, and taking it raises the
     keyboard at once so the change is felt. */
  const toggleDirect = () => {
    const to = !direct
    onChange({ direct: to, typed: '' })
    requestAnimationFrame(() => (to ? tapRef.current : boxRef.current)?.focus())
  }

  /* In direct mode the line is the terminal's, so Enter is the byte the shell gets:
     the line is printed and the prompt starts again. */
  const runDirect = () => {
    const command = typed.trim()
    onChange({ typed: '' })
    if (!command) return
    onChange({ lines: [...lines, { kind: 'cmd', text: command }], typed: '', wiped: false })
  }

  const composer = (
    <div className="terminal-composer" data-no-drag>
      {/* The >_ key. It is not a key the shell receives: it is the switch between
          the box and the grid, and it shows the surface a tap would take you to. */}
      <button
        type="button"
        className="terminal-direct"
        aria-pressed={direct}
        aria-label={direct ? 'Type in the command box' : 'Type directly into the terminal'}
        onClick={toggleDirect}
      >
        {direct ? <Keyboard size={16} aria-hidden="true" /> : '>_'}
      </button>
      {direct ? (
        <p className="terminal-hint">Tap the terminal to type — keys go straight to the shell</p>
      ) : (
        <form
          className="terminal-field"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <textarea
            ref={boxRef}
            rows={1}
            className="terminal-input"
            value={draft}
            onChange={(event) => onChange({ draft: event.target.value })}
            onKeyDown={onBoxKey}
            placeholder={held.length ? 'key for the chord…' : 'Type a command…'}
            aria-label="Command"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </form>
      )}
    </div>
  )

  const keys = (
    <>
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
    </>
  )

  return (
    <section className={`terminal${direct ? ' is-direct' : ''}`} aria-label="Terminal">
      {/* In direct mode a tap anywhere on the grid is a tap on the terminal, and the
          terminal is what the keyboard is typing into. */}
      <pre
        className="terminal-log"
        ref={logRef}
        onClick={direct ? () => tapRef.current?.focus() : undefined}
      >
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
        {direct && (
          <span className="terminal-line is-cmd">
            <span className="terminal-user">root</span>{' '}
            <span className="terminal-cwd">~</span>{' '}
            <span className="terminal-mark">$</span> <span>{typed}</span>
            <span className="terminal-caret" aria-hidden="true" />
          </span>
        )}
      </pre>

      {/* The keyboard the grid takes in direct mode: a field the size of nothing,
          focusable so the phone's own keyboard comes up, and read from as the
          terminal's input rather than shown. */}
      <input
        ref={tapRef}
        className="terminal-tap"
        value={typed}
        onChange={(event) => onChange({ typed: event.target.value })}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          runDirect()
        }}
        aria-label="Terminal input"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="terminal-bar">
        {/* The keys sit above the line, as the app has them: they reach keys a phone
            lacks, and the line below is where typing goes. */}
        {keys}
        {composer}
      </div>
    </section>
  )
}

function Drawer({
  open,
  onClose,
  screen,
  onScreen,
  sessions,
  current,
  onSession,
  onAsk,
  onOpen,
  drag,
  panelRef,
}: {
  open: boolean
  /* The panel carries no close button: the bar above it is never covered, so the
     menu button is the close button. Only the scrim closes it from here. */
  onClose: () => void
  screen: Screen
  onScreen: (next: ListedScreen) => void
  sessions: Session[]
  current: string
  onSession: (id: string) => void
  onAsk: (session: Session) => void
  onOpen: (engine: string) => void
  drag: Drag | null
  panelRef: React.RefObject<HTMLElement>
}) {
  /* While a pointer is down the panel follows it instead of the class, so the
     gesture reads as dragging the panel rather than waiting for it to appear. */
  const offset = drag ? (drag.fromOpen ? Math.min(0, drag.dx) : Math.min(0, drag.dx - drag.width)) : null

  /* Sessions are grouped by the engine they run on, in the engines' own order, and
     an engine with nothing open on it earns no heading: the menu is the list of what
     is running, not a directory of what could be. */
  const groups = MACHINES
    .map((machine) => ({
      machine,
      shells: sessions.filter((session) => session.engine === machine.id),
    }))
    .filter((group) => group.shells.length)

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

        {/* The list of shells belongs to the terminal it switches between: on any
            other screen there is no terminal open, so there is no strip to show. */}
        {screen === 'terminal' && (
        <div className="drawer-scroll">
          <p className="drawer-label">{`Terminals · ${sessions.length}`}</p>

          {groups.map(({ machine, shells }) => (
            <section className="drawer-group" key={machine.id}>
              {/* The head answers "is that engine even up?" without a second level:
                  a dot, the name, and how many shells of it are open. */}
              <p className="drawer-head">
                <span className={`drawer-dot${machine.online ? ' is-live' : ''}`} aria-hidden="true" />
                {machine.name}
                <span className="drawer-count">{shells.length}</span>
              </p>

              {/* Two controls in one row: opening the shell is the row, closing it
                  is the x at the end. Closing the one you are in hands the screen to
                  the next shell, or back to the engines when it was the last. */}
              {shells.map((session) => (
                <div
                  key={session.id}
                  className={`drawer-session${session.id === current ? ' is-current' : ''}`}
                >
                  <button
                    type="button"
                    className="drawer-session-open"
                    aria-current={session.id === current ? 'true' : undefined}
                    onClick={() => {
                      onSession(session.id)
                      onClose()
                    }}
                  >
                    <SquareTerminal size={16} />
                    <span className="drawer-session-title">{session.title}</span>
                  </button>
                  <button
                    type="button"
                    className="drawer-session-close"
                    aria-label={`Close ${session.title}`}
                    onClick={() => onAsk(session)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}

              <button type="button" className="drawer-new" onClick={() => onOpen(machine.id)}>
                <Plus size={14} aria-hidden="true" />
                <span>New terminal</span>
              </button>
            </section>
          ))}
        </div>
        )}

        <p className="drawer-foot">
          <span className="drawer-account">{ACCOUNT}</span>
        </p>
      </aside>
    </>
  )
}

/* A question about one shell, over the list it came from. The dialog is its own
   layer so neither the panel nor the bar underneath has to move: the menu stays where
   it is, one press from the answer. */
function Confirm({
  session,
  engine,
  onKeep,
  onClose,
}: {
  session: Session
  engine: string
  onKeep: () => void
  onClose: () => void
}) {
  const keepRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /* The safe answer takes the focus: a question about closing something should not
       put the finger on closing it. */
    keepRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onKeep()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKeep])

  /* Two buttons are the whole dialog, so Tab stays inside it. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const buttons = panelRef.current?.querySelectorAll('button')
    if (!buttons?.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      ;(last as HTMLButtonElement).focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      ;(first as HTMLButtonElement).focus()
    }
  }

  return (
    <div className="dialog-scrim" onMouseDown={onKeep}>
      <div
        ref={panelRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 className="dialog-title" id="confirm-title">
          {`Close ${session.title}?`}
        </h2>
        <p className="dialog-body" id="confirm-body">
          {`The shell on ${engine} stops. Anything still running in it ends with it.`}
        </p>
        <div className="dialog-actions">
          <button ref={keepRef} type="button" className="dialog-keep" onClick={onKeep}>
            Keep
          </button>
          <button type="button" className="dialog-close" onClick={onClose}>
            {`Close ${session.title}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EnginesMock() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [screenId, setScreenId] = useState<Screen>('engines')
  const screen = SCREENS.find((entry) => entry.id === screenId) ?? SCREENS[0]
  /* The tabs, and one shell of state each. Both live here so the drawer can switch
     between them: a tab is not a screen that is rebuilt, it is a session kept. */
  const [sessions, setSessions] = useState<Session[]>(SESSIONS)
  const [current, setCurrent] = useState(SESSIONS[0].id)
  const [shells, setShells] = useState<Record<string, Shell>>(() =>
    Object.fromEntries(SESSIONS.map((session) => [session.id, freshShell()])),
  )
  const shell = shells[current] ?? freshShell()
  /* Closing a shell ends something that was running, so it is asked about first, in
     a dialog over the list rather than inside a row. */
  const [asking, setAsking] = useState<Session | null>(null)
  /* A shell whose engine is down cannot be opened, so it is offered nowhere: not in
     the menu, and not as the tab the screen falls back to. */
  const open = sessions.filter((session) =>
    MACHINES.find((machine) => machine.id === session.engine)?.online,
  )
  const [drag, setDrag] = useState<Drag | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const topbarRef = useRef<HTMLElement>(null)
  /* The native touch listeners outlive a render, so the gesture reads from a ref
     and only the render values come from state. */
  const dragRef = useRef<Drag | null>(null)
  /* A terminal is the whole screen, so the bar is off it — until the menu comes out,
     which is the one moment the bar has something to say. While the finger is still
     down, the bar follows it, so the two arrive together instead of one after the
     other. */
  const closeSession = (id: string) => {
    const left = open.filter((session) => session.id !== id)
    setSessions(left)
    setShells((map) => {
      const { [id]: _closed, ...rest } = map
      return rest
    })
    if (id !== current) return
    /* The tab you were in is gone, so the screen goes to whatever is left of the
       same engine, and to the engines when nothing is left at all. */
    const engine = sessions.find((session) => session.id === id)?.engine
    const next = left.find((session) => session.engine === engine) ?? left[0]
    if (next) setCurrent(next.id)
    else setScreenId('engines')
  }

  const full = screenId === 'terminal'
  const revealed = drag ? 1 + (drag.fromOpen ? Math.min(0, drag.dx) : Math.min(0, drag.dx - drag.width)) / drag.width : null

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

  /* Across is the measure: the drag belongs to the drawer once it is wider than it is
     tall, and to the page otherwise. Once it is the drawer's, vertical drift no longer
     takes it back — the finger already said what it meant. */
  const follow = (clientX: number, clientY: number) => {
    const current = dragRef.current
    if (!current) return
    const dx = clientX - current.startX
    const dy = clientY - current.startY
    if (!current.active) {
      if (Math.abs(dx) < SLOP) return
      if (Math.abs(dx) <= Math.abs(dy)) {
        hold(null)
        return
      }
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

  useEffect(() => {
    /* A bar that is only translated away is still tabbable and still readable by a
       screen reader: while it is off, it is inert. */
    topbarRef.current?.toggleAttribute('inert', full && !menuOpen)
  }, [full, menuOpen])

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
      className={`shell${drag ? ' is-dragging' : ''}${screen.machines ? '' : ' is-full'}${full && menuOpen ? ' is-menu' : ''}`}
    >
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header
        className="topbar"
        ref={topbarRef}
        style={
          full && revealed !== null
            ? {
                transform: `translateY(${-100 * (1 - revealed)}%)`,
                opacity: revealed,
                pointerEvents: revealed > 0.6 ? 'auto' : 'none',
                transition: 'none',
              }
            : undefined
        }
      >
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
        sessions={open}
        current={current}
        onSession={(id) => {
          setCurrent(id)
          setScreenId('terminal')
        }}
        onAsk={setAsking}
        onOpen={(engine) => {
          const session: Session = {
            id: `s${Date.now()}`,
            engine,
            title: `shell ${sessions.filter((s) => s.engine === engine).length + 1}`,
          }
          setSessions((list) => [...list, session])
          setShells((map) => ({ ...map, [session.id]: freshShell() }))
          setCurrent(session.id)
          setScreenId('terminal')
        }}
        drag={drag}
        panelRef={panelRef}
      />

      {asking && (
        <Confirm
          session={asking}
          engine={MACHINES.find((machine) => machine.id === asking.engine)?.name ?? asking.engine}
          onKeep={() => setAsking(null)}
          onClose={() => {
            closeSession(asking.id)
            setAsking(null)
          }}
        />
      )}

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
          <Terminal
            key={current}
            shell={shell}
            onChange={(patch) => setShells((map) => ({ ...map, [current]: { ...shell, ...patch } }))}
          />
        )}
      </main>

    </div>
  )
}
