import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import * as api from '../api'
import { Screen, runs } from '../term/vt.js'
import { keyBytes } from '../term/keys.js'
import type { Session, TerminalHandle, TerminalMount } from './Console'

/* A shell on an engine, drawn as the console's terminal.
 *
 * The console owns the chrome — the keys, the box, the `>_` switch — and this owns the
 * bytes: a ticket, a socket, and a grid of cells drawn from what the pty writes. It
 * hands the console a handle so a key press becomes the sequence a shell expects, and
 * gives back what to draw. */

type Phase = 'connecting' | 'open' | 'closed' | 'error'

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

export const mountPty: TerminalMount = (session, { logRef, onHandle }) => ({
  echo: false,
  content: <PtyShell session={session} logRef={logRef} onHandle={onHandle} />,
})

function PtyShell({
  session,
  logRef,
  onHandle,
}: {
  session: Session
  logRef: React.RefObject<HTMLPreElement | null>
  onHandle: (handle: TerminalHandle) => void
}) {
  const socketRef = useRef<WebSocket | null>(null)
  const pinnedRef = useRef(true)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [note, setNote] = useState('')
  const [, setVersion] = useState(0)

  /* The screen model is the terminal's memory: the pty sends bytes, and bytes are
     useless to a DOM until something turns them into cells. */
  const screen = useMemo(() => new Screen({ cols: 80, rows: 24 }), [])

  const send = useCallback((data: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !data) return
    /* The pty reads bytes, and a text frame is the control channel: this has to be
       binary or the shell sees JSON. */
    socket.send(new TextEncoder().encode(data))
    pinnedRef.current = true
  }, [])

  const size = useCallback((): { cols: number; rows: number } => {
    const log = logRef.current
    if (!log) return { cols: screen.cols, rows: screen.rows }
    /* Both numbers are measured from the font that is actually drawn: a cell is one
       character wide and one line tall, and a phone's monospace is not always the size
       it was asked for. Two pixels of slack keep a scrollbar off a grid that fits. */
    const probe = document.createElement('span')
    probe.textContent = '0000000000'
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;line-height:inherit'
    log.appendChild(probe)
    const box = probe.getBoundingClientRect()
    log.removeChild(probe)
    const cellWidth = box.width / 10 || 8
    const lineHeight = box.height || 18.85
    return {
      cols: Math.max(20, Math.floor((log.clientWidth - 2) / cellWidth)),
      rows: Math.max(6, Math.floor((log.clientHeight - 2) / lineHeight)),
    }
  }, [logRef, screen])

  const connect = useCallback(async () => {
    setPhase('connecting')
    setNote('')
    const { cols, rows } = size()
    try {
      const { ticket } = await api.createTerminalTicket(session.engine)
      const socket = new WebSocket(
        api.terminalSocketUrl(session.engine, ticket, { id: session.id, cols, rows }),
      )
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket
      socket.onmessage = event => {
        if (typeof event.data === 'string') {
          let control: { type?: string; error?: string } = {}
          try { control = JSON.parse(event.data) } catch { return }
          if (control.type === 'ready') setPhase('open')
          else if (control.type === 'error') {
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
  }, [screen, session.engine, session.id, size])

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
  }, [logRef, screen, size])

  /* A terminal keeps its newest line in view. */
  useEffect(() => {
    const log = logRef.current
    if (!log || !pinnedRef.current) return
    log.scrollTop = log.scrollHeight
  })

  useEffect(() => {
    onHandle({
      /* A chord is the console's own bookkeeping; a shell wants bytes. The rows carry
         no letters, so the modifier is only ever a note about what was pressed — the
         key the modifier was held with is this key, and keyBytes says what that means. */
      onKey: (key: string, chord: string) => {
        const data = keyBytes(key, chord)
        if (data) send(data)
      },
      onCommand: (line: string) => send(`${line}\r`),
      /* Trash empties the screen: the shell keeps its state, the reader loses the
         scrollback. */
      onClear: () => {
        screen.reset()
        setVersion(value => value + 1)
      },
      /* Reset replaces the shell, the same thing `exec $SHELL` does to a live one. */
      onReset: () => send('exec $SHELL\r'),
    })
  }, [onHandle, screen, send])

  const snapshot = screen.snapshot()
  const cursorVisible = phase === 'open' && snapshot.cursor.visible

  return (
    <>
      {snapshot.lines.map((line, index) => (
        <span className="terminal-line" key={index}>
          {runs(line).map((run, runIndex) => (
            <span key={runIndex} style={runStyle(run)}>{run.text}</span>
          ))}
          {index === snapshot.cursorRow && cursorVisible && (
            <span className="terminal-caret" aria-hidden="true" />
          )}
          {index === snapshot.lines.length - 1 && <span aria-hidden="true"> </span>}
        </span>
      ))}

      {/* A shell that is not open says so where the prompt would be, and says the one
          thing that can be done about it next to it. */}
      {phase !== 'open' && (
        <span className="terminal-line is-note terminal-status">
          {phase === 'connecting'
            ? 'Connecting to the shell…'
            : phase === 'closed'
              ? 'The shell closed.'
              : note}
          <button type="button" className="terminal-retry" onClick={() => void connect()}>
            <RotateCw size={12} aria-hidden="true" />
            <span>Reconnect</span>
          </button>
        </span>
      )}
    </>
  )
}
