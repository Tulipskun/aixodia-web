import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CornerDownLeft, RotateCw } from 'lucide-react'
import { createTerminalTicket, terminalSocketUrl } from './api'
import { Screen, runs } from './term/vt.js'

/* The terminal, on the engine's real pty.
 *
 * The engine speaks three things on one socket: a text `ready` frame, JSON control
 * frames we send (`resize`), and binary frames in both directions carrying the raw
 * pty. Keystrokes therefore go out as binary — a text frame would be read as control
 * JSON — and the screen model in ./term/vt.js turns what comes back into a grid.
 *
 * A ticket is single-use, so every redial asks for a new one. */

type Phase = 'connecting' | 'open' | 'closed' | 'error'

const FONT_SIZE = 13
const LINE_HEIGHT = 1.4

/* SGR indices to the console's own colours. Zero is left to the theme so a plain
   shell prompt uses the text colour rather than a hard black. */
const PALETTE = [
  '', '#77749f', '#45d6b0', '#f6c66b', '#7772ff', '#d98bff', '#69c8ff', '#f4f3ff',
  '#4b4870', '#8f8cc4', '#6ee7c4', '#ffd889', '#9a95ff', '#e6a9ff', '#9fe0ff', '#ffffff',
]
const BG_PALETTE = ['', '#1d1d21', '#1b2f2a', '#2f2a1b', '#1b1d2f', '#281b2f', '#1b2a2f', '#2a2a33', '#1d1d21', '#1d1d21', '#1d1d21', '#1d1d21', '#1d1d21', '#1d1d21', '#1d1d21', '#1d1d21']

function colour(value: number | { r: number; g: number; b: number } | null, background = false): string | undefined {
  if (value === null) return undefined
  if (typeof value === 'object') return `rgb(${value.r}, ${value.g}, ${value.b})`
  const table = background ? BG_PALETTE : PALETTE
  return table[value] || undefined
}

function runStyle(run: ReturnType<typeof runs>[number]): React.CSSProperties {
  const style: React.CSSProperties = {}
  let fg = colour(run.fg)
  let bg = colour(run.bg, true)
  if (run.inverse) {
    const nextFg = bg ?? '#060607'
    bg = fg ?? '#f4f3ff'
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

const KEY_ESCAPES: Record<string, string> = {
  Enter: '\r',
  Backspace: '\x7f',
  Tab: '\t',
  Escape: '\x1b',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  Delete: '\x1b[3~',
  Insert: '\x1b[2~',
}

export function TerminalView({ engineId, engineName, onBack }: {
  engineId: string
  engineName: string
  onBack: () => void
}) {
  const screenRef = useRef<Screen | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const viewRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const pinnedRef = useRef(true)
  const retryRef = useRef(0)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)
  const [cols, setCols] = useState(0)
  const [rows, setRows] = useState(0)

  const screen = useMemo(() => {
    const model = new Screen({ cols: 80, rows: 24 })
    screenRef.current = model
    return model
  }, [])

  /* The grid size follows the box: the terminal is measured in cells, and a cell is
     the width of one monospace character at the current font size. */
  const fit = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const probe = document.createElement('span')
    probe.textContent = '0000000000'
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:var(--mono);font-size:${FONT_SIZE}px`
    view.appendChild(probe)
    const cellWidth = probe.getBoundingClientRect().width / 10
    const cellHeight = FONT_SIZE * LINE_HEIGHT
    view.removeChild(probe)
    const nextCols = Math.max(20, Math.floor((view.clientWidth - 20) / cellWidth))
    const nextRows = Math.max(6, Math.floor((view.clientHeight - 20) / cellHeight))
    if (nextCols === screen.cols && nextRows === screen.rows) return
    screen.resize(nextCols, nextRows)
    setCols(nextCols)
    setRows(nextRows)
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'resize', cols: nextCols, rows: nextRows }))
    }
    setVersion(value => value + 1)
  }, [screen])

  const connect = useCallback(async () => {
    setPhase('connecting')
    setMessage('')
    try {
      const { ticket } = await createTerminalTicket(engineId)
      const socket = new WebSocket(terminalSocketUrl(engineId, ticket))
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket
      socket.onmessage = event => {
        if (typeof event.data === 'string') {
          let control: { type?: string; cols?: number; rows?: number } = {}
          try { control = JSON.parse(event.data) } catch { /* a text frame that is not control is ignored */ }
          if (control.type === 'ready') {
            setPhase('open')
            retryRef.current = 0
            if (control.cols && control.rows) {
              screen.resize(control.cols, control.rows)
              setCols(control.cols)
              setRows(control.rows)
            }
            fit()
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
        setMessage('The socket to the engine failed.')
      }
    } catch (error) {
      setPhase('error')
      setMessage(error instanceof Error ? error.message : 'Could not reach the engine.')
    }
  }, [engineId, fit, screen])

  useEffect(() => {
    void connect()
    return () => {
      const socket = socketRef.current
      socketRef.current = null
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close()
    }
  }, [connect])

  useEffect(() => {
    fit()
    const view = viewRef.current
    if (!view) return
    const observer = new ResizeObserver(() => fit())
    observer.observe(view)
    return () => observer.disconnect()
  }, [fit])

  /* Output that arrives while the reader is at the bottom keeps them there; output
     that arrives while they are reading further up does not yank them down. */
  useEffect(() => {
    const view = viewRef.current
    if (!view || !pinnedRef.current) return
    view.scrollTop = view.scrollHeight
  }, [version])

  const send = useCallback((data: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !data) return
    socket.send(new TextEncoder().encode(data))
    pinnedRef.current = true
  }, [])

  const type = useCallback((text: string) => {
    send(text)
  }, [send])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1) {
      const code = event.key.toUpperCase().charCodeAt(0)
      if (code >= 64 && code <= 95) {
        event.preventDefault()
        send(String.fromCharCode(code - 64))
        return
      }
    }
    const escape = KEY_ESCAPES[event.key]
    if (escape) {
      event.preventDefault()
      send(escape)
    }
  }, [send])

  const handleInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget
    const value = field.value
    field.value = ''
    if (value) type(value)
  }, [type])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text')
    if (text) send(text.replace(/\r/g, '\r'))
  }, [send])

  const focusField = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  const snapshot = screen.snapshot()
  const lastLine = snapshot.lines.length - 1

  return (
    <section className="terminal-screen" aria-label={`Terminal on ${engineName}`}>
      <header className="terminal-head">
        <button type="button" className="terminal-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Engines</span>
        </button>
        <span className="terminal-title">{engineName}</span>
        <span className={`terminal-state${phase === 'open' ? ' is-live' : ''}`}>
          {phase === 'open' ? `${cols}×${rows}` : phase}
        </span>
      </header>

      <div
        className="terminal-view"
        ref={viewRef}
        onClick={focusField}
        onScroll={event => {
          const view = event.currentTarget
          pinnedRef.current = view.scrollHeight - view.scrollTop - view.clientHeight < 24
        }}
        role="textbox"
        aria-readonly="true"
        aria-label="Terminal output"
        tabIndex={-1}
      >
        <div className="terminal-lines" style={{ fontSize: `${FONT_SIZE}px`, lineHeight: LINE_HEIGHT }}>
          {snapshot.lines.map((line, index) => (
            <div className="terminal-line" key={index}>
              {runs(line).map((run, runIndex) => (
                <span key={runIndex} style={runStyle(run)}>{run.text}</span>
              ))}
              {index === snapshot.cursorRow && phase === 'open' && snapshot.cursor.visible && (
                <span className="terminal-cursor" aria-hidden="true" />
              )}
              {index === lastLine && <span className="terminal-pad" aria-hidden="true"> </span>}
            </div>
          ))}
        </div>
        {phase !== 'open' && (
          <div className="terminal-note">
            {phase === 'connecting' && <span>Connecting to {engineName}…</span>}
            {phase === 'closed' && <span>The shell closed. {message}</span>}
            {phase === 'error' && <span>{message}</span>}
            <button type="button" className="terminal-retry" onClick={() => void connect()}>
              <RotateCw size={14} aria-hidden="true" />
              <span>Reconnect</span>
            </button>
          </div>
        )}
      </div>

      {/* Keystrokes, for a real keyboard and for a phone: the textarea takes whatever
          the keyboard produces, and the strip is what a phone has no key for. */}
      <div className="terminal-keys" aria-label="Terminal keys">
        <button type="button" onClick={() => send('\x1b')} aria-label="Escape">Esc</button>
        <button type="button" onClick={() => send('\t')} aria-label="Tab">Tab</button>
        <button type="button" onClick={() => send('\x03')} aria-label="Control C">^C</button>
        <button type="button" onClick={() => send('\x1b[A')} aria-label="Up"><ArrowUp size={15} aria-hidden="true" /></button>
        <button type="button" onClick={() => send('\x1b[B')} aria-label="Down"><ArrowDown size={15} aria-hidden="true" /></button>
        <button type="button" onClick={() => send('\x1b[D')} aria-label="Left">←</button>
        <button type="button" onClick={() => send('\x1b[C')} aria-label="Right">→</button>
        <button type="button" className="terminal-enter" onClick={() => { send('\r'); focusField() }} aria-label="Enter">
          <CornerDownLeft size={15} aria-hidden="true" />
        </button>
      </div>

      <textarea
        ref={inputRef}
        className="terminal-input"
        aria-label="Terminal input"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onPaste={handlePaste}
      />
    </section>
  )
}
