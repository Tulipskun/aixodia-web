# The console — the mock, wired to the registry

The screen that was designed as a mock **is** the screen that ships. There is one
component (`src/console/Console.tsx`), one sheet (`src/console/console.css`) and one
terminal chrome; `mock.html` renders a fixture of the same component, so what is
reviewed and what is deployed cannot drift apart.

## What is where

| File | Job |
| --- | --- |
| `src/console/Console.tsx` | The screen: bar, drawer, drag gesture, cards, key rows, composer, close dialog. Fully controlled — it holds only chrome state (menu, drag, half-typed line) and is given the data. |
| `src/console/console.css` | The design: tokens, bar, drawer, cards, readings, dialog, key rows. |
| `src/console/PtyTerminal.tsx` | What a terminal mounts on a real engine: ticket → socket → VT grid, plus the handle that turns a key press into bytes. |
| `src/console/LiveConsole.tsx` | The registry: machines, readings, history, sessions; opens and closes shells. |
| `src/console/useLive.ts` | `useMachines` (registry + `/healthz`, 20 samples per poll), `useTerminals` (the engine's `/api/terminals`), `useAccount`. |
| `src/mock/EnginesMock.tsx` | Fixtures for the preview: the same `Console`, literal machines, a transcript that answers keys. |
| `src/App.tsx` | Hand the home view to `LiveConsole`; one bar, not two. |

Deleted because the console replaces them: `src/engines.tsx`, `src/TerminalView.tsx`,
`src/live/` (the first pass), `src/mock/mock.css` (the preview now imports the shipped
sheet).

## The seam between the two: a mount contract

The console owns the chrome and knows nothing about pty bytes; the engine side owns the
bytes and knows nothing about keys. The seam is three things:

```ts
type TerminalMount = (session, { logRef, tapRef, onHandle, onReady }) => {
  content: ReactNode   // the transcript, drawn inside the console's <pre>
  echo: boolean        // a pty echoes what it is sent; a fixture does not
}
type TerminalHandle = { onKey, onCommand, onClear, onReset }
```

So `Ctrl`/`Esc`/`PgUp` are names in the console and byte sequences in `PtyTerminal`;
`trash` resets the screen model and `reload` sends `exec $SHELL`.

## Data, honestly

- CPU is `used%`; RAM and DISK are `used/whole GB`. A reading the engine does not report
  is `—`, never a zero.
- The chart is this browser's window: 20 samples, one per 20-second poll. A reload
  starts it again.
- An offline engine keeps its card and says `offline · unreachable`; a long transport
  message is not allowed to spill over the card's edge.
- Sessions are the engine's own list, polled every 15 s. A shell opened here gets a name
  in the engine's shape (`t-` + 32 hex) and appears in the menu once its socket says
  `ready`.
- Closing asks first, then asks the engine, then re-reads the list.

## Measured (fake engine on :8790, console on :8791)

| What | 390×844 | 320×844 | 1440×900 |
| --- | --- | --- | --- |
| shell | 390 wide | 320 wide | 1040 centred at x=200 |
| cards | 2 stacked | 2 stacked, no overflow | 502 each, side by side, 12 gap |
| readings | `18%`, `3.0/121 GB`, `38.7/196 GB` + line | fit, no clipping | same |
| terminal grid | 35 rows, no scroll (`scrollTop 0`) | 35 rows | — |

- typing `echo hi` reaches the pty and comes back:
  `root@aixodia ~ $ echo hi` / `bash: echo hi: command not found` / `root@aixodia ~ $`
- caret: `.terminal-caret` 7×15 at the end of the cursor row (blink caught off in one
  screenshot, measured in the DOM instead)
- drawer: `TERMINALS · 4`, group `Alpha 4`, rows `bash ~`, `logs`, `new shell`…,
  `+ New terminal`, footer account + `Sign out`
- close `logs`: dialog `Close logs?`, focus `dialog-cancel`, engine list afterwards no
  longer has it
- `New terminal` adds an engine session and drops straight into it
- mock page (`mock.html`) renders the same cards with four verbs and charts; it shares
  the console chunk, so it is the same code path

## Two CSS decisions worth keeping

1. `.terminal-log { gap: 0 }`. A pty is a grid of cells whose row height already has the
   leading; the 6px list gap made 35 rows 841px tall in a 647px box and scrolled the
   prompt out of sight.
2. `styles.css` is wrapped in `@layer dashboard`. The console's sheet is unlayered, and an
   unlayered rule beats a layered one whatever order the bundler concatenates them in.
   Without this, the dashboard's `.shell { display:grid; grid-template-columns:264px 1fr }`
   beat the console's frame and the bar was 264px wide at 1440. `cssCodeSplit: false`
   keeps one sheet per page, so the order is the entry's own.
