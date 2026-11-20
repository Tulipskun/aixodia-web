// What a key press becomes as bytes for a pty.
//
// A shell does not have keys; it has bytes. The console has keys — two rows of them,
// plus whatever the phone's or the PC's keyboard has — so something has to say what a
// key means before it goes down the socket. That is this file, and only this file.

/** The named keys, as a shell names them. */
export const NAMED = {
  Esc: '\x1b',
  Escape: '\x1b',
  Tab: '\t',
  Enter: '\r',
  Return: '\r',
  Backspace: '\x7f',
  Delete: '\x1b[3~',
  Home: '\x1b[H',
  End: '\x1b[F',
  /* The app binds CMD to ctrl+p, so that is the byte the key sends. */
  CMD: '\x10',
  PgUp: '\x1b[5~',
  PgDn: '\x1b[6~',
  '↑': '\x1b[A',
  ArrowUp: '\x1b[A',
  '↓': '\x1b[B',
  ArrowDown: '\x1b[B',
  '←': '\x1b[D',
  ArrowLeft: '\x1b[D',
  '→': '\x1b[C',
  ArrowRight: '\x1b[C',
}

/**
 * The bytes a key press sends, given the modifiers held with it (`ctrl`, `alt`,
 * `shift`, joined by `+`).
 *
 * A held control is the byte a keyboard would have made: ctrl+c is 0x03 and ctrl+d is
 * 0x04, which is why a shell can be interrupted at all from a screen with no keyboard.
 * ctrl+[ lands on 0x1b on its own, as it does on a real one.
 */
export function keyBytes(key, chord = '') {
  if (typeof key !== 'string' || key.length === 0) return undefined
  const held = String(chord || '').split('+').filter(Boolean)
  /* The rows name arrows with the arrow itself, which is one character wide: a named
     key is a name before it is a character. */
  if (Object.hasOwn(NAMED, key)) return NAMED[key]
  if (key.length === 1) {
    if (held.includes('ctrl')) return String.fromCharCode(key.toUpperCase().charCodeAt(0) & 0x1f)
    if (held.includes('alt')) return `\x1b${key}`
    if (held.includes('shift')) return key.toUpperCase()
    return key
  }
  return undefined
}
