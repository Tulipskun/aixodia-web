import test from 'node:test'
import assert from 'node:assert/strict'
import { Screen, charWidth, runs } from '../src/term/vt.js'

/* The screen is what the engine's bytes land on, so these tests are about bytes:
   a prompt, a wrapped line, a cleared screen, a pager taking over and giving it
   back. */

function text(screen) {
  return screen.snapshot().lines.map((row) => row.map((cell) => cell.ch).join('').replace(/\s+$/, ''))
}

test('plain text lands at the cursor and advances it', () => {
  const screen = new Screen({ cols: 10, rows: 3 })
  screen.write('hi')
  assert.equal(text(screen)[0], 'hi')
  assert.equal(screen.cursor.col, 2)
})

test('carriage return and newline move independently', () => {
  const screen = new Screen({ cols: 10, rows: 3 })
  screen.write('ab\r\ncd')
  assert.equal(text(screen)[0], 'ab')
  assert.equal(text(screen)[1], 'cd')
})

test('a line longer than the screen wraps and the pty keeps counting columns', () => {
  const screen = new Screen({ cols: 4, rows: 3 })
  screen.write('abcdefgh')
  assert.deepEqual(text(screen), ['abcd', 'efgh', ''])
})

test('the pending wrap does not advance until the next character', () => {
  const screen = new Screen({ cols: 4, rows: 2 })
  screen.write('abcd')
  assert.equal(screen.cursor.row, 0)
  screen.write('e')
  assert.equal(text(screen)[1], 'e')
})

test('SGR colour is stored on the cell and not printed', () => {
  const screen = new Screen({ cols: 10, rows: 2 })
  screen.write('\x1b[1;31mred\x1b[0m plain')
  const row = screen.snapshot().lines[0]
  assert.equal(row[0].ch, 'r')
  assert.equal(row[0].fg, 1)
  assert.equal(row[0].bold, true)
  assert.equal(row[3].fg, null)
  assert.equal(row[4].ch, 'p')
})

test('erase to end of line leaves what is before the cursor', () => {
  const screen = new Screen({ cols: 10, rows: 2 })
  screen.write('abcdef\x1b[1;4H\x1b[K')
  assert.equal(text(screen)[0], 'abc')
})

test('erase display 2 clears the screen but keeps the cursor put', () => {
  const screen = new Screen({ cols: 10, rows: 3 })
  screen.write('one\r\ntwo\x1b[2J')
  assert.deepEqual(text(screen), ['', '', ''])
  assert.equal(screen.cursor.row, 1)
})

test('cursor addressing is one-based', () => {
  const screen = new Screen({ cols: 10, rows: 5 })
  screen.write('\x1b[3;2HX')
  assert.equal(text(screen)[2], ' X')
})

test('scrolling pushes the top line into the scrollback', () => {
  const screen = new Screen({ cols: 6, rows: 2, scrollback: 5 })
  screen.write('a\r\nb\r\nc')
  const snapshot = screen.snapshot()
  assert.equal(snapshot.lines.length, 3)
  assert.equal(snapshot.lines[0][0].ch, 'a')
  assert.equal(snapshot.cursorRow, 2)
})

test('the alternate screen takes over and gives the old screen back', () => {
  const screen = new Screen({ cols: 10, rows: 2 })
  screen.write('shell\r\nprompt')
  screen.write('\x1b[?1049h')
  screen.write('\x1b[2J\x1b[Hpager')
  assert.equal(text(screen)[0], 'pager')
  screen.write('\x1b[?1049l')
  assert.deepEqual(text(screen), ['shell', 'prompt'])
})

test('utf-8 split across two chunks is decoded once', () => {
  const screen = new Screen({ cols: 10, rows: 2 })
  const bytes = new TextEncoder().encode('ไทย')
  screen.write(bytes.slice(0, 3))
  screen.write(bytes.slice(3))
  assert.equal(text(screen)[0], 'ไทย')
})

test('a wide character takes two cells and a combining mark takes none', () => {
  assert.equal(charWidth('ก'.codePointAt(0)), 1)
  assert.equal(charWidth('日'.codePointAt(0)), 2)
  assert.equal(charWidth(0x0301), 0)
  const screen = new Screen({ cols: 6, rows: 1 })
  screen.write('日x')
  const row = screen.snapshot().lines[0]
  assert.equal(row[0].ch, '日')
  assert.equal(row[1].wide, 2)
  assert.equal(row[2].ch, 'x')
})

test('an unfinished sequence is consumed rather than printed', () => {
  const screen = new Screen({ cols: 10, rows: 1 })
  screen.write('\x1b[3')
  screen.write('1mok')
  assert.equal(text(screen)[0], 'ok')
})

test('a sequence no one implements is dropped, not echoed', () => {
  const screen = new Screen({ cols: 10, rows: 1 })
  screen.write('\x1b[?2004h\x1b]0;title\x07fine')
  assert.equal(text(screen)[0], 'fine')
})

test('resize keeps the text and clamps the cursor', () => {
  const screen = new Screen({ cols: 10, rows: 3 })
  screen.write('\x1b[3;9Hx')
  screen.resize(20, 5)
  assert.equal(screen.cols, 20)
  assert.equal(screen.rows, 5)
  assert.equal(screen.cursor.row, 2)
  assert.equal(text(screen)[2].startsWith('        x'), true)
  screen.resize(4, 2)
  assert.equal(screen.cursor.row, 1)
  assert.equal(screen.cols, 4)
})

test('runs group cells by style and drop trailing plain blanks', () => {
  const screen = new Screen({ cols: 12, rows: 1 })
  screen.write('\x1b[32mab\x1b[0mcd')
  const row = runs(screen.snapshot().lines[0])
  assert.equal(row.length, 2)
  assert.equal(row[0].text, 'ab')
  assert.equal(row[0].fg, 2)
  assert.equal(row[1].text, 'cd')
  assert.equal(row[1].fg, null)
})

test('insert and delete characters shift the rest of the row', () => {
  const screen = new Screen({ cols: 6, rows: 1 })
  screen.write('abcde\x1b[1;2H\x1b[2@')
  assert.equal(text(screen)[0], 'a  bcd')
  screen.write('\x1b[1;1H\x1b[2P')
  /* DCH pulls the row left, so the blank that was inserted first is now at col 0. */
  assert.equal(text(screen)[0], ' bcd')
})
