import { t } from '@dotpm/core'
import { showMenuBelow } from './dom'
import { createMenu } from './platform'
import { addPaletteMenuItem } from './StatusBadge'

export interface FilterOption {
  id: string
  label: string
  /** A status or priority icon: emoji render in the label, named icons beside it. */
  icon?: string
  namedIcon?: string
}

/** A checkable menu over `options` that toggles ids in `selected` in place, with a Clear item. */
export function showFilterMenu(
  anchor: HTMLElement,
  selected: string[],
  options: FilterOption[],
  onChange: () => void
): void {
  const menu = createMenu()
  for (const opt of options) {
    addPaletteMenuItem(
      menu,
      { label: opt.label, icon: opt.icon ?? '', namedIcon: opt.namedIcon },
      {
        checked: selected.includes(opt.id),
        onClick: () => {
          const idx = selected.indexOf(opt.id)
          if (idx >= 0) selected.splice(idx, 1)
          else selected.push(opt.id)
          onChange()
        }
      }
    )
  }
  if (selected.length) {
    menu.addSeparator()
    menu.addItem((item) =>
      item.setTitle(t('common.clear')).onClick(() => {
        selected.length = 0
        onChange()
      })
    )
  }
  showMenuBelow(menu, anchor)
}
