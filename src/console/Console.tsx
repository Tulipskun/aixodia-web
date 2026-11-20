//! The console: the machines screen and its shells, now on the real registry.
//!
//! This is the screen that was argued about as a mock, kept as the thing that is
//! shipped: the sheet, the bar, the drawer, the gesture, the cards, the key rows and
//! the dialog are the ones that were designed. What changed is where the facts come
//! from — a machine and a shell are given to it instead of being literals.
//!
//! It is fully controlled: it holds what belongs to the chrome (is the menu open, how
//! far has the finger dragged, which line is half-typed) and nothing about the data.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Keyboard, Menu, Plus, RotateCw, SquareTerminal, Trash2, X } from 'lucide-react'

/** One reading: a label, the series behind it, and how it is said. */
export interface Metric {
  label: string
  icon: LucideIcon
  /** Suffix after the reading, e.g. "%" or " GB". */
  unit: string
  digits: number
  /** Capacity, as a plain number: the unit is in the label row. */
  total?: string
  /** Oldest to newest, one sample per reading. The card draws what it is given — a
   *  partial window, a single sample or nothing — and reads the last one. */
  series: number[]
}

/** A machine as the menu needs it: a heading and whether its shells can be opened. */
export interface MachineRef {
  id: string
  name: string
  online: boolean
}

/** A machine on a card: a server, or a phone read as a device. */
export interface Machine {
  id: string
  name: string
  online: boolean
  /** Uptime when it is up, the reason when it is not. */
  meta: string
  metrics: Metric[]
}

/** One verb a card offers. */
export interface Action {
  id: string
  label: string
  icon: LucideIcon
  /** False for a verb whose screen does not exist yet: it is drawn, not pressable. */
  enabled?: boolean
}

/** A screen that is a list of cards. A terminal is one session, not a list. */
export interface Listing {
  id: string
  title: string
  count: string
  machines: Machine[]
  /** What this kind of thing can do, per card. */
  actions: Action[]
}

/** The menu's own navigation. A terminal is not on it: a terminal is a session, and
 *  sessions are the list below it. */
export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

/** A tab. Terminals belong to an engine, and a person keeps more than one open, on
 *  more than one engine, at the same time — so the menu lists sessions, not screens. */
export interface Session {
  id: string
  engine: string
  title: string
}

/* A sideways drag anywhere on the page opens the drawer, and one headed left
   anywhere closes it again. Both commit on distance or on speed, so a short flick
   counts. */
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

/** How the console mounts a machine's display: it names the machine, and draws what
 *  comes back. A screen keeps its own socket, so the console only chooses the room. */
export type ScreenMount = (machine: { id: string; name: string }) => ReactNode

/** What the terminal draws, from whoever is holding the shell. */
export interface TerminalView {
  /** The transcript: cells from a pty, or lines from a fixture. */
  content: ReactNode
  /** Whether the console draws the half-typed direct line itself. A pty echoes what
   *  it is sent, so there it must not. */
  echo: boolean
}

/** What the key rows and the composer are wired to. */
export interface TerminalHandle {
  onKey: (key: string, chord: string) => void
  onCommand: (line: string) => void
  onClear: () => void
  onReset: () => void
}

/** How a screen mounts a terminal: the console gives it the refs it needs, takes back
 *  the handle it must press, and gets in return what to draw and what to say about a
 *  shell that is not open yet. */
export type TerminalMount = (session: Session, contract: {
  logRef: RefObject<HTMLPreElement | null>
  tapRef: RefObject<HTMLInputElement | null>
  onHandle: (handle: TerminalHandle) => void
  /** Said once the engine has the shell, so the menu can list it by name. */
  onReady: () => void
}) => TerminalView

/** A deterministic walk, so a fixture looks the same on every load. */
export function sampleSeries(seed: number, base: number, swing: number, points: number): number[] {
  let state = seed
  return Array.from({ length: points }, (_, index) => {
    state = (state * 1664525 + 1013904223) % 4294967296
    const noise = state / 4294967296 - 0.5
    const drift = Math.sin((index / points) * Math.PI * 2)
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
    <svg className="metric-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path className="spark-area" d={`${line} L${100 - SIDE} ${FLOOR} L${SIDE} ${FLOOR} Z`} />
      <path className="spark-line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** The last sample of a series, formatted. */
function last(samples: number[] | undefined, metric: Metric): string {
  return samples?.length ? samples[samples.length - 1].toFixed(metric.digits) : '—'
}

/** What the reading says: a share out of 100, or used over whole. */
function reading(metric: Metric): { value: string; unit: string } {
  if (!metric.series.length) return { value: '—', unit: '' }
  const used = Number(last(metric.series, metric)).toFixed(metric.digits)
  return metric.total
    ? { value: `${used}/${metric.total}`, unit: metric.unit }
    : { value: `${used}%`, unit: '' }
}

function Card({
  machine,
  actions,
  index,
  onAction,
}: {
  machine: Machine
  actions: Action[]
  /* Cards arrive in order when the screen changes, so the switch is felt as a
     change of screen rather than as text being swapped in place. */
  index: number
  onAction: (id: string) => void
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
        {machine.metrics.map(metric => (
          <div
            key={metric.label}
            className="metric"
            role="img"
            aria-label={`${metric.label}, ${reading(metric).value} ${reading(metric).unit}`.trim()}
          >
            <Spark values={metric.series} ceiling={metric.total ? Number(metric.total) : 100} />
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

      <div className={`actions${actions.length === 2 ? ' is-pair' : ''}`}>
        {actions.map(({ id, label, icon: Icon, enabled = true }) => (
          <button
            key={id}
            type="button"
            className="action"
            disabled={offline || !enabled}
            /* Every verb here has a screen behind it; the ones that do not are marked
               unavailable when the screen is assembled, not drawn as a tease. */
            onClick={() => onAction(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </article>
  )
}

/* What a shell has that is the console's own rather than the pty's: the line being
   typed in the box, the line being typed straight into the grid, which surface it is
   on, and which modifier is held. */
interface Composer {
  draft: string
  typed: string
  direct: boolean
  held: string[]
}

const freshComposer = (): Composer => ({ draft: '', typed: '', direct: false, held: [] })

/* One tab on screen. Everything it remembers lives in the parent, keyed by session,
   so the drawer can switch between tabs without any of them forgetting a half-typed
   line. */
function TerminalScreen({
  session,
  composer,
  onChange,
  mount,
  onReady,
}: {
  session: Session
  composer: Composer
  onChange: (patch: Partial<Composer>) => void
  mount: TerminalMount
  onReady: () => void
}) {
  const { draft, typed, direct, held } = composer
  const logRef = useRef<HTMLPreElement>(null)
  const tapRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const [handle, setHandle] = useState<TerminalHandle | null>(null)

  const chord = held.map(key => key.toLowerCase()).join('+')
  const view = mount(session, { logRef, tapRef, onHandle: setHandle, onReady })

  /* The box grows with a multi-line command instead of scrolling inside 44px. */
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 96)}px`
  }, [draft, direct])

  const toggle = (key: string) =>
    onChange({ held: held.includes(key) ? held.filter(name => name !== key) : [...held, key] })

  const submit = () => {
    const command = draft.trim()
    if (!command) return
    onChange({ draft: '', held: [] })
    handle?.onCommand(command)
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

  /* The switch offers the surface a tap would take you to, and taking it raises the
     keyboard at once so the change is felt. */
  const toggleDirect = () => {
    const to = !direct
    onChange({ direct: to, typed: '' })
    requestAnimationFrame(() => (to ? tapRef.current : boxRef.current)?.focus())
  }

  /* In direct mode the line is the terminal's, so Enter is the byte the shell gets:
     the line is handed over and the prompt starts again. */
  const runDirect = () => {
    const command = typed.trim()
    onChange({ typed: '', held: [] })
    if (command) handle?.onCommand(command)
  }

  const composerBar = (
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
          onSubmit={event => {
            event.preventDefault()
            submit()
          }}
        >
          <textarea
            ref={boxRef}
            rows={1}
            className="terminal-input"
            value={draft}
            onChange={event => onChange({ draft: event.target.value })}
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
      {KEY_ROWS.map(row => (
        <div className="terminal-keys" key={row.join()} data-no-drag>
          {row.map(key => {
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
                  else if (key === 'trash') handle?.onClear()
                  else if (key === 'reload') handle?.onReset()
                  else handle?.onKey(key, chord)
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
      <pre className="terminal-log" ref={logRef} onClick={direct ? () => tapRef.current?.focus() : undefined}>
        {view.content}
        {direct && view.echo && (
          <span className="terminal-line is-cmd">
            <span className="terminal-user">root</span> <span className="terminal-cwd">~</span>{' '}
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
        onChange={event => onChange({ typed: event.target.value })}
        onKeyDown={event => {
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
        {composerBar}
      </div>
    </section>
  )
}

function Drawer({
  open,
  onClose,
  screen,
  onScreen,
  nav,
  machines,
  sessions,
  current,
  onSession,
  onAsk,
  onOpen,
  drag,
  panelRef,
  account,
  onSignOut,
}: {
  open: boolean
  /* The panel carries no close button: the bar above it is never covered, so the
     menu button is the close button. Only the scrim closes it from here. */
  onClose: () => void
  screen: string
  onScreen: (next: string) => void
  nav: NavItem[]
  machines: MachineRef[]
  sessions: Session[]
  current: string
  onSession: (id: string) => void
  onAsk: (session: Session) => void
  onOpen: (engine: string) => void
  drag: Drag | null
  panelRef: RefObject<HTMLElement>
  account: string
  onSignOut?: () => void
}) {
  /* While a pointer is down the panel follows it instead of the class, so the
     gesture reads as dragging the panel rather than waiting for it to appear. */
  const offset = drag ? (drag.fromOpen ? Math.min(0, drag.dx) : Math.min(0, drag.dx - drag.width)) : null

  /* Sessions are grouped by the engine they run on, in the engines' own order, and
     an engine with nothing open on it earns no heading: the menu is the list of what
     is running, not a directory of what could be. */
  const groups = machines
    .map(machine => ({
      machine,
      shells: sessions.filter(session => session.engine === machine.id),
    }))
    .filter(group => group.shells.length)

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
        style={offset === null ? undefined : { opacity: 1 + offset / (drag?.width ?? 1), transition: 'none' }}
      />
      <aside
        ref={panelRef}
        className={`drawer${open ? ' is-open' : ''}`}
        aria-label="Menu"
        aria-hidden={!open}
        style={offset === null ? undefined : { transform: `translateX(${offset}px)`, transition: 'none' }}
      >
        <nav className="drawer-list">
          {nav.map(({ id, label, icon: Icon }) => (
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
                {shells.map(session => (
                  <div key={session.id} className={`drawer-session${session.id === current ? ' is-current' : ''}`}>
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

        {/* Who you are, and the one thing to do about it: the menu is where the
            account lives, so signing out is reachable from the menu rather than from a
            second bar. */}
        <div className="drawer-foot">
          <span className="drawer-account">{account}</span>
          {onSignOut && (
            <button type="button" className="drawer-signout" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
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
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 className="dialog-title" id="confirm-title">{`Close ${session.title}?`}</h2>
        <p className="dialog-body" id="confirm-body">
          {`The shell on ${engine} stops. Anything still running in it ends with it.`}
        </p>
        <div className="dialog-actions">
          <button ref={keepRef} type="button" className="dialog-cancel" onClick={onKeep}>
            Cancel
          </button>
          <button type="button" className="dialog-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function Console({
  listings,
  nav,
  machines,
  sessions,
  current,
  screenId,
  account,
  mount,
  mountScreen,
  viewing,
  onScreenId,
  onSession,
  onAction,
  onCloseSession,
  onTerminalReady,
  onSignOut,
}: {
  /** The screens that are a list of cards, in menu order. */
  listings: Listing[]
  nav: NavItem[]
  /** Every machine, in the registry's order: the drawer's groups follow it. */
  machines: MachineRef[]
  sessions: Session[]
  current: string
  screenId: string
  account: string
  mount: TerminalMount
  mountScreen: ScreenMount
  /** The machine whose display is on screen, when the screen is a display. */
  viewing: { id: string; name: string } | null
  onScreenId: (id: string) => void
  onSession: (id: string) => void
  onAction: (machine: string, action: string) => void
  onCloseSession: (session: Session) => void
  onTerminalReady: () => void
  onSignOut?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const listing = listings.find(entry => entry.id === screenId) ?? null
  /* The tabs, and the half-typed line of each: both live here so the drawer can
     switch between them without losing what was being written. */
  const [composers, setComposers] = useState<Record<string, Composer>>({})
  const composer = composers[current] ?? freshComposer()
  /* Closing a shell ends something that was running, so it is asked about first, in
     a dialog over the list rather than inside a row. */
  const [asking, setAsking] = useState<Session | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const topbarRef = useRef<HTMLElement>(null)
  /* The native touch listeners outlive a render, so the gesture reads from a ref
     and only the render values come from state. */
  const dragRef = useRef<Drag | null>(null)

  /* A terminal is the whole screen, so the bar is off it — until the menu comes out,
     which is the one moment the bar has something to say. While the finger is still
     down, the bar follows it, so the two arrive together instead of one after the
     other. */
  const full = screenId === 'terminal' || screenId === 'screen'
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
    const currentDrag = dragRef.current
    if (!currentDrag) return
    const dx = clientX - currentDrag.startX
    const dy = clientY - currentDrag.startY
    if (!currentDrag.active) {
      if (Math.abs(dx) < SLOP) return
      if (Math.abs(dx) <= Math.abs(dy)) {
        hold(null)
        return
      }
      hold({ ...currentDrag, active: true, dx })
      return
    }
    hold({ ...currentDrag, dx })
  }

  const settle = () => {
    const currentDrag = dragRef.current
    if (!currentDrag) return
    if (!currentDrag.active) {
      hold(null)
      return
    }
    /* Distance travelled towards the commit, and how fast it went there. */
    const travelled = currentDrag.fromOpen ? -currentDrag.dx : currentDrag.dx
    const speed = travelled / Math.max(16, performance.now() - currentDrag.startedAt)
    const move = travelled > COMMIT || speed > FLICK
    setMenuOpen(currentDrag.fromOpen ? !move : move)
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

  const session = sessions.find(entry => entry.id === current)

  return (
    <div className={`shell${drag ? ' is-dragging' : ''}${listing ? '' : ' is-full'}${full && menuOpen ? ' is-menu' : ''}`}>
      <a className="skip-link" href="#content">Skip to content</a>

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
          onClick={() => setMenuOpen(wasOpen => !wasOpen)}
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
        onScreen={onScreenId}
        nav={nav}
        machines={machines}
        sessions={sessions}
        current={current}
        onSession={onSession}
        onAsk={setAsking}
        onOpen={machine => onAction(machine, 'terminal')}
        drag={drag}
        panelRef={panelRef}
        account={account}
        onSignOut={onSignOut}
      />

      {asking && (
        <Confirm
          session={asking}
          engine={machines.find(machine => machine.id === asking.engine)?.name ?? asking.engine}
          onKeep={() => setAsking(null)}
          onClose={() => {
            onCloseSession(asking)
            setAsking(null)
          }}
        />
      )}

      <main className="screen" id="content" tabIndex={-1}>
        {/* A list says what it is before it lists anything; a terminal already says
            it in its own head, so it gets the whole screen instead. */}
        {listing && (
          <div className="screen-head">
            {/* Keyed by screen, so the heading is a new element on a switch and its
                entrance runs with the cards instead of the text swapping in place. */}
            <h1 key={listing.id}>{listing.title}</h1>
            <span key={`${listing.id}-count`} className="screen-count">{listing.count}</span>
          </div>
        )}

        {screenId === 'screen' && viewing && (
          <div className="screen-live-body">{mountScreen(viewing)}</div>
        )}

        {listing
          ? listing.machines.map((machine, index) => (
              <Card
                key={machine.id}
                machine={machine}
                actions={listing.actions}
                index={index}
                onAction={id => onAction(machine.id, id)}
              />
            ))
          : screenId !== 'screen' && session && (
              <TerminalScreen
                key={session.id}
                session={session}
                composer={composer}
                onChange={patch => setComposers(map => ({ ...map, [session.id]: { ...composer, ...patch } }))}
                mount={mount}
                onReady={onTerminalReady}
              />
            )}
      </main>
    </div>
  )
}
