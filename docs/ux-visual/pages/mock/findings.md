# Findings — `/mock`

## Verdict per viewport

**390×844** (`shots/390-main.png`): fits the viewport with no page scroll
(`pageScrollY: 0`), no overlaps and no horizontal overflow — the frame works. The
problems are inside the frame: the loudest element on a status card is a filled
"AI" button, the three mini charts read as decoration rather than data, the
offline card reserves a full chart column for nothing, and the type/spacing do not
come from a scale (six font sizes, thirteen spacing values, seven of them
off-scale).

**430×932** (`shots/430-main.png`): same, with ~90px of unused space above the tab
bar — not a finding on its own (the tab bar is sticky), but it shows the cards are
content-sized rather than grid-aligned.

**1440×900** (`shots/1440-main.png`): `pageScrollY: 24` — an app surface that
scrolls by 24px for no reason (L1).

## Table

| id | level | element | problem | norm | evidence | severity | basis |
|---|---|---|---|---|---|---|---|
| F1 | component | `.action.is-primary` (AI) | The only filled control on a read-only status card is an action nobody asked for; it competes with the machine's state | H1, H2 | 390-main.png; vision: "the filled purple AI button is the strongest high-contrast element" | P1 | observed |
| F2 | component | `.charts` / `.spark` | Three sparklines with no scale, no baseline and no time context; the value below is the only information the chart could not carry | H2, C1 | 390-main.png; `distinctFontSizes` shows chart values at 11px against 10px labels | P2 | observed |
| F3 | page | card grid, tab bar | Spacing is ad hoc: `offScale: [3,6,7,10,14,15,18]`, `nearDupes` 4/6, 6/7, 7/8, 8/10, 10/12, 12/14, 14/15 | D3 | `390-main.json → spacing` | P2 | measured |
| F4 | page | type | Six distinct sizes on one screen (17, 15, 18, 11, 10, 13), two of them 10 and 11px | H3 | `390-main.json → type.distinctFontSizes` | P2 | measured |
| F5 | component | offline card | An empty chart column plus dashed rules reads as broken data rather than an offline machine, and nothing says what is unavailable | C3, I8 | 390-main.png; vision: "reads as missing data or an unfinished placeholder" | P1 | observed |
| F6 | component | `.chart-label`, `.card-title p` | 10px labels at `--dim` are 4.59:1 on the card — passing 4.5 but too weak for text this small | A1, H3 | contrast measured #77749f on #040226 = 4.59 | P2 | measured |
| F7 | page | `.shell` at 1440×900 | Page scrolls 24px on a surface that should fit | L1 | `1440-main.json → pageScrollY: 24` | P2 | measured |
| F8 | component | `.spark` | Stroke is not themed for `prefers-reduced-motion`, and the charts animate width on state change without that guard | A3 | mock.css `.bar-fill { transition }` | P3 | suspected |
| F9 | component | tab bar | Two tabs for one screen: "MCP" has no screen behind it, so it is a dead control (acceptable in a mock, worth noting) | I1, P2 | 390-main.png | P3 | observed |

## Excellent as is

- The frame: a single 460px column, sticky topbar and sticky tab bar that cannot
  overlap content. `pageOverflowX: 0`, no `overflowSpills`, no `wrappedControls`.
- Status is stated in words and colour, not colour alone (C3) — "ONLINE"/"OFFLINE"
  plus the dot.
- Numbers are monospaced and aligned, so CPU/RAM/I/O compare vertically across
  the two cards.
- The offline card is structurally identical to the online one, so the eye can
  compare the same coordinates (good; the defect is what fills the slots).
