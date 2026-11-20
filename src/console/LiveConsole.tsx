import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cpu, HardDrive, MemoryStick } from 'lucide-react'
import type { Listing, Machine, MachineRef, Metric, Session } from './Console'
import { Console } from './Console'
import { mountPty } from './PtyTerminal'
import { mountScreen } from './ScreenPane'
import { useMachines, useTerminals } from './useLive'
import type { Series } from './useLive'
import { NAV, droidimeListing, enginesListing } from './vocabulary'
import { DROIDIME_DEVICES } from './placeholders'
import { EngineChat } from '../dashboard'
import * as api from '../api'

/* The console on the registry.
 *
 * The screens know nothing about engines: they draw a machine and a shell. This is the
 * piece that knows what a machine is made of — the readings the engine reports and the
 * history behind them — and that a shell has no name until the engine answers. */

const GB = 1024 ** 3

function gb(bytes: number | null | undefined): number | undefined {
  return typeof bytes === 'number' && Number.isFinite(bytes) ? bytes / GB : undefined
}

function readings(status: ReturnType<typeof useMachines>['machines'][number]['status'], series: Series): Metric[] {
  const metrics = status?.metrics
  return [
    { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: series.cpu },
    {
      label: 'RAM',
      icon: MemoryStick,
      unit: 'GB',
      digits: 1,
      total: gb(metrics?.memoryTotalBytes)?.toFixed(0),
      series: series.ram,
    },
    {
      label: 'DISK',
      icon: HardDrive,
      unit: 'GB',
      digits: 1,
      total: gb(metrics?.diskTotalBytes)?.toFixed(0),
      series: series.disk,
    },
  ]
}

function newId(): string {
  /* The engine's own shape, so a shell this page opened is the same kind of thing as
     one it found: `t-` and 32 hex characters. */
  return `t-${crypto.randomUUID().replace(/-/g, '')}`
}

export function LiveConsole({ account, onSignOut }: {
  account: string
  onSignOut?: () => void
}) {
  const { machines, refresh: refreshMachines } = useMachines()
  const online = useMemo(() => machines.filter(machine => machine.online).map(machine => machine.id), [machines])
  const { terminals, refresh, close } = useTerminals(online)

  const [screenId, setScreenId] = useState('engines')
  const [current, setCurrent] = useState('')
  /* A shell that has been asked for but is not in the engine's list yet: it exists the
     moment its socket attaches, which is a frame later than the tap. */
  const [opening, setOpening] = useState<Session[]>([])

  const sessions = useMemo<Session[]>(() => {
    const listed = terminals.map(item => ({
      id: item.id,
      engine: item.engine,
      title: item.title || item.cwd || 'shell',
    }))
    return [...listed, ...opening.filter(item => !listed.some(other => other.id === item.id))]
  }, [terminals, opening])

  /* One rule for what is on screen: a shell if there is one, the engines if not. */
  useEffect(() => {
    if (screenId !== 'terminal') return
    if (sessions.length) {
      if (!sessions.some(session => session.id === current)) setCurrent(sessions[0].id)
      return
    }
    setScreenId('engines')
    setCurrent('')
  }, [current, screenId, sessions])

  /* The screens come from the shared vocabulary, so the app and the design cannot
     disagree about what a card offers. Droidime is drawn as designed and nothing is
     wired to it yet. */
  const listings = useMemo<Listing[]>(() => {
    const cards = machines.map<Machine>(machine => ({
      id: machine.id,
      name: machine.name,
      online: machine.online,
      meta: machine.meta,
      metrics: readings(machine.status, machine.series),
    }))
    return [enginesListing(cards), droidimeListing(DROIDIME_DEVICES)]
  }, [machines])

  const refs = useMemo<MachineRef[]>(
    () => machines.map(machine => ({ id: machine.id, name: machine.name, online: machine.online })),
    [machines],
  )

  /* A screen is one machine's display, opened from its card and left by the menu. */
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null)
  const openScreen = useCallback((engineId: string, name: string) => {
    setViewing({ id: engineId, name })
    setScreenId('screen')
  }, [])

  const openTerminal = useCallback((engineId: string) => {
    const id = newId()
    setOpening(list => [...list, { id, engine: engineId, title: 'new shell' }])
    setCurrent(id)
    setScreenId('terminal')
  }, [])

  /* The chat belongs to one engine, so the engine the card belongs to becomes the
     active one before the screen changes. It is a screen of the console, drawn in the
     same frame: the bar, the menu and the gesture stay. */
  const openChat = useCallback((engineId: string) => {
    api.setActiveEngineId(engineId)
    setScreenId('chat')
  }, [])

  return (
    <Console
      listings={listings}
      nav={NAV}
      machines={refs}
      sessions={sessions}
      current={current}
      screenId={screenId}
      account={account}
      mount={mountPty}
      mountScreen={machine => mountScreen(machine)}
      viewing={viewing}
      pane={screenId === 'chat' ? { id: 'chat', content: <EngineChat onBack={() => setScreenId('engines')} /> } : null}
      onScreenId={setScreenId}
      onSession={id => {
        setCurrent(id)
        setScreenId('terminal')
      }}
      onAction={(machineId, action) => {
        /* Two verbs have a screen behind them; the rest are drawn and not wired. */
        if (action === 'terminal') openTerminal(machineId)
        else if (action === 'ai') openChat(machineId)
        else if (action === 'screen') openScreen(machineId, machines.find(m => m.id === machineId)?.name ?? machineId)
      }}
      onCloseSession={async session => {
        setOpening(list => list.filter(item => item.id !== session.id))
        await close(session)
        setCurrent(sessions.find(item => item.id !== session.id)?.id ?? '')
      }}
      onTerminalReady={() => void refresh()}
      onRefresh={() => {
        void refreshMachines()
        void refresh()
      }}
      onSignOut={onSignOut}
    />
  )
}
