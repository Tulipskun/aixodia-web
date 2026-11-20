import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NAMED, keyBytes } from '../src/term/keys.js'

test('a letter is itself, and a width-one key never becomes nothing', () => {
  assert.equal(keyBytes('a'), 'a')
  assert.equal(keyBytes('7'), '7')
  assert.equal(keyBytes(' '), ' ')
})

test('a held control is the byte a keyboard would have made', () => {
  // The two that matter most: a shell is interrupted with 0x03 and ended with 0x04.
  assert.equal(keyBytes('c', 'ctrl'), '\x03')
  assert.equal(keyBytes('C', 'ctrl'), '\x03')
  assert.equal(keyBytes('d', 'ctrl'), '\x04')
  assert.equal(keyBytes('z', 'ctrl'), '\x1a')
  assert.equal(keyBytes('a', 'ctrl'), '\x01')
  // ctrl+[ lands on escape on its own, exactly as on a real keyboard.
  assert.equal(keyBytes('[', 'ctrl'), '\x1b')
})

test('alt is escape before the key, shift is the capital', () => {
  assert.equal(keyBytes('b', 'alt'), '\x1bb')
  assert.equal(keyBytes('b', 'shift'), 'B')
  assert.equal(keyBytes('b', 'ctrl+alt'), '\x02', 'control is the byte, alt is only text')
})

test('the named keys are a shell a phone does not have', () => {
  assert.equal(keyBytes('Esc'), '\x1b')
  assert.equal(keyBytes('Tab'), '\t')
  assert.equal(keyBytes('Enter'), '\r')
  assert.equal(keyBytes('Backspace'), '\x7f')
  assert.equal(keyBytes('↑'), '\x1b[A')
  assert.equal(keyBytes('ArrowDown'), '\x1b[B')
  assert.equal(keyBytes('CMD'), '\x10', 'the app binds CMD to ctrl+p')
})

test('an unknown name is not a byte', () => {
  assert.equal(keyBytes('F13'), undefined)
  assert.equal(keyBytes(''), undefined)
  assert.equal(keyBytes(undefined), undefined)
  assert.ok(Object.values(NAMED).every(value => typeof value === 'string' && value.length > 0))
})
