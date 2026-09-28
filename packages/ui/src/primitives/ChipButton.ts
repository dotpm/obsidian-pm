import { createButton, setIcon, setTooltip, type PlatformButton } from '#platform'

export class ChipButton {
  el: HTMLButtonElement
  private button: PlatformButton
  private iconEl: HTMLElement | null = null
  private labelEl: HTMLElement
  private badgeEl: HTMLElement | null = null
  private detailEl: HTMLElement | null = null
  private chevronEl: HTMLElement | null = null

  constructor(parentEl: HTMLElement) {
    this.button = createButton(parentEl)
    this.el = this.button.buttonEl
    this.el.addClass('pm-chip-btn')
    this.labelEl = this.el.createSpan('pm-chip-btn-label')
  }

  setLabel(text: string): this {
    this.labelEl.setText(text)
    this.el.toggleClass('pm-chip-btn--icon-only', !text)
    return this
  }

  setIcon(name: string): this {
    this.iconEl ??= this.el.createSpan('pm-chip-btn-icon')
    this.iconEl.empty()
    setIcon(this.iconEl, name)
    this.order()
    return this
  }

  /** A count or short value after the label. Empty removes it. */
  setBadge(text: string): this {
    if (!text) {
      this.badgeEl?.remove()
      this.badgeEl = null
      return this
    }
    this.badgeEl ??= this.el.createSpan('pm-chip-btn-badge')
    this.badgeEl.setText(text)
    this.order()
    return this
  }

  /** Faint text after the label, for a state worth seeing at rest ("2 hidden"). Empty removes it. */
  setDetail(text: string): this {
    if (!text) {
      this.detailEl?.remove()
      this.detailEl = null
      return this
    }
    this.detailEl ??= this.el.createSpan('pm-chip-btn-detail')
    this.detailEl.setText(text)
    this.order()
    return this
  }

  /** A trailing chevron, for a button that opens a menu or popover. */
  setChevron(shown: boolean): this {
    if (!shown) {
      this.chevronEl?.remove()
      this.chevronEl = null
      return this
    }
    if (!this.chevronEl) {
      this.chevronEl = this.el.createSpan('pm-chip-btn-chevron')
      setIcon(this.chevronEl, 'chevron-down')
    }
    this.order()
    return this
  }

  setActive(active: boolean): this {
    this.el.toggleClass('pm-chip-btn--active', active)
    return this
  }

  setShape(shape: 'rounded' | 'pill'): this {
    this.el.toggleClass('pm-chip-btn--pill', shape === 'pill')
    return this
  }

  setAriaLabel(label: string): this {
    this.el.setAttribute('aria-label', label)
    return this
  }

  setTooltip(text: string): this {
    setTooltip(this.el, text)
    return this
  }

  setDisabled(disabled: boolean): this {
    this.button.setDisabled(disabled)
    return this
  }

  onClick(handler: (e: MouseEvent) => unknown): this {
    this.button.onClick(handler)
    return this
  }

  onContextMenu(handler: (e: MouseEvent) => unknown): this {
    this.el.addEventListener('contextmenu', handler)
    return this
  }

  private order(): void {
    for (const part of [this.iconEl, this.labelEl, this.detailEl, this.badgeEl, this.chevronEl]) {
      if (part) this.el.appendChild(part)
    }
  }
}
