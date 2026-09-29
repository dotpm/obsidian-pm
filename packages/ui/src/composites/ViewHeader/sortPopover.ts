import { setIcon } from '#platform'
import { makeReorderable } from '#dom'
import { ChipButton } from '#primitives/ChipButton'
import { IconButton } from '#primitives/IconButton'
import { Popover } from '#primitives/Popover'
import { type SortDir, type SortKey, MAX_SORT_RULES, t } from '@dotpm/core'
import { renderOptionRow } from '../properties/optionList'

/** A task sort key or a project list one (`ProjectSortKey`, a subset by name). */
export interface SortField<K extends string = SortKey> {
  id: K
  label: string
  /** The first and last entries of the list a status or priority sorts by. */
  ends?: [string, string]
}

export interface SortPopoverProps<K extends string = SortKey> {
  fields: SortField<K>[]
  /** Edited in place. Empty keeps the stored order. */
  sort: { key: K; dir: SortDir }[]
  onChange: () => void
  /** Puts back the sort of the active view, or the default one. */
  onReset: () => void
}

/**
 * Direction words that fit what the field holds, so "Earliest first" rather than
 * "Ascending". A status or priority names the end of its list that comes first.
 */
export function sortDirLabel<K extends string>(field: SortField<K>, dir: SortDir): string {
  const asc = dir === 'asc'
  switch (field.id) {
    case 'due':
      return asc ? t('sort.earliest') : t('sort.latest')
    case 'progress':
      return asc ? t('sort.lowest') : t('sort.highest')
    case 'status':
    case 'priority': {
      const end = field.ends?.[asc ? 0 : 1]
      return end ? t('sort.firstNamed', { label: end }) : asc ? t('sort.az') : t('sort.za')
    }
    default:
      return asc ? t('sort.az') : t('sort.za')
  }
}

/**
 * One row per sort key: a grip to drag it into another rank, the field, the direction,
 * and a remove button. Rows below the first break ties left by the ones above.
 */
export function renderSortPanel<K extends string>(parent: HTMLElement, props: SortPopoverProps<K>): void {
  const body = parent.createDiv('pm-sort-pop')
  const { sort } = props

  const changed = (): void => {
    render()
    props.onChange()
  }

  const render = (): void => {
    body.empty()
    const head = body.createDiv('pm-sort-pop-head')
    head.createSpan({ cls: 'pm-pop-heading', text: t('header.sortBy') })
    new ChipButton(head)
      .setVariant('flat')
      .setLabel(t('header.resetSort'))
      .onClick(() => {
        props.onReset()
        render()
      })
      .el.addClass('pm-sort-pop-reset')

    if (!sort.length) body.createDiv({ cls: 'pm-pop-empty', text: t('header.noSort') })

    const rows: { el: HTMLElement; id: K }[] = []
    sort.forEach((rule, index) => {
      const row = body.createDiv('pm-sort-row')
      rows.push({ el: row, id: rule.key })
      const grip = row.createSpan('pm-sort-grip')
      setIcon(grip, 'grip-vertical')
      row.createSpan({ cls: 'pm-sort-rank', text: String(index + 1) })

      const field = row.createEl('select', { cls: 'dropdown pm-sort-field' })
      for (const option of props.fields) {
        if (option.id !== rule.key && sort.some((other) => other.key === option.id)) continue
        field.createEl('option', { value: option.id, text: option.label }).selected = option.id === rule.key
      }
      field.addEventListener('change', () => {
        const picked = props.fields.find((option) => option.id === field.value)
        if (picked) sort[index] = { key: picked.id, dir: rule.dir }
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

      new IconButton(row)
        .setIcon('x')
        .setTooltip(t('header.removeSortKey'))
        .onClick(() => {
          sort.splice(index, 1)
          changed()
        })
        .el.addClass('pm-sort-remove')
    })
    makeReorderable(rows, (keys) => {
      const byKey = new Map(sort.map((rule) => [rule.key, rule]))
      sort.splice(0, sort.length, ...keys.flatMap((key) => byKey.get(key) ?? []))
      changed()
    })

    const foot = body.createDiv('pm-sort-pop-foot')
    const unused = props.fields.find((option) => !sort.some((rule) => rule.key === option.id))
    const add = renderOptionRow(foot, {
      label: t('header.addSortKey'),
      icon: 'plus',
      accent: true,
      onPick: () => {
        if (!unused) return
        sort.push({ key: unused.id, dir: 'asc' })
        changed()
      }
    })
    add.addClass('pm-sort-add')
    add.disabled = !unused || sort.length >= MAX_SORT_RULES
    foot.createSpan({
      cls: 'pm-sort-pop-count',
      text: t('header.sortCount', { count: sort.length, max: MAX_SORT_RULES })
    })
  }

  render()
}

/** The sort panel in a popover under `anchor`. */
export function openSortPopover<K extends string>(anchor: HTMLElement, props: SortPopoverProps<K>): Popover {
  const pop = new Popover({ anchor, width: 340 })
  renderSortPanel(pop.contentEl, props)
  pop.open()
  return pop
}
