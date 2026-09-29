import { t } from '@dotpm/core'
import { activeDocument, showNotice, type PlatformMenu } from './platform'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const el = activeDocument().createElementNS(SVG_NS, tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v))
    }
  }
  return el
}

/**
 * Makes an element that isn't a button open something: click and Enter or Space both reach
 * `open`, and neither reaches the row or card behind it.
 */
export function makeActivatable(el: HTMLElement, open: () => void): void {
  el.setAttr('role', 'link')
  el.setAttr('tabindex', '0')
  el.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    open()
  })
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    open()
  })
}

/**
 * Lets the rows be dragged into another order. A row dropped on another takes that row's
 * place, so it lands after a row below it and before a row above it. `onReorder` gets every
 * id in the new order; nothing is called when the order stays the same.
 */
export function makeReorderable<T extends string>(
  rows: { el: HTMLElement; id: T }[],
  onReorder: (ids: T[]) => void
): void {
  const ids = rows.map((row) => row.id)
  let dragged: T | null = null
  for (const { el, id } of rows) {
    el.setAttr('draggable', 'true')
    el.addEventListener('dragstart', (e) => {
      dragged = id
      e.dataTransfer?.setData('text/plain', id)
      el.addClass('is-dragging')
    })
    el.addEventListener('dragend', () => el.removeClass('is-dragging'))
    el.addEventListener('dragover', (e) => e.preventDefault())
    el.addEventListener('drop', (e) => {
      e.preventDefault()
      const from = dragged
      dragged = null
      if (from === null || from === id || !ids.includes(from)) return
      const next = ids.filter((other) => other !== from)
      next.splice(ids.indexOf(id), 0, from)
      onReorder(next)
    })
  }
}

export function safeAsync<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => void {
  return (...args: A) => {
    void (async () => {
      try {
        await fn(...args)
      } catch (err: unknown) {
        console.error('[PM]', err)
        showNotice(t('common.somethingWentWrong'))
      }
    })()
  }
}

/**
 * Opens a menu under a button rather than at the pointer, so keyboard activation places it
 * too. `align: 'right'` lines the menu's right edge up with the button's, for a button at the
 * end of a row.
 */
export function showMenuBelow(menu: PlatformMenu, anchor: HTMLElement, align: 'left' | 'right' = 'left'): void {
  const rect = anchor.getBoundingClientRect()
  if (align === 'right') menu.showAtPosition({ x: rect.right, y: rect.bottom + 4, left: true })
  else menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 })
}
