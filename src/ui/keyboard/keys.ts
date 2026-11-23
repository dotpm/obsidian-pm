import { Platform } from 'obsidian'

export type Modifier = 'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt'

export interface ParsedKey {
  /** Modifiers handed to `Scope.register`; null lets the character carry its own Shift. */
  modifiers: Modifier[] | null
  /** A `KeyboardEvent.key` value. */
  key: string
}

interface ParsedBinding extends ParsedKey {
  /** The canonical id used to look a key up in the map, such as `Mod+Shift+z`. */
  id: string
}

const NAMED: Record<string, string> = {
  Esc: 'Escape',
  Escape: 'Escape',
  Space: ' ',
  Spacebar: ' ',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End',
  Enter: 'Enter',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Tab: 'Tab'
}

const MOD_ORDER: Modifier[] = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift']

function orderModifiers(modifiers: Modifier[]): Modifier[] {
  return [...new Set(modifiers)].sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b))
}

/**
 * Parses a binding like `Mod+Shift+Z`, `Shift+ArrowDown`, `?` or `Space` into what
 * Obsidian's Scope wants. An uppercase letter on its own means Shift was written as
 * the capital; with a modifier already there, `Mod+K` is only the letter.
 */
export function parseBinding(binding: string): ParsedBinding {
  const parts = binding.split('+')
  let key = parts.pop() ?? binding
  const hadModifiers = parts.length > 0
  const modifiers: Modifier[] = []
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'mod':
        modifiers.push('Mod')
        break
      case 'ctrl':
      case 'control':
        modifiers.push('Ctrl')
        break
      case 'meta':
      case 'cmd':
      case 'command':
        modifiers.push('Meta')
        break
      case 'shift':
        modifiers.push('Shift')
        break
      case 'alt':
      case 'option':
        modifiers.push('Alt')
        break
    }
  }
  if (key.length === 1 && /[A-Z]/.test(key)) {
    key = key.toLowerCase()
    if (!hadModifiers) modifiers.push('Shift')
  }
  key = NAMED[key] ?? key
  // Punctuation carries its Shift in the character, so it is registered without modifiers:
  // `?` arrives the same on every layout, and Shift+/ still lands on the binding.
  const punctuation = key.length === 1 && key !== ' ' && !/[a-z0-9]/i.test(key)
  const ordered = orderModifiers(modifiers)
  if (punctuation) return { modifiers: null, key, id: key }
  return { modifiers: ordered, key, id: [...ordered, key === ' ' ? 'Space' : key].join('+') }
}

/** The canonical id for a key event, in the same shape `parseBinding` writes. */
export function keyIdOf(event: KeyboardEvent): string | null {
  if (event.isComposing || event.key === 'Process' || event.key === 'Dead') return null
  let key = event.key
  let shift = event.shiftKey
  if (key === 'Esc') key = 'Escape'
  if (key === ' ' || key === 'Spacebar') key = 'Space'
  if (key.length === 1 && /[a-z]/i.test(key)) {
    key = key.toLowerCase()
  } else if (key.length === 1) {
    // The character itself already names the shift, so `Shift+7` and `/` are one key.
    shift = false
  }
  const modifiers: Modifier[] = []
  if (Platform.isMacOS ? event.metaKey : event.ctrlKey) modifiers.push('Mod')
  if (event.altKey) modifiers.push('Alt')
  if (shift) modifiers.push('Shift')
  return [...orderModifiers(modifiers), key].join('+')
}

const SYMBOLS: Record<string, string> = {
  ArrowDown: '↓',
  ArrowUp: '↑',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  Enter: '↵',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End',
  Space: 'Space',
  ' ': 'Space'
}

/** How a key reads in the help sheet. */
export function formatKey(binding: string): string {
  const parsed = parseBinding(binding)
  const key = SYMBOLS[parsed.key] ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key)
  if (parsed.modifiers === null) return key
  const mac = Platform.isMacOS
  const parts: string[] = parsed.modifiers.map((modifier) => {
    switch (modifier) {
      case 'Mod':
        return mac ? '⌘' : 'Ctrl'
      case 'Ctrl':
        return 'Ctrl'
      case 'Meta':
        return 'Meta'
      case 'Alt':
        return mac ? '⌥' : 'Alt'
      case 'Shift':
        return mac ? '⇧' : 'Shift'
      default:
        return modifier
    }
  })
  parts.push(key)
  return mac && parsed.modifiers.length ? parts.join('') : parts.join('+')
}
