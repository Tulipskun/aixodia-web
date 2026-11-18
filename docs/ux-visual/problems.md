# Problems, clustered and ranked

Scope: the single `/mock` surface. Ranked by severity × reach ÷ effort.

| id | cluster | root cause | findings | severity | acceptance criteria |
|---|---|---|---|---|---|
| C1 | A read-only card that shouts one action | `.action.is-primary` gives one of four peer actions the only filled treatment | F1 | P1 | No filled button on the card; all four actions share one treatment; exactly one high-emphasis element per card, and it is the machine's status or name |
| C2 | Offline looks broken, not offline | The offline card reuses the online layout with the data removed, and the dashes carry no reason | F5 | P1 | The offline card states when it was last seen and why the controls are unavailable; empty metric slots read as a deliberate state, not missing markup |
| C3 | Charts that carry nothing | Sparklines drawn with no baseline, range or time, labelled only by the value below | F2, F6 | P2 | Each metric block shows the value at a size above its label, with a visible baseline and an accessible label naming the metric and value |
| C4 | No scale for type or space | Values chosen per element (6 type sizes, 13 spacings) | F3, F4 | P2 | ≤5 font sizes on the screen, all gaps from the 4/8 scale; `layout-audit` `offScale` empty |
| C5 | Desktop scrolls 24px | Sticky tab bar + fixed shell padding at 1440×900 | F7 | P2 | `pageScrollY: 0` at 390×844, 430×932 and 1440×900 |

Deferred (P3): F8 motion guard, F9 the MCP tab has no screen behind it (a mock
choice, not a layout defect) — recorded in the report.
