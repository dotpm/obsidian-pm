import { setIcon, setTooltip } from '#platform'
import { makeReorderable } from '#dom'
import { IconButton } from '#primitives/IconButton'

export interface VisibilityRow {
  id: string
  label: string
  hidden: boolean
  /** Faint text after the label: a task count, a width. */
  detail?: string
  /** Draws the row's leading glyph, when it has one. */
  glyph?: (el: HTMLElement) => void
  /** Shown first, without a grip or an eye. */
  locked?: boolean
  /** Styles the detail as a placeholder, such as "empty" for a column with no tasks. */
  quiet?: boolean
}

export interface VisibilityListProps {
  rows: VisibilityRow[]
  showLabel: string
  hideLabel: string
  lockedLabel?: string
  onToggle: (id: string) => void
  /** The ids of the unlocked rows in their new order. Rows can't be dragged without it. */
  onReorder?: (ids: string[]) => void
  /** Double-clicking a detail edits it as a number; the handler gets what was typed. */
  onDetailEdit?: (id: string, value: number) => void
}

/** Rows of grip, glyph, label, detail and eye: the list the Group and Fields popovers share. */
export function renderVisibilityList(parent: HTMLElement, props: VisibilityListProps): HTMLElement {
  const list = parent.createDiv('pm-vis-list')
  const movable: { el: HTMLElement; id: string }[] = []

  for (const item of props.rows) {
    const draggable = !item.locked && !!props.onReorder
    const row = list.createDiv('pm-vis-row')
    row.dataset.id = item.id
    row.toggleClass('is-hidden', item.hidden)
    row.toggleClass('is-quiet', !!item.quiet)
    const grip = row.createSpan('pm-vis-grip')
    if (draggable) setIcon(grip, 'grip-vertical')
    if (item.glyph) item.glyph(row.createSpan('pm-vis-glyph'))
    row.createSpan({ cls: 'pm-vis-label', text: item.label })
    if (item.detail !== undefined) renderDetail(row, item, props)

    if (item.locked) {
      const lock = row.createSpan('pm-vis-lock')
      setIcon(lock, 'lock')
      if (props.lockedLabel) setTooltip(lock, props.lockedLabel)
    } else {
      const label = item.hidden ? props.showLabel : props.hideLabel
      new IconButton(row)
        .setIcon(item.hidden ? 'eye-off' : 'eye')
        .setTooltip(label)
        .onClick(() => props.onToggle(item.id))
        .el.addClass('pm-vis-eye')
    }
    if (draggable) movable.push({ el: row, id: item.id })
  }
  const { onReorder } = props
  if (onReorder) makeReorderable(movable, onReorder)
  return list
}

function renderDetail(row: HTMLElement, item: VisibilityRow, props: VisibilityListProps): void {
  const detail = row.createSpan({ cls: 'pm-vis-detail', text: item.detail })
  const onEdit = props.onDetailEdit
  if (!onEdit || item.hidden) return
  detail.addClass('is-editable')
  detail.addEventListener('dblclick', () => {
    const input = row.createEl('input', { cls: 'pm-vis-detail-input', type: 'number', value: item.detail ?? '' })
    detail.replaceWith(input)
    input.focus()
    input.select()
    let done = false
    const commit = (save: boolean): void => {
      if (done) return
      done = true
      const value = Number(input.value)
      if (save && Number.isFinite(value) && value > 0) onEdit(item.id, Math.round(value))
      else input.replaceWith(detail)
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit(true)
      if (e.key === 'Escape') {
        e.stopPropagation()
        commit(false)
      }
    })
    input.addEventListener('blur', () => commit(true))
  })
}
