import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, RotateCw, Trash2 } from 'lucide-react'
import * as api from '../api'
import { Screen, runs } from '../term/vt.js'

/* One shell, drawn the way the app draws one: the transcript above, two rows of keys
 * and the line they feed below. Everything the keys say goes to the engine's pty as
 * bytes, because that is what the pty reads — the chrome is the only mock-free part
 * that survives, and it survives because it is the app's own key layout. */

type Phase = 'connecting' | 'open' | 'closed' | 'error'

const FONT_SIZE = 13
const LINE_HEIGHT = 1.45

const PALETTE = [
  '', '#6f6f78', '#4fbf8b', '#f6c66b', '#7fa6d3', '#d98bff', '#69c8ff', '#f2f2f3',
  '#4b4b52', '#8f8f98', '#6ee7c4', '#ffd889', '#a9c4e2', '#e6a9ff', '#9fe0ff', '#ffffff',
]

function colour(value: number | { r: number; g: number; b: number } | null, background = false): string | undefined {
  if (value === null) return undefined
  if (typeof value === 'object') return `rgb(${value.r}, ${value.g}, ${value.b})`
  const entry = PALETTE[value] ?? ''
  if (background) return entry ? `${entry}33` : undefined
  return entry || undefined
}

function runStyle(run: ReturnType<typeof runs>[number]): React.CSSProperties {
  const style: React.CSSProperties = {}
  let fg = colour(run.fg)
  let bg = colour(run.bg, true)
  if (run.inverse) {
    const nextFg = bg ?? '#060607'
    bg = fg ?? '#f2f2f3'
    fg = nextFg
  }
  if (fg) style.color = fg
  if (bg) style.background = bg
  if (run.bold) style.fontWeight = 600
  if (run.dim) style.opacity = 0.6
  if (run.italic) style.fontStyle = 'italic'
  if (run.underline) style.textDecoration = 'underline'
  return style
}

/* The two rows, as the app has them. Values are what the key sends: the sequences a
   shell expects for keys a phone keyboard does not have. */
const KEY_ROWS: { key: string; send?: string; icon?: 'trash' | 'reload'; aria: string }[][] = [
  [
    { key: 'Esc', send: '\x1b', aria: 'Escape' },
    { key: 'Tab', send: '\t', aria: 'Tab' },
    { key: 'CMD', send: '\x10', aria: 'Control P' },
    { key: 'PgUp', send: '\x1b[5~', aria: 'Page up' },
    { key: '↑', send: '\x1b[A', aria: 'Up' },
    { key: 'PgDn', send: '\x1b[6~', aria: 'Page down' },
    { key: 'trash', icon: 'trash', aria: 'Clear' },
  ],
  [
    { key: 'Ctrl', aria: 'Control' },
    { key: 'Shift', aria: 'Shift' },
    { key: 'Alt', aria: 'Alt' },
    { key: '←', send: '\x1b[D', aria: 'Left' },
    { key: '↓', send: '\x1b[B', aria: 'Down' },
    { key: '→', send: '\x1b[C', aria: 'Right' },
    { key: 'reload', icon: 'reload', aria: 'Reset the shell' },
  ],
]

const MODIFIERS = ['Ctrl', 'Shift', 'Alt']

export function TerminalPane({ engineId, terminalId, onReady }: {
  engineId: string
  terminalId: string
  onReady?: () => void
}) {
  const logRef = useRef<HTMLPreElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const tapRef = useRef<HTMLInputElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const pinnedRef = useRef(true)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [note, setNote] = useState('')
  const [version, setVersion] = useState(0)
  const [draft, setDraft] = useState('')
  const [typed, setTyped] = useState('')
  const [direct, setDirect] = useState(false)
  const [held, setHeld] = useState<string[]>([])

  /* The screen model is the terminal's memory: the pty sends bytes, and bytes are
     useless to a DOM until something turns them into cells. */
  const screen = useMemo(() => new Screen({ cols: 80, rows: 24 }), [])
  /* Held in a ref: a caller that passes a fresh arrow each render must not make the
     socket redial. */
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  const size = useCallback((): { cols: number; rows: number } => {
    const log = logRef.current
    if (!log) return { cols: screen.cols, rows: screen.rows }
    /* Both numbers are measured from the font that is actually drawn: a cell is one
       character wide and one line tall, and a phone's monospace is not always the size
       it was asked for. Two pixels of slack keep a scrollbar from appearing on a grid
       that fits. */
    const probe = document.createElement('span')
    probe.textContent = '0000000000'
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;line-height:inherit'
    log.appendChild(probe)
    const box = probe.getBoundingClientRect()
    log.removeChild(probe)
    const cellWidth = box.width / 10 || 8
    const lineHeight = box.height || FONT_SIZE * LINE_HEIGHT
    const cols = Math.max(20, Math.floor((log.clientWidth - 2) / cellWidth))
    const rows = Math.max(6, Math.floor((log.clientHeight - 2) / lineHeight))
    return { cols, rows }
  }, [screen])

  const connect = useCallback(async () => {
    setPhase('connecting')
    setNote('')
    const { cols, rows } = size()
    try {
      const { ticket } = await api.createTerminalTicket(engineId)
      const socket = new WebSocket(api.terminalSocketUrl(engineId, ticket, { id: terminalId, cols, rows }))
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket
      socket.onmessage = event => {
        if (typeof event.data === 'string') {
          let control: { type?: string; cols?: number; rows?: number; error?: string } = {}
          try { control = JSON.parse(event.data) } catch { return }
          if (control.type === 'ready') {
            setPhase('open')
            /* The engine has the shell now, so it has a name and the menu can list it. */
            readyRef.current?.()
            setVersion(value => value + 1)
          } else if (control.type === 'error') {
            setPhase('error')
            setNote(control.error || 'The engine refused the shell.')
          }
          return
        }
        screen.write(new Uint8Array(event.data))
        setVersion(value => value + 1)
      }
      socket.onclose = () => {
        if (socketRef.current !== socket) return
        socketRef.current = null
        setPhase('closed')
      }
      socket.onerror = () => {
        if (socketRef.current !== socket) return
        setPhase('error')
        setNote('The socket to the engine failed.')
      }
    } catch (error) {
      setPhase('error')
      setNote(error instanceof Error ? error.message : 'Could not reach the engine.')
    }
  }, [engineId, terminalId, screen, size])

  useEffect(() => {
    void connect()
    return () => {
      const socket = socketRef.current
      socketRef.current = null
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close()
    }
  }, [connect])

  /* The grid follows the box: a terminal is measured in cells, and a cell is one
     character of the font it is drawn in. */
  useEffect(() => {
    const log = logRef.current
    if (!log) return
    const observer = new ResizeObserver(() => {
      const { cols, rows } = size()
      if (cols === screen.cols && rows === screen.rows) return
      screen.resize(cols, rows)
      setVersion(value => value + 1)
      const socket = socketRef.current
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols, rows }))
    })
    observer.observe(log)
    return () => observer.disconnect()
  }, [screen, size])

  useEffect(() => {
    const log = logRef.current
    if (!log || !pinnedRef.current) return
    log.scrollTop = log.scrollHeight
  }, [version, direct])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 96)}px`
  }, [draft, direct])

  const send = useCallback((data: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !data) return
    socket.send(new TextEncoder().encode(data))
    pinnedRef.current = true
  }, [])

  /* A held modifier applies to the next character, the way a chord does. */
  const withModifiers = useCallback((text: string) => {
    if (!held.length) return text
    const code = text.toUpperCase().charCodeAt(0)
    if (code >= 64 && code <= 95) {
      setHeld([])
      return String.fromCharCode(code - 64)
    }
    return text
  }, [held])

  const runKey = useCallback((entry: { key: string; send?: string; icon?: 'trash' | 'reload' }) => {
    if (MODIFIERS.includes(entry.key)) {
      setHeld(current => (current.includes(entry.key) ? current.filter(name => name !== entry.key) : [...current, entry.key]))
      return
    }
    if (entry.icon === 'trash') {
      /* Clearing is the screen's own act: the shell keeps its state, the reader
         loses the scrollback. */
      screen.reset()
      setVersion(value => value + 1)
      return
    }
    if (entry.icon === 'reload') {
      send('exec $SHELL\r')
      return
    }
    if (entry.send) send(entry.send)
  }, [screen, send])

  const submit = () => {
    const line = held.length ? withModifiers(draft) : draft
    if (!line.trim()) return
    send(`${line}\r`)
    setDraft('')
    setHeld([])
  }

  const toggleDirect = () => {
    const next = !direct
    setDirect(next)
    setTyped('')
    requestAnimationFrame(() => (next ? tapRef.current : boxRef.current)?.focus())
  }

  const snapshot = screen.snapshot()
  const lines = snapshot.lines
  const lastLine = lines.length - 1

  return (
    <section className={`terminal${direct ? ' is-direct' : ''}`} aria-label="Terminal">
      <pre
        className="terminal-log"
        ref={logRef}
        onClick={direct ? () => tapRef.current?.focus() : undefined}
        onScroll={event => {
          const log = event.currentTarget
          pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 24
        }}
      >
        {lines.map((line, index) => (
          <span className="terminal-line" key={index}>
            {runs(line).map((run, runIndex) => (
              <span key={runIndex} style={runStyle(run)}>{run.text}</span>
            ))}
            {index === snapshot.cursorRow && phase === 'open' && snapshot.cursor.visible && !direct && (
              <span className="terminal-caret" aria-hidden="true" />
            )}
            {index === lastLine && <span aria-hidden="true"> </span>}
          </span>
        ))}
        {direct && phase === 'open' && (
          <span className="terminal-line is-cmd">
            <span className="terminal-user">root</span>{' '}
            <span className="terminal-cwd">~</span>{' '}
            <span className="terminal-mark">$</span> <span>{typed}</span>
            <span className="terminal-caret" aria-hidden="true" />
          </span>
        )}
      </pre>

      {phase !== 'open' && (
        <div className="terminal-note">
          <span>
            {phase === 'connecting' ? 'Connecting to the shell…' : phase === 'closed' ? 'The shell closed.' : note}
          </span>
          <button type="button" className="action" style={{ height: 36, flexDirection: 'row', gap: 6, padding: '0 12px' }} onClick={() => void connect()}>
            <RotateCw size={14} aria-hidden="true" />
            <span>Reconnect</span>
          </button>
        </div>
      )}

      {/* The keyboard the grid takes in direct mode: a field the size of nothing,
          focusable so the phone's own keyboard comes up. */}
      <input
        ref={tapRef}
        className="terminal-tap"
        value={typed}
        onChange={event => setTyped(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          if (typed.trim()) send(`${typed}\r`)
          setTyped('')
        }}
        aria-label="Terminal input"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="terminal-bar" data-no-drag>
        {KEY_ROWS.map(row => (
          <div className="terminal-keys" key={row[0].key}>
            {row.map(entry => (
              <button
                key={entry.key}
                type="button"
                className={`terminal-key${held.includes(entry.key) ? ' is-held' : ''}`}
                aria-pressed={MODIFIERS.includes(entry.key) ? held.includes(entry.key) : undefined}
                aria-label={entry.aria}
                onClick={() => runKey(entry)}
              >
                {entry.icon === 'trash' ? (
                  <Trash2 size={14} aria-hidden="true" />
                ) : entry.icon === 'reload' ? (
                  <RotateCw size={14} aria-hidden="true" />
                ) : (
                  entry.key
                )}
              </button>
            ))}
          </div>
        ))}

        <div className="terminal-composer">
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
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Enter') return
                  const box = event.currentTarget
                  const atEnd = box.selectionStart === box.value.length && box.selectionEnd === box.value.length
                  if (!atEnd) return
                  event.preventDefault()
                  submit()
                }}
                placeholder={held.length ? 'key for the chord…' : 'Type a command…'}
                aria-label="Command"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
