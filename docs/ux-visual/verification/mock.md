# Verification — `/mock` redesign

Re-ran the two audits from the skill (`layout-audit.js`, `geometry-audit.js`) at
390×844, 430×932 and 1440×900 after the change, plus a fresh screenshot per
viewport (`pages/mock/shots/after-*.png`).

| check | before | after |
|---|---|---|
| `pageScrollY` @ 390 / 430 / 1440 | 0 / 0 / 24 | 0 / 0 / 0 |
| `spacing.offScale` | [3,6,7,10,14,15,18] | [] |
| `spacing.nearDupes` | 7 pairs | none |
| distinct font sizes | 6 (17/15/18/11/10/13) | 5 (20/15/13/11/10) |
| `lowContrast` | [] | [] |
| `smallTargets` | [] | [] |
| `pageOverflowX` / `unevenRows` / `overflowSpills` | 0 / [] / [] | 0 / [] / [] |
| `wrappedControls` | [] | [] |

Findings resolved: F1 (no filled peer action — the status pill is the only
emphasis), F2 (value above the chart, baseline drawn, aria label names metric and
value), F3/F4 (tokens), F5 (offline values are "—" with "no data" in the chart
slot, controls visually inert and carrying the reason in `title`), F6 (labels
moved from `--dim` 4.59:1 to `--muted` 8.85:1, and 10px text is now only chrome),
F7 (fits at 1440×900), F8 (`prefers-reduced-motion` turns off the bar and button
transitions).

Deferred, recorded not fixed: F9 — the "MCP" tab has no screen behind it in the
mock; it is a mock of the real tab bar, not a broken link.

`npm test` 19/19, `npm run build` clean.

## Round 2 — storage to the header, charts redrawn

Requested: the storage bar was a full-width band and the charts still read as
jagged decoration.

- **Storage** is now a compact meter in the card's top-right, under the status
  pill: `disk · 164 / 256 GB` over a 4px, 124px bar. The full-width band and its
  `.storage` rules were deleted, not hidden.
- **Charts** are Catmull-Rom curves (gentle control offsets) instead of polylines,
  with a gradient fill, a faint zero baseline, an end marker with a halo, and a
  scale anchored at zero with 15% headroom — two charts at the same height now
  mean the same thing instead of each inventing its own range. Eight points per
  series at this width.

Audits after round 2: `pageScrollY 0`, `offScale []`, 5 font sizes, no low
contrast, no wrapped controls, no overlapping at 390×844 / 430×932 / 1440×900.
`npm test` 19/19, build clean.
