# C1–C3 · Proposal B — Restructure the card as one metric strip

Reorganise the card around a single divided strip, so the numbers are the
content and the actions are chrome.

```
┌─────────────────────────────────────────┐
│ Alpha  v1.177                ● ONLINE   │   name 20/600 · version chip 10
│ Debian 13 · x86_64 · up 12h 40m         │   meta 11 mono
│─────────────────────────────────────────│   hairline
│ CPU          │ RAM          │ I/O        │   label 10 mono, --dim-strong
│ 50%          │ 5 / 8 GB     │ 12.4 MB/s  │   value 15/600 mono
│ ╱╲╱╲╱╲       │ ╱╲╱╲╱╲       │ ╱╲╱╲╱╲     │   sparkline over a baseline
│─────────────────────────────────────────│
│ Storage                    164 / 256 GB │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░                    │   6px bar
│─────────────────────────────────────────│
│ [Terminal] [AI]  [Screen]  [More]       │   4 peers, none filled
└─────────────────────────────────────────┘
```

Offline: the strip keeps its grid (same coordinates to compare against), values
become "—", the sparkline slot becomes a single dashed baseline with
"no data · 4h" in place of the line, and the action row is disabled with a reason
in the footer.

Effort: rewrite `src/mock/EnginesMock.tsx` card body + its CSS block. Risk: dividers
can look busy if the hairlines are too strong; mitigate with 1px at 8% opacity.

Meets: C1 (no filled peer action; the status pill is the only emphasis), C2 (the
empty state is a stated sentence, not absent markup), C3 (value above chart,
baseline visible, aria labels name metric and value).
