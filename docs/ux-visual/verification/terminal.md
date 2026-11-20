# Terminal — round 1 (real pty)

The terminal screen talks to the engine's own terminal, not a scripted transcript.

## The wire

1. `POST /api/terminals/ticket` with the session bearer, answered with a single-use
   ticket. A WebSocket cannot carry a header, so the ticket goes in the query of the
   dial instead.
2. `wss://<engine>/terminal?ticket=…`. The engine answers a text frame
   `{type:"ready", cols, rows, shell, cwd, id, pid}`, then the pty itself as binary
   frames. Keystrokes go back as **binary** frames — a text frame is read as control
   JSON — and `{type:"resize"}` is the only text we send.

## What was written by hand

`src/term/vt.js` is a VT screen: UTF-8 decoding across chunk boundaries, a CSI
parser, cursor addressing, erase/insert/delete, SGR colour, the alternate screen,
scrollback and resize. It is deliberately not a complete terminal — a sequence it
does not implement is consumed and dropped, which is what a terminal may do, and it
answers no device queries (a shell that asks where the cursor is falls back).

17 node tests cover it: wrapping at the edge without double-advancing, CR/LF
independence, SGR on cells, erase to end of line, one-based cursor addressing,
scrollback, the alternate screen coming and going, a UTF-8 character split across two
writes, wide and combining characters, an unfinished sequence, and resize.

The view (`src/TerminalView.tsx`) fits the grid to its box in cells, keeps the reader
at the bottom unless they have scrolled up, and sends keystrokes as binary.

## Measured (390 and 320, against a stand-in engine speaking the real protocol)

- ready → `47×37` cells at 390, `35×29` at 320; prompt painted, typed `echo hi` and
  Enter returned `bash: echo hi: command not found` from the server.
- `.terminal-screen` 320 wide inside a 320 viewport, terminal box inset 12px.
- Key row wraps to two rows instead of scrolling: every key inside the viewport
  (max right edge 306 at 320), because a key that has scrolled away cannot be found.
- Audits at 390: no low-contrast text, no small targets, `pageOverflowX 0`.

## Not done

- The terminal was verified against a local stand-in that speaks the engine's frames;
  the live check after deploy only proves the bundle shipped, because the live engine
  answers `/terminal` behind Cloudflare Access and this browser has no Access session.
- No scrollback scrollbar or search, no mouse selection, no copy button.
