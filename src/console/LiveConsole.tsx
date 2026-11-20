import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Cpu, HardDrive, MemoryStick, MessagesSquare, SquareTerminal } from 'lucide-react'
import type { Listing, Machine, MachineRef, Metric, Session } from './Console'
import { Console } from './Console'
import { mountPty } from './PtyTerminal'
import { useMachines, useTerminals } from './useLive'
import type { Series } from './useLive'

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

export function LiveConsole({ account, onOpenChat, onSignOut }: {
  account: string
  onOpenChat?: (engineId: string) => void
  onSignOut?: () => void
}) {
  const { machines } = useMachines()
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

  const listing = useMemo<Listing>(
    () => ({
      id: 'engines',
      title: 'Engines',
      count: `${machines.filter(machine => machine.online).length}/${machines.length} up`,
      machines: machines.map<Machine>(machine => ({
        id: machine.id,
        name: machine.name,
        online: machine.online,
        meta: machine.meta,
        metrics: readings(machine.status, machine.series),
      })),
      /* Two verbs, both with a screen behind them: a shell on this machine, and the
         conversation with it. */
      actions: [
        ...(onOpenChat ? [{ id: 'chat', label: 'Chat', icon: MessagesSquare }] : []),
        { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
      ],
    }),
    [machines, onOpenChat],
  )

  const refs = useMemo<MachineRef[]>(
    () => machines.map(machine => ({ id: machine.id, name: machine.name, online: machine.online })),
    [machines],
  )

  const openTerminal = useCallback((engineId: string) => {
    const id = newId()
    setOpening(list => [...list, { id, engine: engineId, title: 'new shell' }])
    setCurrent(id)
    setScreenId('terminal')
  }, [])

  return (
    <Console
      listings={[listing]}
      nav={[{ id: 'engines', label: 'Engines', icon: Boxes }]}
      machines={refs}
      sessions={sessions}
      current={current}
      screenId={sessions.length ? screenId : 'engines'}
      account={account}
      mount={mountPty}
      onScreenId={setScreenId}
      onSession={id => {
        setCurrent(id)
        setScreenId('terminal')
      }}
      onAction={(machineId, action) => {
        if (action === 'terminal') openTerminal(machineId)
        else onOpenChat?.(machineId)
      }}
      onCloseSession={async session => {
        setOpening(list => list.filter(item => item.id !== session.id))
        await close(session)
        setCurrent(sessions.find(item => item.id !== session.id)?.id ?? '')
      }}
      onTerminalReady={() => void refresh()}
      onSignOut={onSignOut}
    />
  )
}
