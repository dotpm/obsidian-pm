// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { App, Scope } from 'obsidian'
import { KeyboardController, type ActionSnapshot } from './controller'
import type { ActionHandlers } from './keymap'
import type { KeyboardSurface } from './types'

interface Registered {
  modifiers: unknown
  key: unknown
  fn: (event: KeyboardEvent) => unknown
}

class FakeScope {
  handlers: Registered[] = []
  register(modifiers: unknown, key: unknown, fn: (event: KeyboardEvent) => unknown): Registered {
    const handler = { modifiers, key, fn }
    this.handlers.push(handler)
    return handler
  }
  unregister(handler: Registered): void {
    const at = this.handlers.indexOf(handler)
    if (at !== -1) this.handlers.splice(at, 1)
  }
}

interface State {
  surface: KeyboardSurface
  setActive(id: string | null): void
  setSelection(ids: string[]): void
  selection(): Set<string>
}

function makeSurface(active: string | null = null): State {
  let activeId = active
  let selected = new Set<string>()
  const surface: KeyboardSurface = {
    context: 'table',
    groups: () => [['a', 'b']],
    activeId: () => activeId,
    setActive: (id) => {
      activeId = id
    },
    selection: () => ({
      ids: () => selected,
      set: (ids) => {
        selected = ids
      },
      onChange: () => {}
    })
  }
  return {
    surface,
    setActive: (id) => {
      activeId = id
    },
    setSelection: (ids) => {
      selected = new Set(ids)
    },
    selection: () => selected
  }
}

function makeController(
  state: State,
  handlers: (snapshot?: ActionSnapshot) => ActionHandlers,
  container: HTMLElement = activeDocument.body
): { controller: KeyboardController; scope: FakeScope } {
  const scope = new FakeScope()
  const controller = new KeyboardController({} as App, scope as unknown as Scope, {
    container: () => container,
    getSurface: () => state.surface,
    getHandlers: handlers
  })
  return { controller, scope }
}

const tick = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0))

function keyEvent(target: EventTarget, key: string): KeyboardEvent {
  return {
    key,
    target,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    preventDefault: vi.fn<() => void>(),
    stopPropagation: vi.fn<() => void>()
  } as unknown as KeyboardEvent
}

beforeEach(() => {
  activeDocument.body.innerHTML = ''
})

describe('KeyboardController', () => {
  it('runs mutations in order and captures their targets when the key is pressed', async () => {
    const state = makeSurface('a')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    const { controller } = makeController(state, (snapshot) => ({
      toggleDone: async () => {
        calls.push(`done:${snapshot?.targetIds.join(',')}`)
        await gate
      },
      undo: async () => {
        calls.push('undo')
      }
    }))

    controller.runAction('toggleDone')
    state.setActive('b')
    controller.runAction('undo')
    await tick()
    expect(calls).toEqual(['done:a'])
    release()
    await tick()
    expect(calls).toEqual(['done:a', 'undo'])
  })

  it('runs navigation and modal-opening actions immediately', () => {
    const state = makeSurface('a')
    const calls: string[] = []
    const { controller } = makeController(state, () => ({
      open: () => {
        calls.push('open')
      }
    }))
    controller.runAction('open')
    expect(calls).toEqual(['open'])
  })

  it('does not start queued work after destroy', async () => {
    const state = makeSurface('a')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    const { controller } = makeController(state, () => ({
      toggleDone: async () => {
        calls.push('done')
        await gate
      },
      undo: async () => {
        calls.push('undo')
      }
    }))

    controller.runAction('toggleDone')
    controller.runAction('undo')
    await tick()
    controller.destroy()
    release()
    await tick()
    expect(calls).toEqual(['done'])
  })

  it('ignores keys whose target is outside the view', () => {
    const state = makeSurface()
    const container = activeDocument.createElement('div')
    const outside = activeDocument.createElement('div')
    activeDocument.body.append(container, outside)
    const { scope } = makeController(state, () => ({}), container)
    const handler = scope.handlers.find((entry) => entry.key === 'j')
    if (!handler) throw new Error('no j handler')

    handler.fn(keyEvent(outside, 'j'))
    expect(state.surface.activeId()).toBeNull()

    const inside = activeDocument.createElement('div')
    container.append(inside)
    handler.fn(keyEvent(inside, 'j'))
    expect(state.surface.activeId()).toBe('a')
  })

  it('drops a button left focused in the view when the cursor moves, so Enter reaches the task', () => {
    const state = makeSurface('a')
    const container = activeDocument.createElement('div')
    const chip = activeDocument.createElement('button')
    container.append(chip)
    activeDocument.body.append(container)
    const opened: string[] = []
    const { scope } = makeController(
      state,
      () => ({
        open: () => {
          opened.push('open')
        }
      }),
      container
    )
    const next = scope.handlers.find((entry) => entry.key === 'j')
    const enter = scope.handlers.find((entry) => entry.key === 'Enter')
    if (!next || !enter) throw new Error('no handlers')

    chip.focus()
    expect(activeDocument.activeElement).toBe(chip)
    next.fn(keyEvent(chip, 'j'))
    expect(state.surface.activeId()).toBe('b')
    expect(activeDocument.activeElement).not.toBe(chip)

    enter.fn(keyEvent(activeDocument.body, 'Enter'))
    expect(opened).toEqual(['open'])
  })

  it('leaves Enter to a focused button until the cursor moves', () => {
    const state = makeSurface('a')
    const container = activeDocument.createElement('div')
    const chip = activeDocument.createElement('button')
    container.append(chip)
    activeDocument.body.append(container)
    const opened: string[] = []
    const { scope } = makeController(
      state,
      () => ({
        open: () => {
          opened.push('open')
        }
      }),
      container
    )
    const enter = scope.handlers.find((entry) => entry.key === 'Enter')
    if (!enter) throw new Error('no Enter handler')

    enter.fn(keyEvent(chip, 'Enter'))
    expect(opened).toEqual([])
  })

  it('lets Escape close an open menu before clearing a selection', () => {
    const state = makeSurface('a')
    state.setSelection(['a'])
    const container = activeDocument.createElement('div')
    const inside = activeDocument.createElement('div')
    container.append(inside)
    activeDocument.body.append(container)
    const menu = activeDocument.createElement('div')
    menu.className = 'menu'
    activeDocument.body.append(menu)
    const { scope } = makeController(state, () => ({}), container)
    const handler = scope.handlers.find((entry) => entry.key === 'Escape')
    if (!handler) throw new Error('no Escape handler')

    handler.fn(keyEvent(inside, 'Escape'))
    expect(state.selection().size).toBe(1)
    expect(state.surface.activeId()).toBe('a')
  })
})
