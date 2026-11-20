//! A live picture of the machine's own display, and a finger on it.
//!
//! The engine sends only what changed: one message per frame is a header, a tile
//! count, then each tile's place in the grid and its JPEG. So the client keeps one
//! canvas and paints tiles onto it, and the picture is complete from the first frame
//! because a newcomer is handed a full one.
//!
//! Taps go back the same way as numbers in the frame's own pixels, never in CSS
//! pixels: the picture is scaled to whatever width the screen has, and the machine
//! must be told where on its own display the finger landed.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as api from '../api'

/** What one binary frame looks like on the wire. */
interface FrameBatch {
  header: { width: number; height: number; tile: number }
  tiles: { col: number; row: number; width: number; height: number; jpeg: Uint8Array }[]
}

/** Walks one batch. Fixed-width lengths everywhere, so no parser is needed. */
export function readBatch(buffer: ArrayBuffer): FrameBatch | null {
  if (buffer.byteLength < 4) return null
  const view = new DataView(buffer)
  const headerLength = view.getUint32(0, true)
  if (buffer.byteLength < 4 + headerLength + 4) return null
  let header: { width: number; height: number; tile: number }
  try {
    header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)))
  } catch {
    return null
  }
  let offset = 4 + headerLength
  const count = view.getUint32(offset, true)
  offset += 4
  const tiles: FrameBatch['tiles'] = []
  for (let index = 0; index < count; index += 1) {
    if (offset + 12 > buffer.byteLength) return null
    const col = view.getUint16(offset, true)
    const row = view.getUint16(offset + 2, true)
    const width = view.getUint16(offset + 4, true)
    const height = view.getUint16(offset + 6, true)
    const length = view.getUint32(offset + 8, true)
    offset += 12
    if (offset + length > buffer.byteLength) return null
    tiles.push({ col, row, width, height, jpeg: new Uint8Array(buffer, offset, length) })
    offset += length
  }
  return { header, tiles }
}

/** How the console mounts a screen: it hands over the machine, and gets back what to
 *  draw. The panel keeps its own socket, its own canvas and its own status line. */
export type ScreenMount = (machine: { id: string; name: string }) => ReactNode

export function mountScreen(machine: { id: string; name: string }): ReactNode {
  return <ScreenShell key={machine.id} machine={machine} />
}

type Phase = 'connecting' | 'open' | 'closed'

/* What the phone's own keyboard calls a key, and what X calls it. A screen has no
   text field of its own, so these are the only keys that can be sent by name. */
const KEYSYMS: Record<string, string> = {
  Enter: 'Return',
  Backspace: 'BackSpace',
  Delete: 'Delete',
  Tab: 'Tab',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'Prior',
  PageDown: 'Next',
}

function ScreenShell({ machine }: { machine: { id: string; name: string } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const typingRef = useRef<HTMLInputElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const paints = useRef(0)
  /* The picture's own size, so a finger can be turned into the machine's pixels. */
  const sizeRef = useRef({ width: 0, height: 0 })
  /* The finger that is currently down, if any: without it a move is only a move. */
  const holding = useRef<number | null>(null)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [note, setNote] = useState('')
  const [attempt, setAttempt] = useState(0)

  const dial = useCallback(async () => {
    const signal = { cancelled: false }
    setPhase('connecting')
    setNote('Connecting to the display…')
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return () => { signal.cancelled = true }

    let socket: WebSocket
    try {
      const ticket = await api.createScreenTicket(machine.id)
      if (signal.cancelled) return () => {}
      socket = new WebSocket(api.screenSocketUrl(machine.id, ticket.ticket, { width: canvas.width || 480, fps: 8 }))
    } catch (error) {
      if (!signal.cancelled) {
        setPhase('closed')
        setNote(error instanceof Error ? error.message : 'The display did not answer.')
      }
      return () => { signal.cancelled = true }
    }
    socketRef.current = socket
    socket.binaryType = 'arraybuffer'

    socket.onmessage = event => {
      if (typeof event.data === 'string') {
        /* The hello says how big the picture will be before any tile arrives. */
        try {
          const hello = JSON.parse(event.data) as { width?: number; height?: number; codec?: string }
          if (hello.codec && hello.codec !== 'jpeg') {
            setNote('This engine is sending a picture this screen cannot decode.')
            return
          }
        } catch {
          return
        }
        return
      }
      const batch = readBatch(event.data as ArrayBuffer)
      if (!batch) return
      const { width, height, tile } = batch.header
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      sizeRef.current = { width, height }
      for (const square of batch.tiles) {
        const bytes = new Uint8Array(square.jpeg.length)
        bytes.set(square.jpeg)
        const jpeg = new Blob([bytes], { type: 'image/jpeg' })
        void createImageBitmap(jpeg).then(bitmap => {
          context.drawImage(bitmap, square.col * tile, square.row * tile)
          bitmap.close()
          paints.current += 1
          if (paints.current === 1) {
            setPhase('open')
            setNote('')
          }
        }).catch(() => {
          /* A tile that fails to decode leaves the previous picture in place, which
             is better than a hole. */
        })
      }
    }
    socket.onerror = () => {
      setPhase('closed')
      setNote('The display stopped answering.')
    }
    socket.onclose = () => {
      setPhase('closed')
      setNote(current => current || 'The display closed.')
    }
    return () => {
      signal.cancelled = true
      socket.close()
    }
  }, [machine.id])

  useEffect(() => {
    let cleanUp: (() => void) | undefined
    void dial().then(stop => { cleanUp = stop })
    return () => { cleanUp?.(); socketRef.current?.close() }
  }, [dial, attempt])

  /* A press is a move and a click in one, so the machine never sees the pointer
     travel to where the finger already was. Dragging sends the ones in between: a
     machine's own drag and drop needs the pointer to pass over what it drops on. */
  const where = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const { width, height } = sizeRef.current
    const rect = canvas?.getBoundingClientRect()
    if (!canvas || !rect || !rect.width || !width || !height) return null
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * height),
    }
  }

  const post = (message: unknown) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }

  /* The phone's keyboard is the machine's keyboard: what it types is sent as text,
     because a layout the machine cannot produce — Thai, emoji — is typed by
     borrowing a keycode rather than silently dropped. */
  const type = (text: string) => {
    if (text) post({ type: 'text', text })
  }

  return (
    <div className="screen-live">
      <div className="screen-live-stage">
        <canvas
          ref={canvasRef}
          className="screen-live-canvas"
          width={480}
          height={720}
          aria-label={`The screen of ${machine.name}`}
          onPointerDown={event => {
            const at = where(event)
            if (!at) return
            /* The keyboard follows the tap: a screen is typed into where it is
               touched, and the field itself is never shown. */
            typingRef.current?.focus({ preventScroll: true })
            holding.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            post({ type: 'down', ...at, button: 'left' })
          }}
          onPointerMove={event => {
            if (holding.current !== event.pointerId) return
            const at = where(event)
            if (at) post({ type: 'move', ...at })
          }}
          onPointerUp={event => {
            const at = where(event)
            if (!at || holding.current !== event.pointerId) return
            holding.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
            post({ type: 'up', ...at, button: 'left' })
          }}
          onPointerCancel={() => { holding.current = null }}
          onWheel={event => {
            const at = where(event as unknown as React.PointerEvent<HTMLCanvasElement>)
            if (!at) return
            event.preventDefault()
            post({ type: 'wheel', ...at, delta: event.deltaY > 0 ? 1 : -1 })
          }}
        />
        {/* Nothing is drawn here: it exists so the phone's keyboard has something to
            type into, and it is the machine that does the showing. */}
        <input
          ref={typingRef}
          className="screen-live-keys"
          aria-label={`Type on ${machine.name}`}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={event => {
            type(event.target.value)
            event.target.value = ''
          }}
          onKeyDown={event => {
            const keysym = KEYSYMS[event.key]
            if (!keysym) return
            event.preventDefault()
            post({ type: 'key', keysym, mods: [] })
          }}
        />
      </div>
      {phase !== 'open' && (
        <p className="screen-live-note">
          <span>{note || 'Waiting for the display…'}</span>
          {phase === 'closed' && (
            <button type="button" className="terminal-retry" onClick={() => setAttempt(count => count + 1)}>
              Try again
            </button>
          )}
        </p>
      )}
    </div>
  )
}
