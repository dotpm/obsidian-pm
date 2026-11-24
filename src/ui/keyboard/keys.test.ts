import { describe, expect, it } from 'vitest'
import { formatKey, keyIdOf, parseBinding } from './keys'

const event = (key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...modifiers
  }) as KeyboardEvent

describe('parseBinding', () => {
  it('reads a plain letter', () => {
    expect(parseBinding('j')).toMatchObject({ modifiers: [], key: 'j', id: 'j' })
  })

  it('does not turn Mod+K into Shift+K', () => {
    expect(parseBinding('Mod+K')).toMatchObject({ modifiers: ['Mod'], key: 'k', id: 'Mod+k' })
  })

  it('keeps an explicit Shift', () => {
    expect(parseBinding('Shift+S')).toMatchObject({ modifiers: ['Shift'], key: 's', id: 'Shift+s' })
    expect(parseBinding('Mod+Shift+Z')).toMatchObject({
      modifiers: ['Mod', 'Shift'],
      key: 'z',
      id: 'Mod+Shift+z'
    })
  })

  it('turns a lone capital into Shift', () => {
    expect(parseBinding('G')).toMatchObject({ modifiers: ['Shift'], key: 'g', id: 'Shift+g' })
  })

  it('maps names to KeyboardEvent.key values', () => {
    expect(parseBinding('Space')).toMatchObject({ modifiers: [], key: ' ', id: 'Space' })
    expect(parseBinding('Esc')).toMatchObject({ modifiers: [], key: 'Escape', id: 'Escape' })
    expect(parseBinding('Up')).toMatchObject({ modifiers: [], key: 'ArrowUp', id: 'ArrowUp' })
    expect(parseBinding('F1')).toMatchObject({ modifiers: [], key: 'F1', id: 'F1' })
  })

  it('lets punctuation carry its own Shift', () => {
    expect(parseBinding('?')).toMatchObject({ modifiers: null, key: '?', id: '?' })
    expect(parseBinding('#')).toMatchObject({ modifiers: null, key: '#', id: '#' })
    expect(parseBinding('/')).toMatchObject({ modifiers: null, key: '/', id: '/' })
  })
})

describe('keyIdOf', () => {
  it('lowercases letters and keeps Shift', () => {
    expect(keyIdOf(event('j'))).toBe('j')
    expect(keyIdOf(event('J', { shiftKey: true }))).toBe('Shift+j')
  })

  it('uses Mod for the platform modifier', () => {
    expect(keyIdOf(event('k', { ctrlKey: true }))).toBe('Mod+k')
  })

  it('treats a shifted character as the character', () => {
    expect(keyIdOf(event('?', { shiftKey: true }))).toBe('?')
    expect(keyIdOf(event('/', { shiftKey: true }))).toBe('/')
    expect(keyIdOf(event('#', { shiftKey: true }))).toBe('#')
  })

  it('names Space, Escape and arrows', () => {
    expect(keyIdOf(event(' '))).toBe('Space')
    expect(keyIdOf(event('Escape'))).toBe('Escape')
    expect(keyIdOf(event('ArrowDown', { shiftKey: true }))).toBe('Shift+ArrowDown')
  })

  it('ignores IME composition', () => {
    expect(keyIdOf(event('Process', { isComposing: true }))).toBeNull()
    expect(keyIdOf(event('Dead'))).toBeNull()
  })
})

describe('formatKey', () => {
  it('uses readable names for special keys', () => {
    expect(formatKey('ArrowDown')).toBe('↓')
    expect(formatKey('Space')).toBe('Space')
    expect(formatKey('Escape')).toBe('Esc')
  })

  it('renders modifiers without a Mac', () => {
    expect(formatKey('Mod+Shift+Z')).toBe('Ctrl+Shift+Z')
  })
})
