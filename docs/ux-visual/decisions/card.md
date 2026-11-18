# Decision — card hierarchy, empty states and charts (C1–C3)

Chosen: **B (restructure as one metric strip)**, with the disabled-state sentence
from A.

| lens | A | B | C |
|---|---|---|---|
| usability | 6 | 9 | 7 |
| visual craft | 5 | 9 | 8 |
| engineering | 9 | 7 | 4 |

Defense: A leaves the card as four unrelated bands and its empty state is still
missing markup. C is the strongest convention for a fleet with many machines, but
it hides the numbers this screen exists to show and contradicts the sketch the
mock was drawn from. B fixes the hierarchy at its root — the numbers become the
content, the actions become chrome, and the status pill is the only emphasis —
while keeping the two-panel comparison and one card's worth of code.

Acceptance criteria: no filled button; value above chart; baseline visible; aria
labels name metric and value; offline card states the reason and disables
controls with a title; `pageScrollY: 0` at 390×844, 430×932, 1440×900.
