import type { PlatformButton, PlatformExtraButton, PlatformMenu, PlatformMenuItem, UiPlatform } from './platform'

const LUCIDE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Marks the element with the icon id; a page supplies the glyphs through CSS or a later pass. */
function setIcon(el: HTMLElement, icon: string): void {
  el.empty()
  if (!LUCIDE_ID.test(icon)) return
  el.createSvg('svg', { cls: ['svg-icon', `lucide-${icon}`], attr: { 'data-icon': icon } })
}

function setTooltip(el: HTMLElement, text: string): void {
  el.setAttr('aria-label', text)
}

class DomButton implements PlatformButton {
  buttonEl: HTMLButtonElement

  constructor(parent: HTMLElement) {
    this.buttonEl = parent.createEl('button')
  }

  setButtonText(text: string): this {
    this.buttonEl.setText(text)
    return this
  }

  setIcon(icon: string): this {
    setIcon(this.buttonEl, icon)
    return this
  }

  setCta(): this {
    this.buttonEl.addClass('mod-cta')
    return this
  }

  removeCta(): this {
    this.buttonEl.removeClass('mod-cta')
    return this
  }

  setWarning(): this {
    this.buttonEl.addClass('mod-warning')
    return this
  }

  setTooltip(text: string): this {
    setTooltip(this.buttonEl, text)
    return this
  }

  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled
    return this
  }

  setClass(cls: string): this {
    this.buttonEl.addClass(cls)
    return this
  }

  onClick(handler: (e: MouseEvent) => unknown): this {
    this.buttonEl.addEventListener('click', handler)
    return this
  }
}

class DomExtraButton implements PlatformExtraButton {
  extraSettingsEl: HTMLElement

  constructor(parent: HTMLElement) {
    this.extraSettingsEl = parent.createDiv({ cls: ['clickable-icon', 'extra-setting-button'] })
  }

  setIcon(icon: string): this {
    setIcon(this.extraSettingsEl, icon)
    return this
  }

  setTooltip(text: string): this {
    setTooltip(this.extraSettingsEl, text)
    return this
  }

  setDisabled(disabled: boolean): this {
    this.extraSettingsEl.toggleClass('is-disabled', disabled)
    return this
  }

  onClick(handler: () => unknown): this {
    this.extraSettingsEl.addEventListener('click', handler)
    return this
  }
}

class DomMenuItem implements PlatformMenuItem {
  el: HTMLElement
  private titleEl: HTMLElement
  private iconEl: HTMLElement

  constructor(parent: HTMLElement, close: () => void) {
    this.el = parent.createDiv('menu-item')
    this.iconEl = this.el.createDiv('menu-item-icon')
    this.titleEl = this.el.createDiv('menu-item-title')
    this.el.addEventListener('click', close)
  }

  setTitle(title: string): this {
    this.titleEl.setText(title)
    return this
  }

  setIcon(icon: string | null): this {
    if (icon) setIcon(this.iconEl, icon)
    else this.iconEl.empty()
    return this
  }

  setChecked(checked: boolean | null): this {
    this.el.toggleClass('mod-checked', checked === true)
    return this
  }

  setDisabled(disabled: boolean): this {
    this.el.toggleClass('is-disabled', disabled)
    return this
  }

  onClick(handler: (e: MouseEvent | KeyboardEvent) => unknown): this {
    this.el.addEventListener('click', handler)
    return this
  }
}

class DomMenu implements PlatformMenu {
  el: HTMLElement

  constructor() {
    this.el = createDiv('menu')
  }

  addItem(build: (item: PlatformMenuItem) => unknown): this {
    build(new DomMenuItem(this.el, () => this.hide()))
    return this
  }

  addSeparator(): this {
    this.el.createDiv('menu-separator')
    return this
  }

  showAtMouseEvent(e: MouseEvent): this {
    return this.showAtPosition({ x: e.clientX, y: e.clientY })
  }

  showAtPosition(position: { x: number; y: number }): this {
    this.el.setCssProps({ left: `${position.x}px`, top: `${position.y}px` })
    document.body.appendChild(this.el)
    return this
  }

  hide(): this {
    this.el.detach()
    return this
  }
}

export const domPlatform: UiPlatform = {
  setIcon,
  setTooltip,
  iconIds: () => [],
  isPhone: () => false,
  createButton: (parent) => new DomButton(parent),
  createExtraButton: (parent) => new DomExtraButton(parent),
  createMenu: () => new DomMenu(),
  showNotice: (message) => {
    console.error(message)
  },
  activeWindow: () => window,
  activeDocument: () => document
}
