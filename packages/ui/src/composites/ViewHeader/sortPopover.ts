import { setIcon, setTooltip } from '#platform'
import { Popover } from '#primitives/Popover'
import { type SortDir, type SortKey, type SortRule, MAX_SORT_RULES, t } from '@dotpm/core'

export interface SortField {
  id: SortKey
  label: string
  /** The first and last entries of the list a status or priority sorts by. */
  ends?: [string, string]
}

export interface SortPopoverProps {
  fields: SortField[]
  /** Edited in place. Empty keeps the order the tasks are stored in. */
  sort: SortRule[]
  onChange: () => void
  /** Puts back the sort of the active view, or the default one. */
  onReset: () => void
}

/**
 * Direction words that fit what the field holds, so "Earliest first" rather than
 * "Ascending". A status or priority names the end of its list that comes first.
 */
export function sortDirLabel(field: SortField, dir: SortDir): string {
  const asc = dir === 'asc'
  switch (field.id) {
    case 'title':
    case 'assignees':
      return asc ? t('sort.az') : t('sort.za')
    case 'due':
      return asc ? t('sort.earliest') : t('sort.latest')
    case 'progress':
      return asc ? t('sort.lowest') : t('sort.highest')
    case 'status':
    case 'priority': {
      const end = field.ends?.[asc ? 0 : 1]
      return end ? t('sort.firstNamed', { label: end }) : asc ? t('sort.az') : t('sort.za')
    }
  }
}

/**
 * One row per sort key: a grip to drag it into another rank, the field, the direction,
 * and a remove button. Rows below the first break ties left by the ones above.
 */
export function openSortPopover(anchor: HTMLElement, props: SortPopoverProps): Popover {
  const pop = new Popover({ anchor, width: 340 })
  const body = pop.contentEl.createDiv('pm-sort-pop')
  const { sort } = props
  let dragFrom: number | null = null

  const changed = (): void => {
    render()
    props.onChange()
  }

  const render = (): void => {
    body.empty()
    const head = body.createDiv('pm-sort-pop-head')
    head.createSpan({ cls: 'pm-pop-heading', text: t('header.sortBy') })
    const reset = head.createEl('button', { cls: 'pm-sort-pop-reset', text: t('header.resetSort') })
    reset.addEventListener('click', () => {
      props.onReset()
      render()
    })

    if (!sort.length) body.createDiv({ cls: 'pm-pop-empty', text: t('header.noSort') })

    sort.forEach((rule, index) => {
      const row = body.createDiv({ cls: 'pm-sort-row', attr: { draggable: 'true' } })
      const grip = row.createSpan('pm-sort-grip')
      setIcon(grip, 'grip-vertical')
      row.createSpan({ cls: 'pm-sort-rank', text: String(index + 1) })

      const field = row.createEl('select', { cls: 'dropdown pm-sort-field' })
      for (const option of props.fields) {
        if (option.id !== rule.key && sort.some((other) => other.key === option.id)) continue
        field.createEl('option', { value: option.id, text: option.label }).selected = option.id === rule.key
      }
      field.addEventListener('change', () => {
        sort[index] = { key: field.value as SortKey, dir: rule.dir }
        changed()
      })

      const dir = row.createEl('select', { cls: 'dropdown pm-sort-dir' })
      const current = props.fields.find((option) => option.id === rule.key) ?? { id: rule.key, label: rule.key }
      for (const value of ['asc', 'desc'] as const) {
        dir.createEl('option', { value, text: sortDirLabel(current, value) }).selected = value === rule.dir
      }
      dir.addEventListener('change', () => {
        sort[index] = { key: rule.key, dir: dir.value === 'desc' ? 'desc' : 'asc' }
        changed()
      })

      const remove = row.createEl('button', {
        cls: 'clickable-icon pm-sort-remove',
        attr: { 'aria-label': t('header.removeSortKey') }
      })
      setIcon(remove, 'x')
      setTooltip(remove, t('header.removeSortKey'))
      remove.addEventListener('click', () => {
        sort.splice(index, 1)
        changed()
      })

      row.addEventListener('dragstart', () => {
        dragFrom = index
        row.addClass('is-dragging')
      })
      row.addEventListener('dragend', () => row.removeClass('is-dragging'))
      row.addEventListener('dragover', (e) => e.preventDefault())
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        if (dragFrom === null || dragFrom === index) return
        const [moved] = sort.splice(dragFrom, 1)
        sort.splice(index, 0, moved)
        dragFrom = null
        changed()
      })
    })

    const foot = body.createDiv('pm-sort-pop-foot')
    const unused = props.fields.find((option) => !sort.some((rule) => rule.key === option.id))
    const add = foot.createEl('button', { cls: 'pm-pop-item pm-pop-item--accent pm-sort-add' })
    setIcon(add.createSpan('pm-sort-add-icon'), 'plus')
    add.createSpan({ cls: 'pm-pop-item-label', text: t('header.addSortKey') })
    add.disabled = !unused || sort.length >= MAX_SORT_RULES
    add.addEventListener('click', () => {
      if (!unused) return
      sort.push({ key: unused.id, dir: 'asc' })
      changed()
    })
    foot.createSpan({
      cls: 'pm-sort-pop-count',
      text: t('header.sortCount', { count: sort.length, max: MAX_SORT_RULES })
    })
  }

  render()
  pop.open()
  return pop
}
