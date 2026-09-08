export interface PlatformButton {
  buttonEl: HTMLButtonElement
  setButtonText(text: string): this
  setIcon(icon: string): this
  setCta(): this
  removeCta(): this
  setWarning(): this
  setTooltip(text: string): this
  setDisabled(disabled: boolean): this
  setClass(cls: string): this
  onClick(handler: (e: MouseEvent) => unknown): this
}

export interface PlatformExtraButton {
  extraSettingsEl: HTMLElement
  setIcon(icon: string): this
  setTooltip(text: string): this
  setDisabled(disabled: boolean): this
  onClick(handler: () => unknown): this
}

export interface PlatformMenuItem {
  setTitle(title: string): this
  setIcon(icon: string | null): this
  setChecked(checked: boolean | null): this
  setDisabled(disabled: boolean): this
  onClick(handler: (e: MouseEvent | KeyboardEvent) => unknown): this
}

export interface PlatformMenu {
  addItem(build: (item: PlatformMenuItem) => unknown): this
  addSeparator(): this
  showAtMouseEvent(e: MouseEvent): this
  showAtPosition(position: { x: number; y: number }): this
  hide(): this
}

/** Everything the primitives and composites need from the host they render in. */
export interface UiPlatform {
  setIcon(el: HTMLElement, icon: string): void
  setTooltip(el: HTMLElement, text: string): void
  iconIds(): string[]
  isPhone(): boolean
  createButton(parent: HTMLElement): PlatformButton
  createExtraButton(parent: HTMLElement): PlatformExtraButton
  createMenu(): PlatformMenu
  showNotice(message: string): void
  activeWindow(): Window
  activeDocument(): Document
}

let current: UiPlatform | undefined

export function setPlatform(next: UiPlatform): void {
  current = next
}

function platform(): UiPlatform {
  if (!current) throw new Error('UI platform not configured; call setPlatform first')
  return current
}

export function setIcon(el: HTMLElement, icon: string): void {
  platform().setIcon(el, icon)
}

export function setTooltip(el: HTMLElement, text: string): void {
  platform().setTooltip(el, text)
}

export function getIconIds(): string[] {
  return platform().iconIds()
}

export function isPhone(): boolean {
  return platform().isPhone()
}

export function createButton(parent: HTMLElement): PlatformButton {
  return platform().createButton(parent)
}

export function createExtraButton(parent: HTMLElement): PlatformExtraButton {
  return platform().createExtraButton(parent)
}

export function createMenu(): PlatformMenu {
  return platform().createMenu()
}

export function showNotice(message: string): void {
  platform().showNotice(message)
}

export function activeWindow(): Window {
  return platform().activeWindow()
}

export function activeDocument(): Document {
  return platform().activeDocument()
}
