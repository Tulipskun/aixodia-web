import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bot, LoaderCircle, MessageSquare, Plus, Send, Square, X } from 'lucide-react'
import * as api from './api'
import type { EngineEvent, EngineSession, EngineTurn } from './types'
import { NAV } from './console/vocabulary'

/* The way out of a chat is back to the list of machines, and it says so with the same
   word the menu uses. */
const BACK_LABEL = NAV[0].label

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; error?: boolean; tool?: string }

function parseEvents(raw: string): EngineEvent[] {
  const result: EngineEvent[] = []
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const dataLine = block.split(/\r?\n/).find(line => line.startsWith('data:'))
    if (!dataLine) continue
    try {
      const value = JSON.parse(dataLine.slice(5).trim()) as EngineEvent
      if (value && typeof value.seq === 'number' && typeof value.kind === 'string') result.push(value)
    } catch { /* Ignore incomplete event frames. */ }
  }
  return result
}
function sessionTitle(session: EngineSession): string {
  return session.title?.trim() || 'New chat'
}

export function EngineChat({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<EngineSession[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [activity, setActivity] = useState('')
  const [error, setError] = useState('')
  const [railOpen, setRailOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRun = useRef('')
  const stopPolling = useRef(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const loadTurns = useCallback(async (id: string) => {
    const result = await api.getEngineTurns(id)
    setMessages(result.turns.map((turn: EngineTurn) => ({
      id: String(turn.id || turn.seq),
      role: (turn.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      text: turn.text || (turn.role === 'assistant' ? ' ' : ''),
    })).filter(message => message.text.trim()))
  }, [])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getEngineSessions()
      const ordered = [...result.sessions].sort((a, b) => b.updated_at - a.updated_at)
      setSessions(ordered)
      if (ordered.length) {
        const next = ordered[0].id
        setSelected(next)
        await loadTurns(next)
      } else {
        const created = await api.createEngineSession()
        setSessions([created])
        setSelected(created.id)
        setMessages([])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load chat history')
    } finally {
      setLoading(false)
    }
  }, [loadTurns])

  useEffect(() => {
    void loadSessions()
    return () => { stopPolling.current = true }
  }, [loadSessions])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, activity])

  const chooseSession = async (id: string) => {
    if (sending || id === selected) { setRailOpen(false); return }
    setSelected(id)
    setRailOpen(false)
    setError('')
    setLoading(true)
    try { await loadTurns(id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load conversation') }
    finally { setLoading(false) }
  }

  const newSession = async () => {
    if (sending) return
    setError('')
    try {
      const created = await api.createEngineSession()
      setSessions(current => [created, ...current])
      setSelected(created.id)
      setMessages([])
      setRailOpen(false)
      composerRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create a new chat')
    }
  }

  const send = async () => {
    const message = draft.trim()
    if (!message || sending || !selected) return
    setDraft('')
    setError('')
    setSending(true)
    stopPolling.current = false
    const userId = `local-user-${Date.now()}`
    const assistantId = `local-assistant-${Date.now()}`
    setMessages(current => [...current, { id: userId, role: 'user', text: message }, { id: assistantId, role: 'assistant', text: '' }])
    try {
      const created = await api.startEngineRun(selected, message)
      activeRun.current = created.run.id
      let cursor = 0
      let terminal = false
      const assistantText = { value: '' }
      const startedAt = Date.now()
      while (!terminal && !stopPolling.current && Date.now() - startedAt < 15 * 60_000) {
        const raw = await api.getEngineEvents(created.run.id, cursor)
        const events = parseEvents(raw)
        for (const event of events) {
          cursor = Math.max(cursor, event.seq)
          const data = event.data || {}
          if (event.kind === 'assistant') {
            const part = typeof data.text === 'string' ? data.text : ''
            if (part) {
              assistantText.value += part
              setMessages(current => current.map(item => item.id === assistantId ? { ...item, text: assistantText.value } : item))
            }
            setActivity('')
          } else if (event.kind === 'tool') {
            const name = typeof data.name === 'string' ? data.name : 'tool'
            const stage = typeof data.stage === 'string' ? data.stage : ''
            setActivity(stage === 'tool_result' ? `Completed ${name}` : `Running ${name}…`)
          } else if (event.kind === 'reasoning') {
            setActivity('Thinking…')
          } else if (event.kind === 'final') {
            const turn = data.turn as Record<string, unknown> | undefined
            const finalText = typeof turn?.text === 'string' ? turn.text : ''
            if (!assistantText.value && finalText) {
              assistantText.value = finalText
              setMessages(current => current.map(item => item.id === assistantId ? { ...item, text: finalText } : item))
            }
          } else if (event.kind === 'error') {
            const detail = typeof data.message === 'string' ? data.message : 'The engine returned an error.'
            setError(detail)
            setMessages(current => current.map(item => item.id === assistantId ? { ...item, error: true, text: item.text || detail } : item))
          } else if (event.kind === 'status') {
            const status = typeof data.status === 'string' ? data.status : ''
            if (['done', 'failed', 'cancelled', 'interrupted'].includes(status)) terminal = true
          }
        }
        if (!events.length && !terminal && !stopPolling.current) await new Promise(resolve => window.setTimeout(resolve, 280))
      }
      if (!terminal && !stopPolling.current) setError('The run timed out while waiting for the engine.')
      try { await loadTurns(selected) } catch { /* Keep the streamed response if history is briefly delayed. */ }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Unable to send this message'
      setError(detail)
      setMessages(current => current.map(item => item.id === assistantId ? { ...item, text: item.text || detail, error: true } : item))
    } finally {
      activeRun.current = ''
      setActivity('')
      setSending(false)
    }
  }

  const stop = async () => {
    stopPolling.current = true
    const runId = activeRun.current
    if (runId) {
      try { await api.cancelEngineRun(runId) } catch { /* The run may have ended already. */ }
    }
    setSending(false)
    setActivity('')
  }

  return (
    <section className="chat-view">
      {railOpen && <button className="chat-rail-scrim" aria-label="Close chat list" onClick={() => setRailOpen(false)} />}
      <aside className={`chat-rail ${railOpen ? 'is-open' : ''}`}>
        <div className="chat-rail-head">
          <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={17} /> {BACK_LABEL}</button>
          <button className="icon-action" type="button" aria-label="Close chat list" onClick={() => setRailOpen(false)}><X size={17} /></button>
        </div>
        <button className="new-chat-button" type="button" onClick={() => void newSession()}><Plus size={17} /> New chat</button>
        <div className="chat-session-list">
          {sessions.map(item => (
            <button key={item.id} type="button" className={`chat-session-item ${selected === item.id ? 'is-selected' : ''}`} onClick={() => void chooseSession(item.id)}>
              <MessageSquare size={15} />
              <span>{sessionTitle(item)}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="chat-main">
        <header className="chat-header">
          <button className="icon-action mobile-chat-menu" type="button" aria-label="Open chat list" onClick={() => setRailOpen(true)}><MessageSquare size={18} /></button>
          <div><strong>AIxodia</strong><span><span className="state-dot is-online-dot" /> Engine chat</span></div>
          <button className="back-button chat-back-desktop" type="button" onClick={onBack}>{BACK_LABEL}</button>
        </header>
        <div className="chat-messages" ref={scrollRef}>
          {loading ? <div className="chat-empty"><LoaderCircle className="spin" size={22} /> Loading…</div> :
            messages.map(message => (
              <article key={message.id} className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'} ${message.error ? 'has-error' : ''}`}>
                {message.role === 'assistant' && <div className="message-avatar"><Bot size={16} /></div>}
                <div className="message-content">
                  {message.text.trim() ? <p>{message.text}</p> : <span className="typing-dots"><i /><i /><i /></span>}
                </div>
              </article>
            ))
          }
          {activity && sending && <div className="chat-activity"><LoaderCircle className="spin" size={14} /> {activity}</div>}
          {error && <div className="chat-error">{error}</div>}
        </div>
        <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send() }}>
          <textarea
            ref={composerRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
            }}
            placeholder="Message AIxodia…"
            rows={1}
            disabled={loading || !selected}
          />
          {sending ? (
            <button className="send-button stop-button" type="button" aria-label="Stop generating" onClick={() => void stop()}><Square size={15} /></button>
          ) : (
            <button className="send-button" type="submit" aria-label="Send message" disabled={!draft.trim() || loading || !selected}><Send size={16} /></button>
          )}
        </form>
      </div>
    </section>
  )
}
