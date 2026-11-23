import { type App, Notice, type KeymapEventHandler, type Scope } from 'obsidian'
import { t } from '@dotpm/core'
import { FocusCursor } from './cursor'
import { KeyboardHelpModal } from './help'
import { keyIdOf, formatKey, parseBinding } from './keys'
import {
  KEYMAP,
  REPEATABLE,
  actionLabel,
  isActionAvailable,
  resolveAction,
  type ActionHandlers,
  type ActionId
} from './keymap'
import type { KeyboardContext, KeyboardSurface } from './types'
import { openChoice } from './choice'

export interface ActionSnapshot {
  activeId: string | null
  targetIds: string[]
  /** The board column holding the active occurrence, when the surface has columns. */
  activeGroupKey: string | null
}

export interface KeyboardHost {
  /** The view's own element; keys from another pane are not ours. */
  container(): HTMLElement | null
  getSurface(): KeyboardSurface | null
  getHandlers(snapshot?: ActionSnapshot): ActionHandlers
}

/** Actions the controller runs itself; everything else comes from the host's handler map. */
const CONTROLLED = new Set<ActionId>([
  'next',
  'prev',
  'nextColumn',
  'prevColumn',
  'first',
  'last',
  'pageDown',
  'pageUp',
  'extendDown',
  'extendUp',
  'toggleSelect',
  'selectAll',
  'escape',
  'palette',
  'help'
])

/** Mutations and undo run one at a time; navigation and opening a modal stay immediate. */
const QUEUED = new Set<ActionId>([
  'toggleDone',
  'statusNext',
  'statusPrev',
  'priorityNext',
  'priorityPrev',
  'archive',
  'undo',
  'redo',
  'moveCardNext',
  'moveCardPrev'
])

const NAVIGATION = new Set<ActionId>([
  'next',
  'prev',
  'nextColumn',
  'prevColumn',
  'first',
  'last',
  'pageDown',
  'pageUp',
  'extendDown',
  'extendUp',
  'toggleSelect',
  'selectAll',
  'escape'
])

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return !!el.closest('.cm-editor, [contenteditable="true"]')
}

/** Space and Enter belong to a focused button or link, not to the row behind it. */
function isNativeActivation(target: EventTarget | null, event: KeyboardEvent): boolean {
  if (event.key !== ' ' && event.key !== 'Enter') return false
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('button, a, [role="button"], [role="menuitem"], [role="option"]')
}

function report(err: unknown): void {
  console.error('Keyboard action failed', err)
  new Notice(t('common.somethingWentWrong'))
}

async function settle(result: Promise<void>): Promise<void> {
  try {
    await result
  } catch (err) {
    report(err)
  }
}

/**
 * One dispatcher per PM view, registered on the view's Obsidian Scope. The Scope is
 * active only while this leaf has focus and a modal takes it away, which is exactly the
 * "inside the PM UI, never globally" boundary the keys need.
 */
export class KeyboardController {
  private readonly handlers: KeymapEventHandler[] = []
  private cursor: FocusCursor | null = null
  private cursorSurface: KeyboardSurface | null = null
  /** Actions run one at a time, so undo cannot overtake the write it should undo. */
  private pending: Promise<void> = Promise.resolve()
  private destroyed = false

  constructor(
    private readonly app: App,
    private readonly scope: Scope,
    private readonly host: KeyboardHost
  ) {
    const seen = new Set<string>()
    for (const bindings of Object.values(KEYMAP)) {
      for (const binding of bindings) {
        for (const key of binding.keys) {
          const parsed = parseBinding(key)
          const signature = `${parsed.modifiers === null ? '*' : parsed.modifiers.join(',')}|${parsed.key}`
          if (seen.has(signature)) continue
          seen.add(signature)
          this.handlers.push(this.scope.register(parsed.modifiers, parsed.key, (event) => this.onKey(event)))
        }
      }
    }
  }

  /** Called when the surface changes, such as a table turning into a board. */
  setSurface(surface: KeyboardSurface | null): void {
    this.cursorSurface = surface
    this.cursor = surface ? new FocusCursor(surface) : null
    this.cursor?.reconcile()
  }

  reconcile(): void {
    this.cursor?.reconcile()
  }

  /** Opens the key sheet from a menu, where there may be no key to press. */
  openHelp(): void {
    const surface = this.surface()
    if (surface) this.showHelp(surface)
  }

  /** Carries the cursor across a mode switch when the same task exists in the next surface. */
  activate(id: string): boolean {
    return this.cursor?.activate(id) ?? false
  }

  destroy(): void {
    this.destroyed = true
    for (const handler of this.handlers) this.scope.unregister(handler)
    this.handlers.length = 0
    this.cursor = null
    this.cursorSurface = null
  }

  private onKey(event: KeyboardEvent): false | undefined {
    if (this.destroyed || event.defaultPrevented) return
    if (isEditable(event.target)) return
    const target = event.target as HTMLElement | null
    if (target && typeof target.closest === 'function') {
      if (target.closest('.pm-pop, .menu, .suggestion-container, .modal')) return
      // A view Scope can stay active while a sidebar or another pane has focus; only
      // keys from this view's own element, or from the page body, are ours.
      const container = this.host.container()
      const body = target.ownerDocument?.body
      if (container && target !== body && !container.contains(target)) return
    }
    // Menus do not push a Scope; let Escape close the menu before clearing anything here.
    const doc = target?.ownerDocument ?? activeDocument
    if (event.key === 'Escape' && doc.querySelector('.menu')) return
    if (isNativeActivation(event.target, event)) return
    const id = keyIdOf(event)
    if (!id) return
    return this.dispatch(id, event)
  }

  private surface(): KeyboardSurface | null {
    return this.host.getSurface()
  }

  private cursorFor(surface: KeyboardSurface): FocusCursor {
    if (!this.cursor || this.cursorSurface !== surface) {
      this.cursorSurface = surface
      this.cursor = new FocusCursor(surface)
    }
    return this.cursor
  }

  private dispatch(id: string, event?: KeyboardEvent): false | undefined {
    const surface = this.surface()
    if (!surface) return
    const action = resolveAction(surface.context, id)
    if (!action) return
    if (!isActionAvailable(action, surface)) return
    if (event?.repeat && !REPEATABLE.has(action)) return false
    const handled = this.execute(action, surface)
    if (!handled) return
    event?.preventDefault()
    event?.stopPropagation()
    return false
  }

  /** Runs an action from the palette, where there is no key event to answer. */
  runAction(action: ActionId): void {
    const surface = this.surface()
    if (!surface || !isActionAvailable(action, surface)) return
    this.execute(action, surface)
  }

  private execute(action: ActionId, surface: KeyboardSurface): boolean {
    if (this.destroyed) return false
    if (NAVIGATION.has(action)) return this.navigate(action, surface)
    if (action === 'help') {
      this.showHelp(surface)
      return true
    }
    if (action === 'palette') {
      this.showPalette(surface)
      return true
    }
    const handler = this.host.getHandlers(this.snapshot(surface))[action]
    if (!handler) return false
    if (QUEUED.has(action)) this.enqueue(handler)
    else this.runNow(handler)
    return true
  }

  private snapshot(surface: KeyboardSurface): ActionSnapshot {
    return {
      activeId: surface.activeId(),
      targetIds: this.cursorFor(surface).targetIds(),
      activeGroupKey: surface.activeGroupKey?.() ?? null
    }
  }

  private runNow(handler: () => void | Promise<void>): void {
    if (this.destroyed) return
    try {
      const result = handler()
      if (result && typeof result.then === 'function') void settle(result)
    } catch (err) {
      report(err)
    }
  }

  /** Queues work for picker callbacks too, so it cannot overtake a pending mutation. */
  enqueue(handler: () => void | Promise<void>): void {
    const pending = this.pending
    this.pending = (async () => {
      try {
        await pending
      } catch {
        // The previous handler reported its own failure; the queue still moves on.
      }
      if (this.destroyed) return
      try {
        await handler()
      } catch (err) {
        report(err)
      }
    })()
  }

  private navigate(action: ActionId, surface: KeyboardSurface): boolean {
    const cursor = this.cursorFor(surface)
    switch (action) {
      case 'next':
        cursor.move(1)
        return true
      case 'prev':
        cursor.move(-1)
        return true
      case 'nextColumn':
        cursor.moveGroup(1)
        return true
      case 'prevColumn':
        cursor.moveGroup(-1)
        return true
      case 'first':
        cursor.first()
        return true
      case 'last':
        cursor.last()
        return true
      case 'pageDown':
        cursor.page(1)
        return true
      case 'pageUp':
        cursor.page(-1)
        return true
      case 'extendDown':
        cursor.extend(1)
        return true
      case 'extendUp':
        cursor.extend(-1)
        return true
      case 'toggleSelect':
        cursor.toggleSelect()
        return true
      case 'selectAll':
        cursor.selectAll()
        return true
      case 'escape': {
        if (surface.cancel?.()) return true
        if (cursor.clearSelection()) return true
        return cursor.clearActive()
      }
      default:
        return false
    }
  }

  private hasHandler(action: ActionId): boolean {
    return CONTROLLED.has(action) || !!this.host.getHandlers()[action]
  }

  private showHelp(surface: KeyboardSurface): void {
    new KeyboardHelpModal(this.app, surface.context, surface, (action) => this.hasHandler(action)).open()
  }

  private keyHint(action: ActionId, context: KeyboardContext): string | undefined {
    for (const binding of KEYMAP[context]) {
      if (binding.action === action) return formatKey(binding.keys[0])
    }
    return undefined
  }

  private showPalette(surface: KeyboardSurface): void {
    const handlers = this.host.getHandlers()
    const actions = (Object.keys(handlers) as ActionId[]).filter(
      (action) =>
        !!handlers[action] &&
        !NAVIGATION.has(action) &&
        action !== 'palette' &&
        action !== 'help' &&
        isActionAvailable(action, surface)
    )
    if (!actions.length) return
    actions.sort((a, b) => actionLabel(a, surface.context).localeCompare(actionLabel(b, surface.context)))
    openChoice(
      this.app,
      t('keyboard.palettePlaceholder'),
      actions.map((action) => ({
        label: actionLabel(action, surface.context),
        detail: this.keyHint(action, surface.context),
        value: action
      })),
      (action) => this.runAction(action)
    )
  }
}
