//! What a console screen offers, copied from the design as it was drawn.
//!
//! One list of verbs and one menu, imported by the shipped console and by the preview
//! alike, so the two cannot drift. Verbs whose screen does not exist yet are still
//! drawn, the way the design has them — they simply have nothing to do when pressed.

import {
  Boxes, Ellipsis, Eye, MessagesSquare, MonitorSmartphone, MousePointerClick,
  Smartphone, Sparkles, SquareTerminal,
} from 'lucide-react'
import type { Action, Listing, Machine, NavItem } from './Console'

/** The menu. A terminal is not on it: a terminal is a session, and sessions are the
 *  strip below the navigation. */
export const NAV: NavItem[] = [
  { id: 'engines', label: 'Engines', icon: Boxes },
  { id: 'droidime', label: 'Droidime', icon: Smartphone },
]

/** What a server card offers, in the design's order. `AI` is the conversation with the
 *  machine, which exists; `Screen` and `More` are drawn and not wired yet. */
export const ENGINE_ACTIONS: Action[] = [
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'screen', label: 'Screen', icon: MonitorSmartphone },
  { id: 'more', label: 'More', icon: Ellipsis },
]

/** A phone is watched or driven, nothing else: two ways to see its screen. */
export const DEVICE_ACTIONS: Action[] = [
  { id: 'view', label: 'View screen', icon: Eye },
  { id: 'control', label: 'Control screen', icon: MousePointerClick },
]

/** The card list as the design draws it: only the machines differ between a fixture
 *  and the registry, never the shape of the screen. */
export function enginesListing(machines: Machine[]): Listing {
  return {
    id: 'engines',
    title: 'Engines',
    count: `${machines.length} engines`,
    machines,
    actions: ENGINE_ACTIONS,
  }
}

export function droidimeListing(machines: Machine[]): Listing {
  return {
    id: 'droidime',
    title: 'Droidime',
    count: `${machines.length} devices`,
    machines,
    actions: DEVICE_ACTIONS,
  }
}

/** The chat is the same verb as the design's `AI`. */
export const CHAT_ACTION = { id: 'ai', label: MessagesSquare.length ? 'AI' : 'AI' } as const
