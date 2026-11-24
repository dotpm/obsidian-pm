import { describe, expect, it } from 'vitest'
import { KEYMAP, actionLabel, isActionAvailable, resolveAction, type ActionId } from './keymap'
import { parseBinding } from './keys'
import type { KeyboardContext, KeyboardSurface } from './types'

describe('keymap', () => {
  it('gives each key one meaning in each context', () => {
    for (const [context, bindings] of Object.entries(KEYMAP) as [KeyboardContext, typeof KEYMAP.table][]) {
      const seen = new Map<string, ActionId>()
      for (const binding of bindings) {
        for (const key of binding.keys) {
          const id = parseBinding(key).id
          const previous = seen.get(id)
          expect(previous, `${context}: ${id} is bound twice`).toBeUndefined()
          seen.set(id, binding.action)
        }
      }
    }
  })

  it('resolves the same key differently per surface', () => {
    expect(resolveAction('table', 'j')).toBe('next')
    expect(resolveAction('board', 'l')).toBe('nextColumn')
    expect(resolveAction('board', 'Mod+ArrowRight')).toBe('moveCardNext')
    expect(resolveAction('projects', 'e')).toBe('editProject')
    expect(resolveAction('table', 'e')).toBe('open')
  })

  it('clears the filters on Shift+F where f opens them', () => {
    for (const context of ['table', 'board', 'timeline', 'projects'] as const) {
      expect(resolveAction(context, 'f')).toBe('filter')
      expect(resolveAction(context, 'Shift+f')).toBe('clearFilter')
    }
  })

  it('picks a saved view on w', () => {
    for (const context of ['table', 'board', 'timeline', 'projects'] as const) {
      expect(resolveAction(context, 'w')).toBe('pickSavedView')
    }
    expect(resolveAction('overview', 'w')).toBeNull()
  })

  it('resolves the punctuation aliases', () => {
    expect(resolveAction('table', '?')).toBe('help')
    expect(resolveAction('table', '/')).toBe('search')
    expect(resolveAction('table', '#')).toBe('tags')
  })

  it('keeps selection keys to the table', () => {
    const boardKeys = KEYMAP.board.flatMap((binding) => binding.keys)
    expect(boardKeys).not.toContain('Space')
    expect(boardKeys).not.toContain('Shift+ArrowDown')
    expect(KEYMAP.table.flatMap((binding) => binding.keys)).toContain('Space')
  })

  it('labels every action for every context', () => {
    for (const context of Object.keys(KEYMAP) as KeyboardContext[]) {
      for (const binding of KEYMAP[context]) {
        expect(actionLabel(binding.action, context)).not.toBe('')
      }
    }
  })
})

describe('isActionAvailable', () => {
  const surface = (over: Partial<KeyboardSurface> = {}): KeyboardSurface => ({
    context: 'table',
    groups: () => [['a', 'b']],
    activeId: () => 'a',
    setActive: () => {},
    selection: () => ({ ids: () => new Set<string>(), set: () => {}, onChange: () => {} }),
    ...over
  })

  it('needs items for navigation', () => {
    expect(isActionAvailable('next', surface())).toBe(true)
    expect(isActionAvailable('next', surface({ groups: () => [] }))).toBe(false)
  })

  it('needs a selection for selection actions', () => {
    expect(isActionAvailable('toggleSelect', surface())).toBe(true)
    expect(isActionAvailable('toggleSelect', surface({ selection: undefined }))).toBe(false)
    expect(isActionAvailable('extendDown', surface({ selection: undefined }))).toBe(false)
  })

  it('needs a target for task actions', () => {
    expect(isActionAvailable('delete', surface())).toBe(true)
    expect(isActionAvailable('delete', surface({ activeId: () => null }))).toBe(false)
  })

  it('uses a selection as a target', () => {
    const selected = surface({
      activeId: () => null,
      selection: () => ({ ids: () => new Set(['a']), set: () => {}, onChange: () => {} })
    })
    expect(isActionAvailable('delete', selected)).toBe(true)
    expect(isActionAvailable('open', selected)).toBe(false)
  })

  it('needs the surface to support expand and collapse', () => {
    expect(isActionAvailable('expand', surface())).toBe(false)
    expect(isActionAvailable('expand', surface({ expand: () => {} }))).toBe(true)
  })
})
