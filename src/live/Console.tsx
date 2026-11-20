import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConsoleShell, type TerminalRef } from './ConsoleShell'
import { useMachines, useTerminals } from './useLive'

/* What the console is looking at, and what it is looking at it with.
 *
 * The screens are dumb: they draw a machine and a shell. This is the piece that knows
 * a new shell has no name until the engine answers, that closing one has to wait for
 * the engine to agree, and that when the last one goes away there is nothing left to
 * show but the list of engines. */

type Screen = 'engines' | 'terminal'

function newId(): string {
  /* The engine's own shape, so a shell this page opened is the same kind of thing as
     one it found: `t-` and 32 hex characters. */
  return `t-${crypto.randomUUID().replace(/-/g, '')}`
}

export function Console({ account, onOpenChat, onSignOut }: {
  account: string
  onOpenChat?: (engineId: string) => void
  onSignOut: () => void
}) {
  const { machines } = useMachines()
  const online = useMemo(() => machines.filter(machine => machine.online).map(machine => machine.id), [machines])
  const { terminals, refresh, close } = useTerminals(online)

  const [screen, setScreen] = useState<Screen>('engines')
  const [current, setCurrent] = useState('')
  /* A shell that has been asked for but is not in the engine's list yet: it exists the
     moment its socket attaches, which is a frame later than the tap. */
  const [opening, setOpening] = useState<TerminalRef[]>([])

  const all = useMemo<TerminalRef[]>(() => {
    const listed = terminals.map(item => ({
      id: item.id,
      engine: item.engine,
      title: item.title || item.cwd || 'shell',
    }))
    return [...listed, ...opening.filter(item => !listed.some(other => other.id === item.id))]
  }, [terminals, opening])

  /* One rule for what is on screen: a shell if there is one, the engines if not. */
  useEffect(() => {
    if (screen !== 'terminal') return
    if (all.length) {
      if (!all.some(item => item.id === current)) setCurrent(all[0].id)
      return
    }
    setScreen('engines')
    setCurrent('')
  }, [all, current, screen])

  const open = useCallback((engineId: string) => {
    const id = newId()
    setOpening(list => [...list, { id, engine: engineId, title: 'new shell' }])
    setCurrent(id)
    setScreen('terminal')
  }, [])

  const select = useCallback((id: string) => {
    setCurrent(id)
    setScreen('terminal')
  }, [])

  const noteReady = useCallback(() => void refresh(), [refresh])

  const head = all.find(item => item.id === current)

  return (
    <ConsoleShell
      machines={machines}
      terminals={all}
      account={account}
      current={current}
      screen={head ? screen : 'engines'}
      onOpenTerminal={open}
      onSelectTerminal={select}
      onOpenChat={onOpenChat}
      onSignOut={onSignOut}
      onTerminalReady={noteReady}
      onCloseTerminal={async terminal => {
        setOpening(list => list.filter(item => item.id !== terminal.id))
        await close(terminal)
        if (terminal.id === current) {
          const next = all.find(item => item.id !== terminal.id)
          setCurrent(next?.id ?? '')
          if (!next) setScreen('engines')
        }
      }}
      onScreen={next => {
        setScreen(next)
        if (next === 'engines') setCurrent('')
      }}
    />
  )
}
