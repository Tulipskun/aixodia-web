# C4–C5 · Proposal C — Adopt the console's design system

Import `src/styles.css` into the mock instead of re-declaring tokens, and reuse
its class names.

Effort: small. Risk: the console stylesheet is 1,194 lines built for a desktop
console; the mock would inherit rules it does not want and could not be deleted
in one piece. It also does not fix the scale, because the console itself carries
the same off-scale values.
