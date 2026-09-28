import { Popover } from '#primitives/Popover'
import { SegmentedControl } from '#primitives/SegmentedControl'
import { type SortDir, type SortKey, type SortOrder, t } from '@dotpm/core'
import { renderOptionRow } from '../properties/optionList'

export interface SortPopoverProps {
  fields: { id: SortKey; label: string }[]
  /** Edited in place. */
  sort: SortOrder
  onChange: () => void
}

export function openSortPopover(anchor: HTMLElement, props: SortPopoverProps): Popover {
  const pop = new Popover({ anchor, width: 220 })
  pop.contentEl.createDiv({ cls: 'pm-pop-heading', text: t('header.sortBy') })
  const list = pop.contentEl.createDiv('pm-pop-list')
  const renderList = () => {
    list.empty()
    for (const field of props.fields) {
      renderOptionRow(list, {
        label: field.label,
        selected: field.id === props.sort.sortKey,
        onPick: () => {
          props.sort.sortKey = field.id
          renderList()
          props.onChange()
        }
      })
    }
  }
  renderList()
  const dir = pop.contentEl.createDiv('pm-sort-dir')
  new SegmentedControl<SortDir>(dir, {
    options: [
      { id: 'asc', label: t('header.sortAsc') },
      { id: 'desc', label: t('header.sortDesc') }
    ],
    active: props.sort.sortDir,
    onChange: (next) => {
      props.sort.sortDir = next
      props.onChange()
    }
  })
  pop.open()
  return pop
}
