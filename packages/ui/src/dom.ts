import { activeDocument, showNotice } from './platform'

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

export function safeAsync<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => void {
  return (...args: A) => {
    void (async () => {
      try {
        await fn(...args)
      } catch (err: unknown) {
        console.error('[PM]', err)
        showNotice('Something went wrong. Check the console for details.')
      }
    })()
  }
}
