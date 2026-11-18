# C4–C5 · Proposal B — Declare the scale, then spend it

Add the scale as tokens at the top of `mock.css` and use only those:

```
--fs-display: 20px  (name)
--fs-body:    14px  (subtitle, buttons)
--fs-label:   11px  (mono labels)
--fs-meta:    10px  (mono meta, version)

--s1: 4px  --s2: 8px  --s3: 12px  --s4: 16px  --s5: 24px
```

Then make the shell fit by construction: the tab bar is a flex child of a
`100dvh` column with `min-height: 0` on the scroller, and the card uses the same
padding every time (16), so the content column at 1440×900 is 24px shorter than
today and stops scrolling.

Effort: same edit as A, plus tokens. Risk: none beyond re-checking the audits.

Meets: C4 (`offScale` empty), C5 (`pageScrollY: 0` at all three viewports).
