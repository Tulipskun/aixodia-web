//! The mock, as a set of fixtures for the real console.
//!
//! The console that ships is the same component this page previews: the sheet, the
//! bar, the drawer, the cards and the key rows are one code path. What is different
//! here is only that the machines, the sessions and the terminal are literals — a
//! fixed history and a transcript that answers the keys it is sent.

import { useEffect, useRef, useState } from 'react'
import { Cpu, HardDrive, MemoryStick } from 'lucide-react'
import type { Machine, Session, TerminalHandle, TerminalMount } from '../console/Console'
import { Console, sampleSeries } from '../console/Console'
import { NAV, droidimeListing, enginesListing } from '../console/vocabulary'
import { DROIDIME_DEVICES } from '../console/placeholders'

/* ---------------------------------------------------------------- fixtures */

const WINDOW = 20

const MACHINES: Machine[] = [
  {
    id: 'alpha', name: 'Alpha', online: true, meta: 'up 12h 40m',
    metrics: [
      { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: sampleSeries(7, 46, 26, WINDOW) },
      { label: 'RAM', icon: MemoryStick, unit: 'GB', digits: 1, total: '128', series: sampleSeries(19, 100.4, 1.6, WINDOW) },
      { label: 'DISK', icon: HardDrive, unit: 'GB', digits: 1, total: '256', series: Array.from({ length: WINDOW }, () => 164.2) },
    ],
  },
  {
    id: 'beta', name: 'Beta', online: false, meta: 'last seen 4h ago',
    metrics: [
      { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: [] },
      { label: 'RAM', icon: MemoryStick, unit: 'GB', digits: 1, total: '128', series: [] },
      { label: 'DISK', icon: HardDrive, unit: 'GB', digits: 1, total: '256', series: [] },
    ],
  },
]

const LISTINGS = [enginesListing(MACHINES), droidimeListing(DROIDIME_DEVICES)]

/* The terminal a fixture mounts: a transcript that answers the keys it is sent, with
   the same three-colour prompt and the same lease facts the engine reports. */
const TRANSCRIPT: { kind: 'cmd' | 'out' | 'note'; text: string }[] = [
  { kind: 'cmd', text: 'aixodia status'},
  { kind: 'out', text: 'engine   m-8a7d1192 · v1.177'},
  { kind: 'out', text: 'lease    3s ago · ttl 60s'},
  { kind: 'cmd', text: 'aixodia lease'},
  { kind: 'out', text: 'writer   engine · every 20s'},
  { kind: 'out', text: 'reader   gateway · every 10s'},
  { kind: 'cmd', text: 'curl -s engine/healthz'},
  { kind: 'note', text: '{"ok":true,"ms":0.7}'},
  { kind: 'cmd', text: 'tail -n 2 aeo.ndjson'},
  { kind: 'note', text: '{"t":"run","ok":true,"ms":41}'},
  { kind: 'note', text: '{"t":"beat","ok":true}'},
]

/* One shell's transcript, kept out of the component so switching tabs does not lose
   it: sessions outlive the tab that showed them. */
const LINES = new Map<string, { kind: 'cmd' | 'out' | 'note' | 'sent'; text: string }[]>()

function FixtureTerminal({ session, onHandle }: { session: Session; onHandle: (handle: TerminalHandle) => void }) {
  const [lines, setLines] = useState<{ kind: 'cmd' | 'out' | 'note' | 'sent'; text: string }[]>(LINES.get(session.id) ?? [])
  const [wiped, setWiped] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [lines, wiped])
  useEffect(() => { LINES.set(session.id, lines) }, [lines, session.id])

  useEffect(() => {
    onHandle({
      onKey: (key, chord) => {
        setLines(list => [...list, { kind: 'sent', text: `· ${chord ? `${chord}+` : ''}${key}` }])
      },
      onCommand: command => setLines(list => [...list, { kind: 'cmd', text: command }, { kind: 'note', text: '{"t":"run","ok":true,"ms":41}' }]),
      onClear: () => {
        setWiped(true)
        setLines([])
      },
      onReset: () => {
        setWiped(true)
        setLines([{ kind: 'cmd', text: 'exec $SHELL' }])
      },
    })
  }, [onHandle])

  return (
    <>
      {(!wiped ? [...TRANSCRIPT, ...lines] : lines).map(({ kind, text }, index) => {
        return (
          <span key={`${index}-${text}`} className={`terminal-line is-${kind}`}>
            {kind === 'cmd' ? (
              <>
                <span className="terminal-user">root</span> <span className="terminal-cwd">~</span>{' '}
                <span className="terminal-mark">$</span> <span>{text}</span>
              </>
            ) : (
              text
            )}
          </span>
        )
      })}
    </>
  )
}

const mountFixture: TerminalMount = (session, { logRef, onHandle }) => ({
  echo: true,
  content: <FixtureTerminal key={session.id} session={session} onHandle={onHandle} />,
})

function useFixture() {
  const [sessions, setSessions] = useState<Session[]>([
    { id: 's1', engine: 'alpha', title: 'shell 1' },
    { id: 's2', engine: 'alpha', title: 'shell 2' },
    { id: 's3', engine: 'beta', title: 'logs' },
  ])
  const [current, setCurrent] = useState('s1')
  const [screenId, setScreenId] = useState('engines')
  return {
    sessions, current, screenId,
    setSessions, setCurrent, setScreenId,
    add: (engine: string) => {
      const session: Session = {
        id: `s${Date.now()}`,
        engine,
        title: `shell ${sessions.filter(s => s.engine === engine).length + 1}`,
      }
      setSessions(list => [...list, session])
      setCurrent(session.id)
      setScreenId('terminal')
    },
    close: (session: Session) => {
      setSessions(list => list.filter(item => item.id !== session.id))
      const left = sessions.filter(item => item.id !== session.id)
      const next = left.find(item => item.engine === session.engine) ?? left[0]
      setCurrent(next?.id ?? '')
      if (!next) setScreenId('engines')
    },
  }
}

/** A fixture display: a still picture, drawn once, so the preview shows the screen
 *  the app shows without pretending to be a stream. */
function FixtureScreen({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const { width, height } = canvas
    context.fillStyle = '#101014'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#16161b'
    context.fillRect(0, 0, width, 34)
    context.fillStyle = '#1d1d24'
    context.fillRect(18, 60, width - 36, height - 120)
    context.strokeStyle = '#2a2a33'
    context.strokeRect(18, 60, width - 36, height - 120)
    context.fillStyle = '#7fa6d3'
    context.fillRect(36, 84, 120, 10)
    context.fillStyle = '#4a4a55'
    for (let line = 0; line < 6; line += 1) {
      context.fillRect(36, 116 + line * 22, width - 140 - (line % 3) * 40, 8)
    }
    context.fillStyle = '#585862'
    context.font = '13px system-ui, sans-serif'
    context.fillText(`${name} · fixture display`, 36, height - 40)
  }, [name])
  return (
    <div className="screen-live">
      <div className="screen-live-stage">
        <canvas ref={canvasRef} className="screen-live-canvas" width={480} height={720} aria-label={`The screen of ${name}`} />
      </div>
    </div>
  )
}

export function EnginesMock() {
  const fixture = useFixture()
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null)
  /* A shell whose engine is down cannot be opened, so it is offered nowhere: not in
     the menu, and not as the tab the screen falls back to. */
  const open = fixture.sessions.filter(session =>
    MACHINES.find(machine => machine.id === session.engine)?.online,
  )

  return (
    <Console
      listings={LISTINGS}
      nav={NAV}
      machines={MACHINES.map(machine => ({ id: machine.id, name: machine.name, online: machine.online }))}
      sessions={open}
      current={fixture.current}
      screenId={fixture.screenId}
      account="Tulipskun"
      mount={mountFixture}
      mountScreen={machine => <FixtureScreen key={machine.id} name={machine.name} />}
      viewing={viewing}
      pane={null}
      onScreenId={fixture.setScreenId}
      onSession={id => {
        fixture.setCurrent(id)
        fixture.setScreenId('terminal')
      }}
      onAction={(machineId, action) => {
        if (action === 'terminal') fixture.add(machineId)
        /* A fixture has no display to stream, but the screen the action opens is the
           same screen, so the preview can be walked the same way. */
        if (action === 'screen') {
          setViewing({ id: machineId, name: MACHINES.find(m => m.id === machineId)?.name ?? machineId })
          fixture.setScreenId('screen')
        }
      }}
      onCloseSession={fixture.close}
      onTerminalReady={() => undefined}
    />
  )
}