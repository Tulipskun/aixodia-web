# Inventory — mock status screen

One surface in scope: `/mock` (`mock.html` + `src/mock/`), a static mock of the
machines screen. No auth, no data fetching, no empty/loading/error states beyond
the two hard-coded cards.

| Route | States reached |
|---|---|
| `/mock` | Alpha online (populated), Beta offline (the only "error" state the mock has) |

Viewports audited: 390×844, 430×932, 1440×900.

Components on the surface: topbar (menu button, brand, avatar), machine card
(header, status pill, three mini charts, storage bar, 2×2 action grid, footer),
bottom tab bar.

Design system in use: the tokens in `src/styles.css` (`--bg`, `--surface`,
`--border`, `--text`, `--muted`, `--dim`, `--accent`, `--success`, `--warn`,
`--info`, radius/shadow), Saira for display and JetBrains Mono for numbers. The
mock re-declares those tokens in its own `mock.css` so it can be deleted in one
piece; it does not import the console stylesheet.

Not in scope: the real console (`index.html`), which keeps its own styles.
