# Engines screen — round 1 (real data)

The mock became the shipped home screen. What changed is where the numbers come from,
not how the screen behaves.

## Data

| fact | source |
| --- | --- |
| which engines exist | `/api/engines` through `discoverEngines()` |
| is an engine up, CPU, RAM, uptime, version | that engine's own `/healthz` through `getAllEngineStatuses()` |
| who is signed in | `/auth/identity` (Cloudflare Access identity), shown in the existing account menu |

Nothing on the screen is invented. A value an engine does not report prints an em dash
rather than a plausible number, and there is no sparkline: history would have to be
fabricated from a single sample.

## Decisions

- **Offline engines keep their card.** The registry says they exist, so the screen says
  they are down — with the reason the transport gave — instead of hiding them. The count
  pill in the header (`1/2 up`) is the summary.
- **One action per card.** `Chat` moves the active engine first, then opens the chat, so
  the conversation belongs to the card that was pressed.
- **No second colour.** The card is a surface and a hairline; the only colour is the
  online pill, because that is the one fact that changes.
- **`DashboardHome` deleted.** Its device list is the Droidime surface, which is parked:
  the `device` view and `DeviceControl` remain but nothing links to them until the
  Droidime screen is designed.
- **Account name hidden under 760px.** Three controls and an email address do not fit in
  one row on a phone; the address is one tap away in the menu the chevron opens.

## Measured

- 390: two cards, 366×184 px, 12px gap, CPU `12%` / RAM `28.0 of 123.3 GB`, pill `online`,
  offline card dimmed with `—` values and a faded `Chat`.
- 320: no page overflow, top row unclipped, values on one line, subtitle ellipsised.
- 1440: column 720px centred; cards 720×192.
- Audits at 320/390/1440: `pageOverflowX 0`, no low-contrast text, no small targets.

## Not done yet

Terminal. The engine's real terminal is `POST /api/terminals/ticket` followed by a
WebSocket dial to `/terminal?ticket=…`, which sends raw VT — so the browser side needs an
emulator written by hand (no new dependency). That is the next round.
