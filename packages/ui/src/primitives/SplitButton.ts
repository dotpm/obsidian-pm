import { createButton, setIcon, type PlatformButton } from '#platform'

/** A primary action with an optional chevron beside it that offers related actions. */
export class SplitButton {
  el: HTMLElement
  private main: PlatformButton
  private iconEl: HTMLElement
  private labelEl: HTMLElement
  private menuButton: PlatformButton | null = null

  constructor(parentEl: HTMLElement) {
    this.el = parentEl.createDiv('pm-split-btn')
    this.main = createButton(this.el).setCta()
    this.main.buttonEl.addClass('pm-split-btn-main')
    this.iconEl = this.main.buttonEl.createSpan('pm-split-btn-icon')
    this.labelEl = this.main.buttonEl.createSpan('pm-split-btn-label')
  }

  setLabel(text: string): this {
    this.labelEl.setText(text)
    this.main.buttonEl.setAttribute('aria-label', text)
    return this
  }

  setIcon(name: string): this {
    this.iconEl.empty()
    setIcon(this.iconEl, name)
    return this
  }

  onClick(handler: (e: MouseEvent) => unknown): this {
    this.main.onClick(handler)
    return this
  }

  /** Adds the chevron. `handler` gets the chevron, to open its menu under. */
  onMenu(label: string, handler: (anchor: HTMLElement) => unknown): this {
    if (!this.menuButton) {
      this.menuButton = createButton(this.el).setCta()
      this.menuButton.buttonEl.addClass('pm-split-btn-menu')
      setIcon(this.menuButton.buttonEl.createSpan('pm-split-btn-icon'), 'chevron-down')
      this.el.addClass('pm-split-btn--split')
    }
    this.menuButton.buttonEl.setAttribute('aria-label', label)
    const button = this.menuButton.buttonEl
    this.menuButton.onClick(() => handler(button))
    return this
  }
}
