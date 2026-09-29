import { Checkbox } from '#primitives/Checkbox'
import { Popover } from '#primitives/Popover'
import { type GroupState, t } from '@dotpm/core'
import { renderGlyph } from '../properties/optionList'
import { renderVisibilityList } from '../visibilityList'
import type { BoardColumn } from '../../views/boardColumns'

export interface GroupPopoverProps {
  fields: { id: string; label: string }[]
  /** Edited in place. */
  group: GroupState
  /** The columns as the board would draw them now, asked again after every change. */
  columns: () => BoardColumn[]
  onChange: () => void
}

/**
 * What the board's columns stand for, and which of them show: the field, whether empty
 * columns hide, and the column list, dragged to reorder and toggled by its eye.
 */
export function renderGroupPanel(parent: HTMLElement, props: GroupPopoverProps): void {
  const body = parent.createDiv('pm-group-pop')
  const { group } = props

  const prefs = () => {
    group.columns ??= {}
    group.columns[group.field] ??= {}
    return group.columns[group.field]
  }

  const changed = (): void => {
    render()
    props.onChange()
  }

  const render = (): void => {
    body.empty()
    const byRow = body.createDiv('pm-group-row')
    byRow.createSpan({ cls: 'pm-group-label', text: t('header.columnsBy') })
    const field = byRow.createEl('select', { cls: 'dropdown pm-group-field' })
    for (const option of props.fields) {
      field.createEl('option', { value: option.id, text: option.label }).selected = option.id === group.field
    }
    field.addEventListener('change', () => {
      group.field = field.value
      changed()
    })

    const emptyRow = body.createEl('label', { cls: 'pm-group-row' })
    emptyRow.createSpan({ cls: 'pm-group-label', text: t('header.hideEmpty') })
    new Checkbox(emptyRow).setChecked(!!group.hideEmpty).onChange((checked) => {
      if (checked) group.hideEmpty = true
      else delete group.hideEmpty
      changed()
    })

    const columns = props.columns()
    const head = body.createDiv('pm-group-head')
    head.createSpan({ cls: 'pm-pop-heading', text: t('header.columns') })
    const showAll = head.createEl('button', { cls: 'pm-sort-pop-reset', text: t('header.showAll') })
    showAll.disabled = !prefs().hidden?.length
    showAll.addEventListener('click', () => {
      delete prefs().hidden
      changed()
    })

    renderVisibilityList(body, {
      rows: columns.map((column) => ({
        id: column.id,
        label: column.label,
        hidden: prefs().hidden?.includes(column.id) ?? false,
        detail: column.tasks.length ? String(column.tasks.length) : t('header.emptyColumn'),
        quiet: !column.tasks.length,
        glyph: (el) => renderGlyph(el, { icon: column.icon, color: column.color })
      })),
      showLabel: t('header.showColumn'),
      hideLabel: t('header.hideColumn'),
      onToggle: (id) => {
        const hidden = new Set(prefs().hidden ?? [])
        if (hidden.has(id)) hidden.delete(id)
        else hidden.add(id)
        if (hidden.size) prefs().hidden = [...hidden]
        else delete prefs().hidden
        changed()
      },
      onReorder: (ids) => {
        prefs().order = ids
        changed()
      }
    })
  }

  render()
}

/** The group panel in a popover under `anchor`. */
export function openGroupPopover(anchor: HTMLElement, props: GroupPopoverProps): Popover {
  const pop = new Popover({ anchor, width: 300 })
  renderGroupPanel(pop.contentEl, props)
  pop.open()
  return pop
}
