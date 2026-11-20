// A small VT screen for the browser terminal.
//
// The engine sends raw pty bytes — escape sequences, UTF-8, control characters and
// all — so something has to turn them into a grid of cells before they can be
// painted. This is that something, and it is deliberately only as large as a shell
// needs: the sequences a prompt, a pager and a full-screen program actually emit,
// and nothing else. Anything unrecognised is consumed and dropped, which is what a
// terminal is allowed to do with a sequence it does not implement.

export const DEFAULT_COLS = 80
export const DEFAULT_ROWS = 24

/* Attributes are kept flat and comparable so a row can be grouped into runs of
   identical style with a plain equality check. */
const DEFAULT_ATTRS = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, inverse: false }

function blankCell() {
  return { ch: ' ', wide: 0, ...DEFAULT_ATTRS }
}

function cloneCell(cell) {
  return { ...cell }
}

function sameAttrs(a, b) {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse
  )
}

/* Display width of one code point. Combining marks take no cell, east-asian wide
   and fullwidth take two; everything else is one. This is what keeps Thai and
   ASCII grids aligned and stops CJK output from overrunning the row. */
export function charWidth(cp) {
  if (cp === 0 || cp === 0x200b) return 0
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0
  if ((cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x20d0 && cp <= 0x20f0)) return 0
  if (cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e)) return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f9ff)
  ) {
    return 2
  }
  return 1
}

export class Screen {
  constructor({ cols = DEFAULT_COLS, rows = DEFAULT_ROWS, scrollback = 2000 } = {}) {
    this.cols = Math.max(1, cols)
    this.rows = Math.max(1, rows)
    this.scrollbackLimit = Math.max(0, scrollback)
    this.scrollback = []
    this.alt = false
    this.reset()
  }

  reset() {
    this.grid = this.blankGrid(this.cols, this.rows)
    this.saved = this.blankGrid(this.cols, this.rows)
    this.cursor = { row: 0, col: 0, visible: true }
    this.attrs = { ...DEFAULT_ATTRS }
    this.pendingWrap = false
    this.scrollTop = 0
    this.scrollBottom = this.rows - 1
    this.tabs = new Set()
    for (let col = 8; col < this.cols; col += 8) this.tabs.add(col)
    this.state = 'ground'
    this.sequence = ''
    this.decoder = new TextDecoder('utf-8')
  }

  blankGrid(cols, rows) {
    const grid = []
    for (let row = 0; row < rows; row++) grid.push(this.blankRow(cols))
    return grid
  }

  blankRow(cols) {
    const row = []
    for (let col = 0; col < cols; col++) row.push(blankCell())
    return row
  }

  /* Feed wire bytes. A pty hands over whatever chunk it happened to have, so a
     multi-byte character or an escape sequence can straddle two of them; the
     decoder and the sequence buffer are what make that harmless. */
  write(chunk) {
    const text = typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true })
    for (const ch of text) this.feed(ch)
  }

  feed(ch) {
    if (this.state === 'osc') {
      if (ch === '\x07') this.state = 'ground'
      else if (ch === '\x1b') this.state = 'osc-st'
      return
    }
    if (this.state === 'osc-st') {
      this.state = ch === '\\' ? 'ground' : 'osc'
      return
    }
    if (this.state === 'csi') return this.feedCsi(ch)
    if (this.state === 'esc') return this.feedEsc(ch)

    const code = ch.codePointAt(0)
    if (code === 0x1b) {
      this.state = 'esc'
      this.sequence = ''
      return
    }
    if (code < 0x20 || code === 0x7f) return this.control(code)
    this.print(ch, code)
  }

  control(code) {
    switch (code) {
      case 0x08:
        this.pendingWrap = false
        if (this.cursor.col > 0) this.cursor.col -= 1
        return
      case 0x09: {
        this.pendingWrap = false
        let col = this.cursor.col + 1
        while (col < this.cols - 1 && !this.tabs.has(col)) col += 1
        this.cursor.col = Math.min(this.cols - 1, col)
        return
      }
      case 0x0a:
      case 0x0b:
      case 0x0c:
        this.pendingWrap = false
        this.lineFeed()
        return
      case 0x0d:
        this.pendingWrap = false
        this.cursor.col = 0
        return
      default:
        return
    }
  }

  feedEsc(ch) {
    this.state = 'ground'
    switch (ch) {
      case '[':
        this.state = 'csi'
        this.sequence = ''
        return
      case ']':
        this.state = 'osc'
        return
      case '7':
        this.storeCursor()
        return
      case '8':
        this.restoreCursor()
        return
      case 'D':
        this.pendingWrap = false
        this.lineFeed()
        return
      case 'E':
        this.pendingWrap = false
        this.cursor.col = 0
        this.lineFeed()
        return
      case 'M':
        this.pendingWrap = false
        this.reverseIndex()
        return
      case 'c':
        this.reset()
        return
      default:
        return
    }
  }

  feedCsi(ch) {
    const code = ch.codePointAt(0)
    if ((code >= 0x40 && code <= 0x7e) || ch === ' ') {
      const sequence = this.sequence
      this.state = 'ground'
      this.sequence = ''
      this.csi(sequence, ch)
      return
    }
    this.sequence += ch
    if (this.sequence.length > 64) {
      this.state = 'ground'
      this.sequence = ''
    }
  }

  /* Parameters, in the shape most of these sequences want: numbers, a private
     marker (`?` for modes), and a final byte. */
  static parse(sequence) {
    const priv = /^[?>!<=]/.test(sequence) ? sequence[0] : ''
    const body = priv ? sequence.slice(1) : sequence
    const parts = body.split(';')
    const params = parts.map((part) => {
      const value = parseInt(part, 10)
      return Number.isFinite(value) ? value : 0
    })
    return { priv, params }
  }

  /* A parameter that was omitted means 1 for counts and 0 for coordinates, which
     is why the callers pass their own default. */
  arg(params, index, fallback) {
    const value = params[index]
    return value === undefined || value === 0 ? fallback : value
  }

  csi(sequence, final) {
    const { priv, params } = Screen.parse(sequence)
    switch (final) {
      case 'A':
        this.pendingWrap = false
        this.cursor.row = Math.max(this.scrollTop, this.cursor.row - this.arg(params, 0, 1))
        return
      case 'B':
      case 'e':
        this.pendingWrap = false
        this.cursor.row = Math.min(this.scrollBottom, this.cursor.row + this.arg(params, 0, 1))
        return
      case 'C':
      case 'a':
        this.pendingWrap = false
        this.cursor.col = Math.min(this.cols - 1, this.cursor.col + this.arg(params, 0, 1))
        return
      case 'D':
        this.pendingWrap = false
        this.cursor.col = Math.max(0, this.cursor.col - this.arg(params, 0, 1))
        return
      case 'E':
        this.pendingWrap = false
        this.cursor.col = 0
        this.cursor.row = Math.min(this.scrollBottom, this.cursor.row + this.arg(params, 0, 1))
        return
      case 'F':
        this.pendingWrap = false
        this.cursor.col = 0
        this.cursor.row = Math.max(this.scrollTop, this.cursor.row - this.arg(params, 0, 1))
        return
      case 'G':
      case '`':
        this.pendingWrap = false
        this.cursor.col = Math.min(this.cols - 1, Math.max(0, this.arg(params, 0, 1) - 1))
        return
      case 'd':
        this.pendingWrap = false
        this.cursor.row = Math.min(this.rows - 1, Math.max(0, this.arg(params, 0, 1) - 1))
        return
      case 'H':
      case 'f':
        this.pendingWrap = false
        this.cursor.row = Math.min(this.rows - 1, Math.max(0, this.arg(params, 0, 1) - 1))
        this.cursor.col = Math.min(this.cols - 1, Math.max(0, this.arg(params, 1, 1) - 1))
        return
      case 'J':
        this.eraseDisplay(params[0] ?? 0)
        return
      case 'K':
        this.eraseLine(params[0] ?? 0)
        return
      case 'L':
        this.insertLines(this.arg(params, 0, 1))
        return
      case 'M':
        this.deleteLines(this.arg(params, 0, 1))
        return
      case 'P':
        this.deleteChars(this.arg(params, 0, 1))
        return
      case '@':
        this.insertChars(this.arg(params, 0, 1))
        return
      case 'X':
        this.eraseChars(this.arg(params, 0, 1))
        return
      case 'S':
        for (let i = 0; i < this.arg(params, 0, 1); i++) this.scrollUp()
        return
      case 'T':
        for (let i = 0; i < this.arg(params, 0, 1); i++) this.scrollDown()
        return
      case 'm':
        this.sgr(params)
        return
      case 'r':
        this.setRegion(params)
        return
      case 's':
        this.storeCursor()
        return
      case 'u':
        this.restoreCursor()
        return
      case 'h':
      case 'l':
        this.mode(priv === '?', params, final === 'h')
        return
      case 'b':
        for (let i = 0; i < this.arg(params, 0, 1); i++) this.print(this.lastChar || ' ', this.lastCode || 0x20)
        return
      default:
        return
    }
  }

  /* Modes, as far as a shell and a pager need them: the alternate screen, and
     whether the cursor is drawn at all. */
  mode(privateMode, params, on) {
    if (!privateMode) return
    for (const raw of params) {
      const mode = raw === 0 ? 1 : raw
      if (mode === 1049 || mode === 1047 || mode === 47) {
        this.setAlt(on)
      } else if (mode === 25) {
        this.cursor.visible = on
      }
    }
  }

  setAlt(on) {
    if (on === this.alt) return
    if (on) {
      this.normal = { grid: this.grid, cursor: { ...this.cursor } }
      this.grid = this.blankGrid(this.cols, this.rows)
      this.cursor = { row: 0, col: 0, visible: this.cursor.visible }
    } else if (this.normal) {
      this.grid = this.normal.grid
      this.cursor = { ...this.normal.cursor }
      this.normal = null
    }
    this.alt = on
    this.pendingWrap = false
    this.scrollTop = 0
    this.scrollBottom = this.rows - 1
  }

  sgr(params) {
    const list = params.length === 0 ? [0] : params
    for (let i = 0; i < list.length; i++) {
      const code = list[i]
      if (code === 0) this.attrs = { ...DEFAULT_ATTRS }
      else if (code === 1) this.attrs.bold = true
      else if (code === 2) this.attrs.dim = true
      else if (code === 3) this.attrs.italic = true
      else if (code === 4) this.attrs.underline = true
      else if (code === 7) this.attrs.inverse = true
      else if (code === 22) {
        this.attrs.bold = false
        this.attrs.dim = false
      } else if (code === 23) this.attrs.italic = false
      else if (code === 24) this.attrs.underline = false
      else if (code === 27) this.attrs.inverse = false
      else if (code >= 30 && code <= 37) this.attrs.fg = code - 30
      else if (code === 39) this.attrs.fg = null
      else if (code >= 40 && code <= 47) this.attrs.bg = code - 40
      else if (code === 49) this.attrs.bg = null
      else if (code >= 90 && code <= 97) this.attrs.fg = code - 90 + 8
      else if (code >= 100 && code <= 107) this.attrs.bg = code - 100 + 8
      else if (code === 38 || code === 48) {
        const target = code === 38 ? 'fg' : 'bg'
        const kind = list[i + 1]
        if (kind === 5) {
          this.attrs[target] = list[i + 2] ?? null
          i += 2
        } else if (kind === 2) {
          const r = list[i + 2] ?? 0
          const g = list[i + 3] ?? 0
          const b = list[i + 4] ?? 0
          this.attrs[target] = { r, g, b }
          i += 4
        }
      }
    }
  }

  setRegion(params) {
    const top = Math.max(0, this.arg(params, 0, 1) - 1)
    const bottom = Math.min(this.rows - 1, this.arg(params, 1, this.rows) - 1)
    if (bottom <= top) {
      this.scrollTop = 0
      this.scrollBottom = this.rows - 1
    } else {
      this.scrollTop = top
      this.scrollBottom = bottom
    }
    this.pendingWrap = false
    this.cursor.row = this.scrollTop
    this.cursor.col = 0
  }

  storeCursor() {
    this.savedCursor = { ...this.cursor }
    this.savedAttrs = { ...this.attrs }
  }

  restoreCursor() {
    if (!this.savedCursor) return
    this.cursor = { ...this.savedCursor }
    if (this.savedAttrs) this.attrs = { ...this.savedAttrs }
    this.pendingWrap = false
  }

  scrollUp() {
    const row = this.grid[this.scrollTop]
    this.grid.splice(this.scrollTop, 1)
    this.grid.splice(this.scrollBottom, 0, this.blankRow(this.cols))
    if (this.scrollTop === 0 && !this.alt) this.pushScrollback(row)
  }

  scrollDown() {
    this.grid.splice(this.scrollBottom, 1)
    this.grid.splice(this.scrollTop, 0, this.blankRow(this.cols))
  }

  pushScrollback(row) {
    if (this.scrollbackLimit === 0) return
    this.scrollback.push(row.map(cloneCell))
    if (this.scrollback.length > this.scrollbackLimit) this.scrollback.shift()
  }

  lineFeed() {
    if (this.cursor.row === this.scrollBottom) this.scrollUp()
    else if (this.cursor.row < this.rows - 1) this.cursor.row += 1
  }

  reverseIndex() {
    if (this.cursor.row === this.scrollTop) this.scrollDown()
    else if (this.cursor.row > 0) this.cursor.row -= 1
  }

  eraseDisplay(how) {
    this.pendingWrap = false
    if (how === 3) {
      this.scrollback = []
      return
    }
    if (how === 0) {
      this.eraseLine(0)
      for (let row = this.cursor.row + 1; row < this.rows; row++) this.grid[row] = this.blankRow(this.cols)
    } else if (how === 1) {
      this.eraseLine(1)
      for (let row = 0; row < this.cursor.row; row++) this.grid[row] = this.blankRow(this.cols)
    } else {
      for (let row = 0; row < this.rows; row++) this.grid[row] = this.blankRow(this.cols)
    }
  }

  eraseLine(how) {
    const row = this.grid[this.cursor.row]
    if (!row) return
    this.pendingWrap = false
    const from = how === 0 ? this.cursor.col : 0
    const to = how === 1 ? this.cursor.col : this.cols - 1
    for (let col = from; col <= to; col++) row[col] = blankCell()
  }

  eraseChars(count) {
    const row = this.grid[this.cursor.row]
    for (let i = 0; i < count && this.cursor.col + i < this.cols; i++) row[this.cursor.col + i] = blankCell()
  }

  insertChars(count) {
    const row = this.grid[this.cursor.row]
    for (let i = 0; i < count; i++) {
      row.splice(this.cursor.col, 0, blankCell())
      row.pop()
    }
  }

  deleteChars(count) {
    const row = this.grid[this.cursor.row]
    for (let i = 0; i < count; i++) {
      row.splice(this.cursor.col, 1)
      row.push(blankCell())
    }
  }

  insertLines(count) {
    if (this.cursor.row < this.scrollTop || this.cursor.row > this.scrollBottom) return
    for (let i = 0; i < count; i++) {
      this.grid.splice(this.scrollBottom, 1)
      this.grid.splice(this.cursor.row, 0, this.blankRow(this.cols))
    }
  }

  deleteLines(count) {
    if (this.cursor.row < this.scrollTop || this.cursor.row > this.scrollBottom) return
    for (let i = 0; i < count; i++) {
      this.grid.splice(this.cursor.row, 1)
      this.grid.splice(this.scrollBottom, 0, this.blankRow(this.cols))
    }
  }

  print(ch, code) {
    const width = charWidth(code)
    if (width === 0) {
      /* A combining mark belongs to the character before it. */
      const row = this.grid[this.cursor.row]
      const col = Math.max(0, this.cursor.col - 1)
      if (row && row[col]) row[col].ch += ch
      return
    }
    if (this.pendingWrap || this.cursor.col + width > this.cols) {
      this.pendingWrap = false
      this.cursor.col = 0
      this.lineFeed()
    }
    const row = this.grid[this.cursor.row]
    if (!row) return
    const cell = { ch, wide: width === 2 ? 1 : 0, ...this.attrs }
    row[this.cursor.col] = cell
    if (width === 2 && this.cursor.col + 1 < this.cols) {
      row[this.cursor.col + 1] = { ch: '', wide: 2, ...this.attrs }
    }
    this.lastChar = ch
    this.lastCode = code
    if (this.cursor.col + width >= this.cols) {
      this.cursor.col = this.cols - 1
      this.pendingWrap = true
    } else {
      this.cursor.col += width
    }
  }

  resize(cols, rows) {
    const nextCols = Math.max(1, cols)
    const nextRows = Math.max(1, rows)
    if (nextCols === this.cols && nextRows === this.rows) return
    for (const row of this.grid) {
      if (nextCols > row.length) while (row.length < nextCols) row.push(blankCell())
      else row.length = nextCols
    }
    while (this.grid.length < nextRows) this.grid.push(this.blankRow(nextCols))
    /* Trimming from the bottom loses the lines below the cursor first, which is
       where a shell has nothing worth keeping. */
    if (this.grid.length > nextRows) this.grid.splice(nextRows, this.grid.length - nextRows)
    this.cols = nextCols
    this.rows = nextRows
    this.cursor.row = Math.min(this.cursor.row, nextRows - 1)
    this.cursor.col = Math.min(this.cursor.col, nextCols - 1)
    this.scrollTop = 0
    this.scrollBottom = nextRows - 1
    this.pendingWrap = false
    this.tabs = new Set()
    for (let col = 8; col < this.cols; col += 8) this.tabs.add(col)
  }

  /* Everything worth painting, oldest first: the scrollback, then the screen. The
     view converts each row into runs of equal style once, instead of styling every
     cell. */
  snapshot() {
    return {
      cols: this.cols,
      rows: this.rows,
      cursor: { ...this.cursor },
      cursorRow: this.scrollback.length + this.cursor.row,
      lines: [...this.scrollback, ...this.grid],
    }
  }
}

/* Group one row into runs of the same attributes. Trailing blanks with no styling
   are dropped: they are invisible and only add spans to the DOM. */
export function runs(row) {
  const out = []
  let current = null
  for (const cell of row) {
    const attrs = {
      fg: cell.fg,
      bg: cell.bg,
      bold: cell.bold,
      dim: cell.dim,
      italic: cell.italic,
      underline: cell.underline,
      inverse: cell.inverse,
    }
    if (!current || !sameAttrs(current, attrs)) {
      current = { ...attrs, text: '' }
      out.push(current)
    }
    current.text += cell.ch
  }
  /* Blanks at the end of the row are invisible, so they leave the last run's text
     rather than becoming spans. A styled blank stays: it is a background. */
  while (out.length > 0) {
    const last = out[out.length - 1]
    const plain = last.fg === null && last.bg === null && !last.bold && !last.dim && !last.italic && !last.underline && !last.inverse
    if (!plain) break
    last.text = last.text.replace(/ +$/, '')
    if (last.text !== '') break
    out.pop()
  }
  return out
}
