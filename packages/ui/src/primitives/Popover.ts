import { activeDocument, activeWindow, isPhone } from '../platform'

export interface PopoverOptions {
  anchor: HTMLElement
  host?: HTMLElement
  align?: 'left' | 'right'
  width?: number
  onClose?: () => void
}

const VIEWPORT_MARGIN = 12
const ANCHOR_GAP = 4

const CONTAINER_PROPS = [
  'transform',
  'translate',
  'rotate',
  'scale',
  'perspective',
  'filter',
  'backdrop-filter',
  '-webkit-backdrop-filter'
]

function isFixedContainer(cs: CSSStyleDeclaration): boolean {
  for (const prop of CONTAINER_PROPS) {
    const value = cs.getPropertyValue(prop)
    if (value && value !== 'none') return true
  }
  const containerType = cs.getPropertyValue('container-type')
  if (containerType && containerType !== 'normal') return true
  if (/\b(paint|layout|strict|content)\b/.test(cs.getPropertyValue('contain'))) return true
  return /\b(transform|perspective|filter|backdrop-filter|contain)\b/.test(cs.getPropertyValue('will-change'))
}

/**
 * Floating panel anchored to a trigger, for focusable content Obsidian's `Menu` can't
 * host (date inputs, search fields). The caller owns the lifecycle: fill `contentEl`,
 * `open()`, then `close()` on selection. It also closes on outside pointer-down and on
 * Escape, whose handler stops propagation so the host modal stays open. On phones it
 * renders as a bottom sheet instead.
 *
 * Inside a modal it mounts into the modal element rather than the body: Obsidian's focus
 * trap yanks focus back to the first field whenever it lands outside, which would make
 * the panel impossible to type in. `position: fixed` escapes the modal's overflow, unless a
 * theme gives `.modal` a transform, filter or backdrop-filter: that makes the modal the
 * containing block, so coordinates are resolved against whichever ancestor claims them.
 */
export class Popover {
  readonly contentEl: HTMLElement
  private readonly el: HTMLElement
  private readonly anchor: HTMLElement
  private readonly host: HTMLElement
  private readonly win: Window
  private readonly doc: Document
  private readonly align: 'left' | 'right'
  private readonly width?: number
  private readonly onCloseCb?: () => void
  private opened = false
  private container: HTMLElement | null = null

  constructor(opts: PopoverOptions) {
    this.anchor = opts.anchor
    this.win = activeWindow()
    this.doc = activeDocument()
    this.host = opts.host ?? this.anchor.closest<HTMLElement>('.modal') ?? this.doc.body
    this.align = opts.align ?? 'left'
    this.width = opts.width
    this.onCloseCb = opts.onClose
    this.el = createDiv('pm-pop')
    if (isPhone()) this.el.addClass('pm-pop--sheet')
    if (this.width != null) this.el.setCssProps({ '--pop-width': `${this.width}px` })
    this.contentEl = this.el.createDiv('pm-pop-body')
  }

  get isOpen(): boolean {
    return this.opened
  }

  open(): void {
    if (this.opened) return
    this.opened = true
    this.anchor.setAttribute('aria-expanded', 'true')
    this.host.appendChild(this.el)
    this.container = this.findContainer()
    this.reposition()
    this.doc.addEventListener('mousedown', this.onOutsideDown, true)
    this.doc.addEventListener('keydown', this.onKeyDown, true)
    this.win.addEventListener('scroll', this.reposition, true)
    this.win.addEventListener('resize', this.reposition)
  }

  close(): void {
    if (!this.opened) return
    this.opened = false
    this.anchor.setAttribute('aria-expanded', 'false')
    this.doc.removeEventListener('mousedown', this.onOutsideDown, true)
    this.doc.removeEventListener('keydown', this.onKeyDown, true)
    this.win.removeEventListener('scroll', this.reposition, true)
    this.win.removeEventListener('resize', this.reposition)
    this.el.remove()
    this.container = null
    this.onCloseCb?.()
  }

  private findContainer(): HTMLElement | null {
    for (let el = this.el.parentElement; el; el = el.parentElement) {
      if (isFixedContainer(this.win.getComputedStyle(el))) return el
    }
    return null
  }

  private area(): {
    top: number
    left: number
    right: number
    bottom: number
    originX: number
    originY: number
  } {
    const win = this.win
    const box = { top: 0, left: 0, right: win.innerWidth, bottom: win.innerHeight, originX: 0, originY: 0 }
    if (!this.container) return box
    const cs = win.getComputedStyle(this.container)
    const r = this.container.getBoundingClientRect()
    box.originX = r.left + parseFloat(cs.borderLeftWidth)
    box.originY = r.top + parseFloat(cs.borderTopWidth)
    if (cs.overflow !== 'visible') {
      box.top = Math.max(box.top, box.originY)
      box.left = Math.max(box.left, box.originX)
      box.right = Math.min(box.right, r.right - parseFloat(cs.borderRightWidth))
      box.bottom = Math.min(box.bottom, r.bottom - parseFloat(cs.borderBottomWidth))
    }
    return box
  }

  private reposition = (): void => {
    if (!this.opened || isPhone()) return
    const r = this.anchor.getBoundingClientRect()
    const box = this.area()
    this.el.setCssProps({ '--pop-max-height': `${box.bottom - box.top - VIEWPORT_MARGIN * 2}px` })
    const pw = this.el.offsetWidth || this.width || 200
    const ph = this.el.offsetHeight || 200
    let top = r.bottom + ANCHOR_GAP
    if (top + ph > box.bottom - VIEWPORT_MARGIN) {
      top = Math.max(box.top + VIEWPORT_MARGIN, r.top - ph - ANCHOR_GAP)
    }
    let left = this.align === 'right' ? r.right - pw : r.left
    left = Math.max(box.left + VIEWPORT_MARGIN, Math.min(left, box.right - pw - VIEWPORT_MARGIN))
    this.el.setCssProps({ '--pop-top': `${top - box.originY}px`, '--pop-left': `${left - box.originX}px` })
  }

  private onOutsideDown = (e: MouseEvent): void => {
    const target = e.target as Node
    if (this.el.contains(target) || this.anchor.contains(target)) return
    this.close()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      this.close()
    }
  }
}
