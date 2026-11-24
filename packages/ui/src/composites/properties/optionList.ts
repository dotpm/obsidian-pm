import { activeDocument, setIcon } from '#platform'
import { isIconName } from '#icons'
import { Avatar } from '#primitives/Avatar'

export interface SelectItem {
  id: string
  label: string
  color?: string
  icon?: string
}

export interface GlyphSpec {
  color?: string
  icon?: string
}

/** A tinted icon or emoji when `icon` is set, otherwise a colored dot. */
export function renderGlyph(parent: HTMLElement, spec: GlyphSpec): void {
  if (spec.icon && isIconName(spec.icon)) {
    const ic = parent.createSpan({ cls: 'pm-glyph-icon' })
    setIcon(ic, spec.icon)
    if (spec.color) ic.setCssProps({ '--pm-glyph-color': spec.color })
  } else if (spec.icon) {
    parent.createSpan({ cls: 'pm-glyph-icon pm-glyph-text', text: spec.icon })
  } else if (spec.color) {
    const dot = parent.createSpan({ cls: 'pm-glyph-dot' })
    dot.setCssProps({ '--pm-glyph-color': spec.color })
  }
}

export interface OptionRow extends GlyphSpec {
  label: string
  selected?: boolean
  accent?: boolean
  /** Draws initials from this name instead of a glyph. Used by the assignee picker. */
  avatar?: string
  /** Faint text before the check, such as how many tasks hold the value. */
  note?: string
  /** A faint icon after the label, such as the mode a saved view opens in. */
  trailingIcon?: string
  /** `start` puts the check where the glyph would go, for a list that marks the one in use. */
  check?: 'start' | 'end'
  onPick: (e: MouseEvent) => void
}

/**
 * Arrow keys move between the rows of an open picker; Enter in its search field picks the
 * first match. Escape stays with the popover itself, so it closes only the picker.
 */
export function enableOptionNavigation(
  contentEl: HTMLElement,
  list: HTMLElement,
  searchInput?: HTMLInputElement | null
): void {
  const items = (): HTMLButtonElement[] => Array.from(list.querySelectorAll<HTMLButtonElement>('button.pm-pop-item'))
  const focusAt = (index: number): void => {
    const all = items()
    if (!all.length) return
    all[Math.max(0, Math.min(index, all.length - 1))].focus()
  }
  contentEl.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const all = items()
      if (!all.length) return
      const current = all.indexOf(activeDocument().activeElement as HTMLButtonElement)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      focusAt(current === -1 ? (delta > 0 ? 0 : all.length - 1) : current + delta)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (activeDocument().activeElement === searchInput) return
      event.preventDefault()
      focusAt(event.key === 'Home' ? 0 : items().length - 1)
      return
    }
    if (event.key === 'Enter' && activeDocument().activeElement === searchInput) {
      event.preventDefault()
      items()[0]?.click()
    }
  })
}

/** One selectable row in a popover list. */
export function renderOptionRow(parent: HTMLElement, row: OptionRow): HTMLButtonElement {
  const item = parent.createEl('button', { cls: 'pm-pop-item' })
  if (row.accent) item.addClass('pm-pop-item--accent')
  if (row.selected) item.addClass('pm-pop-item--selected')
  const check = createSpan({ cls: 'pm-pop-check' })
  setIcon(check, 'check')
  if (!row.selected) check.addClass('pm-pop-check--hidden')
  if (row.check === 'start') item.appendChild(check)
  else if (row.avatar) new Avatar(item).setColor(row.color).setName(row.avatar).setSize('sm')
  else renderGlyph(item, row)
  item.createSpan({ cls: 'pm-pop-item-label', text: row.label })
  if (row.trailingIcon) setIcon(item.createSpan('pm-pop-item-trail'), row.trailingIcon)
  if (row.note) item.createSpan({ cls: 'pm-pop-item-note', text: row.note })
  if (row.check !== 'start') item.appendChild(check)
  item.addEventListener('click', row.onPick)
  return item
}
