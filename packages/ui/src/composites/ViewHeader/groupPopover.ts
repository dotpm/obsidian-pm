import { setIcon, setTooltip } from '#platform'
import { Checkbox } from '#primitives/Checkbox'
import { Popover } from '#primitives/Popover'
import { type GroupState, t } from '@dotpm/core'
import { renderGlyph } from '../properties/optionList'
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
export function openGroupPopover(anchor: HTMLElement, props: GroupPopoverProps): Popover {
  const pop = new Popover({ anchor, width: 300 })
  const body = pop.contentEl.createDiv('pm-group-pop')
  const { group } = props
  let dragFrom: string | null = null

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

    const list = body.createDiv('pm-group-columns')
    for (const column of columns) {
      const isHidden = prefs().hidden?.includes(column.id) ?? false
      const row = list.createDiv({ cls: 'pm-group-column', attr: { draggable: 'true' } })
      row.toggleClass('is-hidden', column.hidden)
      setIcon(row.createSpan('pm-sort-grip'), 'grip-vertical')
      renderGlyph(row.createSpan('pm-group-glyph'), { icon: column.icon, color: column.color })
      row.createSpan({ cls: 'pm-group-column-label', text: column.label })
      const count = row.createSpan({ cls: 'pm-group-count', text: String(column.tasks.length) })
      if (!column.tasks.length) {
        count.setText(t('header.emptyColumn'))
        row.addClass('is-empty')
      }
      const label = isHidden ? t('header.showColumn') : t('header.hideColumn')
      const eye = row.createEl('button', { cls: 'clickable-icon pm-group-eye', attr: { 'aria-label': label } })
      setIcon(eye, isHidden ? 'eye-off' : 'eye')
      setTooltip(eye, label)
      eye.addEventListener('click', () => {
        const hidden = new Set(prefs().hidden ?? [])
        if (isHidden) hidden.delete(column.id)
        else hidden.add(column.id)
        if (hidden.size) prefs().hidden = [...hidden]
        else delete prefs().hidden
        changed()
      })

      row.addEventListener('dragstart', () => {
        dragFrom = column.id
        row.addClass('is-dragging')
      })
      row.addEventListener('dragend', () => row.removeClass('is-dragging'))
      row.addEventListener('dragover', (e) => e.preventDefault())
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        const from = dragFrom
        dragFrom = null
        if (from === null || from === column.id) return
        const ids = columns.map((c) => c.id).filter((id) => id !== from)
        ids.splice(ids.indexOf(column.id), 0, from)
        prefs().order = ids
        changed()
      })
    }
  }

  render()
  pop.open()
  return pop
}
