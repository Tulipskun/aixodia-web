# sessions: the menu while a terminal is open

## Problem

The drawer is a three-item nav: Engines, Droidime, Terminal. That is a menu for
*screens*, not for *sessions*: it cannot express that the same person has two shells
open on one engine and one more on another engine, cannot say which of them the screen
is showing, and cannot open a second one without leaving the terminal first.

The app answers this with a tab strip inside the terminal screen. This is a mock of a
different product at a different size, so the answer is designed here rather than
copied.

Acceptance criteria (measurable):

1. every open terminal is listed, whatever engine it is on, in one place, with no
   second navigation step to see another engine's terminals;
2. the terminal the screen is showing is marked, and the mark is state, not hover;
3. a new terminal can be opened on any listed engine in one tap from the menu;
4. the list scrolls; rows stay ≥44px, labels ≥11px, contrast ≥4.5:1;
5. switching to a terminal keeps that terminal's transcript and its half-typed line;
6. nothing else on the drawer is lost: Engines and Droidime are still one tap away.

## Options considered

| Option | Idea | Weighted score (Usability / Visual / Engineering) |
|--------|------|---------------------------------------------------|
| A Two-level | Engine rows open a second level listing that engine's terminals | 32 / 40 / 46 |
| B Session-first (chosen) | One flat list of open terminals, grouped under hairline engine heads, `+` per group | 45 / 43 / 37 |
| C Tab strip | Drawer keeps engines only; open tabs live in a strip on the terminal screen | 39 / 34 / 30 |

Scored one lens at a time.

- **Usability** — A: two taps and a hidden state before you can see whether the other
  engine even has a shell open; 32. B: one list, one tap, current tab always visible; 45.
  C: the strip is a second surface, eats the top of a screen whose whole point is the
  transcript, and on a 390px phone the strip pushes the log down; 39.
- **Visual** — A: collapsed rows waste the panel's height; 40. B: engine heads give the
  list rhythm and grouping without boxes, reusing the hairline and the 12px step; 43.
  C: two visual languages for the same thing (drawer rows, tab chips); 34.
- **Engineering** — A: expansion state, focus management, more markup; 46. B: one list,
  a group header, one `+`, state already held per session; 37. C: a new component plus
  its own gesture/scroll interactions under the full-screen terminal rule; 30.

## Decision

B, with one graft from A: the engine head carries the engine's **status dot and
label**, so the grouping also answers "is that engine even up?" — the reason A's extra
level existed.

Concretely:

- drawer top: `Engines` and `Droidime` rows, as before;
- then a `TERMINALS` label (11px, muted, letter-spaced) and a scrollable list;
- per engine that has sessions: a head row — status dot, engine name, count of its
  shells — then that engine's shells as rows of 44px: terminal glyph, `shell 1`, and on
  the right the engine-relative session id in 11px muted;
- the current shell's row carries `is-current` (surface-3, hairline, accent glyph) and
  `aria-current="true"`;
- under each group a `+ New terminal` row, accent-less, muted, which opens one on that
  engine and makes it current;
- the drawer scrolls when the list outgrows it; the account line stays at the bottom.

Nothing in the terminal screen changes: it is still the whole screen, with no header.

## Why this is the best

- **Against A**: A hides the answer to the question the drawer is opened for ("where are
  my other shells?"). Its one advantage, seeing which engines are up, is grafted into
  the head row, so nothing is lost.
- **Against C**: C is the app's answer at the app's size. Here the screen is already
  full-bleed terminal with the keys and the composer at the bottom; a tab strip would be
  a third band competing with them, and it would be the only place in the product where
  the same object is shown two ways.
- **Norms satisfied**: L1 (one idea, one place), L3 (grouping by hairline and rhythm,
  not by boxes), H1 (state shown by the row, not by hover), plus the system's own rules —
  12px steps, four type sizes, neutral surface with one accent, press as motion.
- **Costs**: the drawer now has three kinds of row (nav, group head, session). Rows are
  distinguishable by height and weight rather than by borders: nav and session rows are
  44px, heads are 28px and never tappable. That keeps "can I tap this?" honest.

## Implementation plan

1. `src/mock/EnginesMock.tsx`
   - `Session { id, engine, title }` and a starting set across two engines;
   - `Shell { lines, wiped, draft, typed, direct, held }` per session id, in the parent,
     so a tab keeps its transcript and its half-typed line;
   - `Terminal` becomes `{ shell, onChange }`; the composer's `<input>` becomes a
     `<textarea>` that grows to 96px, and Enter at the end of the text sends while Enter
     anywhere else is a line break, matching the app;
   - `Drawer` gains `sessions`, `current`, `onSession`, `onOpen`.
2. `src/mock/mock.css` — `.drawer-scroll`, `.drawer-label`, `.drawer-group`,
   `.drawer-head` (28px, not a control), `.drawer-session`, `.drawer-new`,
   `.terminal-field` min-height + textarea rules.

## Test plan

- CDP: open drawer, count session rows per engine, tap the second engine's shell, assert
  `aria-current` moved and the transcript is that shell's own;
- type `aixodia status` in shell 1, switch to shell 2, switch back, assert the draft is
  still there;
- Enter at the end sends, Enter mid-text inserts a newline (2 lines, nothing sent);
- geometry audit 390/1440: no overflow, no target under 44px, contrast passes;
- `look_at_image` on the open drawer for hierarchy and crowding.
