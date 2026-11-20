# Live console — engines and terminals on real data

The mock (`src/mock/EnginesMock.tsx`) became the console (`src/live/`), so the screens a
logged-in reader sees are the ones that were designed, drawn by the same CSS
(`src/live/live.css`, a copy of the mock's sheet) and fed by the engine instead of by a
constant.

## What is where

| File | Job |
| --- | --- |
| `src/live/live.css` | The design: tokens, bar, drawer, cards, readings, dialog, key rows. Copied from `src/mock/mock.css`; the only edits are the notes below. |
| `src/live/useLive.ts` | `useMachines` (registry + `/healthz` + a 20-sample window), `useTerminals` (the engine's own `/api/terminals`), `useAccount`. |
| `src/live/ConsoleShell.tsx` | The chrome: bar, drawer, drag gesture, cards, sessions menu, close dialog. |
| `src/live/TerminalPane.tsx` | One shell: the engine's pty, drawn by `src/term/vt.js`, with the app's two key rows. |
| `src/live/Console.tsx` | What is on screen: a shell if there is one, the engines if not. |

Deleted because the console replaces them: `src/engines.tsx`, `src/TerminalView.tsx`.
`src/App.tsx` now hands the whole surface to `<Console>` on the home view, so there is
one bar, not two.

## Data, honestly

- **Readings**: CPU is `used%`, RAM and DISK are `used/whole GB`. A reading the engine
  does not report is `—`, never a zero.
- **History**: this browser's own window, 20 samples at one per 20-second poll. A reload
  starts it again, which is what the chart should say.
- **Offline**: the card stays, with a short reason. A long transport message is replaced
  by `offline · unreachable` so it cannot be cut off at the card's edge.
- **Sessions**: `/api/terminals` per engine, polled every 15 s. A shell opened here is
  given a name in the engine's own shape (`t-` + 32 hex) and listed as soon as its socket
  reports `ready`.
- **Closing**: the dialog asks, the engine is asked, and the list is re-read — a shell
  that the engine refused to close would still be there.

## Measured

390×844, fake engine on `:8790`, console on `:8791`:

- cards: 2, Alpha `up 1h 30m`, Beta `offline · unreachable`; readings `18%`, `3.0/121 GB`,
  `38.7/196 GB`, each with a line behind it
- terminal: 35 rows; `log` 342×647 at 390, 272×647 at 320; no scroll
  (`scrollTop 0`, `scrollHeight 647`)
- typing `echo hi` through the box reaches the pty and its answer comes back:
  `root@aixodia ~ $ echo hi` / `bash: echo hi: command not found` / `root@aixodia ~ $`
- drawer: `TERMINALS · 6`, one group (`Alpha`, 6), rows `bash ~`, `logs`, `new shell`…,
  `+ New terminal`, footer with the account and `Sign out`
- close `logs`: dialog `Close logs?`, focus on `dialog-cancel`, engine list afterwards no
  longer has it
- `New terminal` adds an engine session and drops straight into it
- 320: no horizontal overflow (`documentElement.scrollWidth` = 320), readings fit
- 1440: one centred column of 1040, cards side by side

## Two CSS changes, both because a grid is not a list

1. `.terminal-log { gap: 0 }`. The mock's transcript is a list of paragraphs and 6px
   between them reads well; a pty is a grid of cells whose row height already includes
   the leading, and the gap made 35 rows 841px tall inside a 647px box, so the shell was
   scrolled out of sight at the top.
2. `.terminal-mark` (the `$`), `.terminal-note` (a shell that is not open yet, and the
   one button that helps), `.drawer-signout` (the menu is where the account lives now).

## Not wired, on purpose

- Droidime's two verbs, the AI chat on a card is still its own view rather than a pane,
  and no card offers a third action: a button that cannot do its job is worse than none.
