//! What a console screen offers: one list of verbs and one menu, used by the shipped
//! console and by the preview alike.
//!
//! It exists because a preview that promises a verb the app does not have is a lie
//! about the app, and two copies of "the menu" always drift. Anything not wired yet is
//! simply absent — a button that cannot do its job is worse than no button.

import { Boxes, MessagesSquare, SquareTerminal } from 'lucide-react'
import type { Action, Listing, Machine, NavItem } from './Console'

/** The menu. A terminal is not on it: a terminal is a session, and sessions are the
 *  strip below the navigation. */
export const NAV: NavItem[] = [{ id: 'engines', label: 'Engines', icon: Boxes }]

/** What a machine card offers. Both verbs have a screen behind them: the shell on this
 *  machine, and the conversation with it. */
export const CARD_ACTIONS: Action[] = [
  { id: 'chat', label: 'Chat', icon: MessagesSquare },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
]

/** The one card list, assembled the same way whether the machines are real or a
 *  fixture: only the machine differs, never the shape of the card. */
export function enginesListing(machines: Machine[], online: number, total: number): Listing {
  return {
    id: 'engines',
    title: 'Engines',
    count: `${online}/${total} up`,
    machines,
    actions: CARD_ACTIONS,
  }
}
