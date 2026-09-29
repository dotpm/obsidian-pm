import { setIcon } from '#platform'
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

/** One selectable row in a popover list. */
export function renderOptionRow(parent: HTMLElement, row: OptionRow): HTMLButtonElement {
  const item = parent.createEl('button', { cls: 'pm-pop-item' })
  if (row.accent) item.addClass('pm-pop-item--accent')
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
