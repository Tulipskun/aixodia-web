# C1–C3 · Proposal C — Convention: a node row plus an expanded node

What infrastructure consoles do (Grafana node rows, Proxmox node summary, Vercel
project cards): a compact row per machine — name, status, three numbers, a
"connect" affordance — and one expanded card for the selected machine.

```
Alpha      ● online        50% · 5/8GB · 12.4MB/s      →
────────────────────────────────────────────────────────
Beta       ○ offline       —                              →
```

Only the selected machine shows charts, storage and the action grid.

Effort: new selected-state model, a second layout, and a decision about what
"selected" means in a mock. Risk: hides most of the information that the current
screen is meant to show, and contradicts the paper sketch this mock was drawn
from (two full panels).

Meets: C1 and C3 for the expanded card, C2 weakly (collapsed rows say less, not
more), and it changes the brief.
