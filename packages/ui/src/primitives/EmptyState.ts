import { createButton, setIcon } from '#platform'
import { isIconName } from '#icons'

export class EmptyState {
  el: HTMLElement
  private iconEl?: HTMLElement
  private titleEl?: HTMLElement
  private bodyEl?: HTMLElement
  private actionEl?: HTMLElement

  constructor(parentEl: HTMLElement) {
    this.el = parentEl.createDiv('pm-empty-state')
  }

  /** A Lucide icon name, or any other text such as an emoji. */
  setIcon(icon: string): this {
    this.iconEl ??= this.el.createDiv('pm-empty-icon')
    this.iconEl.empty()
    if (isIconName(icon)) setIcon(this.iconEl, icon)
    else this.iconEl.setText(icon)
    return this
  }

  setTitle(text: string): this {
    this.titleEl ??= this.el.createEl('h3')
    this.titleEl.setText(text)
    return this
  }

  setBody(text: string): this {
    this.bodyEl ??= this.el.createEl('p')
    this.bodyEl.setText(text)
    return this
  }

  setAction(label: string, onClick: () => void): this {
    if (!this.actionEl) this.actionEl = this.el.createDiv('pm-empty-action')
    this.actionEl.empty()
    createButton(this.actionEl).setButtonText(label).setCta().onClick(onClick)
    return this
  }

  /** A plain button after the main action. */
  addSecondaryAction(label: string, onClick: () => void): this {
    if (!this.actionEl) this.actionEl = this.el.createDiv('pm-empty-action')
    createButton(this.actionEl).setButtonText(label).onClick(onClick)
    return this
  }
}
