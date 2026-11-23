import { ChipButton } from '#primitives/ChipButton'
import { IconButton } from '#primitives/IconButton'
import { Popover } from '#primitives/Popover'
import { activeDocument } from '#platform'
import {
  type DateBucket,
  type FilterCondition,
  type FilterContext,
  type FilterOp,
  type FilterState,
  type PriorityConfig,
  type PriorityIconSet,
  type Task,
  BUILTIN_FILTER_FIELDS,
  OPS_BY_KIND,
  customFilterField,
  displayName,
  filterFieldIcon,
  filterFieldLabel,
  filterKind,
  filterValue,
  formatDate,
  isConditionComplete,
  priorityIcon,
  t,
  valueKey
} from '@dotpm/core'
import { renderPopHead, renderPopSearch } from '../popoverParts'
import { renderOptionRow } from '../properties/optionList'

/** Everything the filter bar and its popover read to name fields and offer values. */
export interface FilterSetup {
  /** Edited in place. */
  filter: FilterState
  /** Every task in scope, subtasks included. */
  tasks: Task[]
  ctx: FilterContext
  priorities: PriorityConfig[]
  priorityIcons: PriorityIconSet
  /** The projects in view, when there are several; the project field is offered only then. */
  projects: { id: string; title: string; color?: string }[]
}

interface ValueOption {
  id: string
  label: string
  icon?: string
  color?: string
}

const DATE_BUCKETS: DateBucket[] = ['overdue', 'today', 'this-week', 'this-month']

const bucketLabel = (bucket: DateBucket): string =>
  ({
    overdue: t('filter.overdue'),
    today: t('filter.today'),
    'this-week': t('filter.thisWeek'),
    'this-month': t('filter.thisMonth')
  })[bucket]

/**
 * The fields the picker offers: the built-in ones, then every custom field not opted out.
 * Project isn't offered, since the project switcher decides which projects are in view; a
 * project condition a saved view already holds still shows and matches.
 */
export function offeredFields(setup: FilterSetup): string[] {
  const builtins = BUILTIN_FILTER_FIELDS.filter((field) => field !== 'project')
  const custom = setup.ctx.customFields.filter((cf) => cf.filterable !== false).map((cf) => customFilterField(cf.id))
  return [...builtins, ...custom]
}

export function valueOptions(setup: FilterSetup, field: string): ValueOption[] {
  const { ctx } = setup
  switch (field) {
    case 'status':
      return ctx.statuses.map((s) => ({ id: s.id, label: s.label, icon: s.icon, color: s.color }))
    case 'priority':
      return setup.priorities.map((p) => ({
        id: p.id,
        label: p.label,
        icon: priorityIcon(setup.priorities, p.id, setup.priorityIcons),
        color: p.color
      }))
    case 'type':
      return [
        { id: 'task', label: t('taskForm.typeTask') },
        { id: 'subtask', label: t('taskForm.typeSubtask') },
        { id: 'milestone', label: t('taskForm.typeMilestone') }
      ]
    case 'project':
      return setup.projects.map((p) => ({ id: p.id, label: p.title, color: p.color }))
  }
  const seen = new Map<string, ValueOption>()
  const custom = ctx.customFields.find((cf) => customFilterField(cf.id) === field)
  for (const option of custom?.options ?? []) seen.set(option, { id: option, label: option })
  const isPerson = field === 'assignee' || custom?.type === 'person'
  for (const task of setup.tasks) {
    const value = filterValue(task, field, ctx)
    for (const v of Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []) {
      const key = valueKey(field, v, ctx)
      if (!seen.has(key)) seen.set(key, { id: v, label: isPerson ? displayName(v) : v })
    }
  }
  const options = [...seen.values()]
  return custom?.options ? options : options.sort((a, b) => a.label.localeCompare(b.label))
}

function opLabel(op: FilterOp, count: number): string {
  switch (op) {
    case 'any':
      return count > 1 ? t('filter.isAnyOf') : t('filter.is')
    case 'none':
      return count > 1 ? t('filter.op.noneOf') : t('filter.op.none')
    case 'all':
      return t('filter.op.all')
    case 'empty':
      return t('filter.op.empty')
    case 'not-empty':
      return t('filter.op.notEmpty')
    case 'contains':
      return t('filter.op.contains')
    case 'not-contains':
      return t('filter.op.notContains')
    case 'eq':
      return t('filter.op.eq')
    case 'ne':
      return t('filter.op.ne')
    case 'gte':
      return t('filter.op.gte')
    case 'lte':
      return t('filter.op.lte')
    case 'between':
      return t('filter.op.between')
    case 'checked':
      return t('filter.op.checked')
    case 'unchecked':
      return t('filter.op.unchecked')
    case 'bucket':
      return t('filter.is')
  }
}

function rangeText(from: string, to: string): string {
  if (from && to) return t('filter.range', { from, to })
  return from ? t('filter.from', { date: from }) : t('filter.until', { date: to })
}

/** The operator and value words a chip shows for a condition. */
export function describeCondition(setup: FilterSetup, condition: FilterCondition): { op: string; value: string } {
  const { value } = condition
  const values = Array.isArray(value) ? value.map((v) => (v === null ? '' : String(v))) : []
  const op = opLabel(condition.op, values.length)
  switch (condition.op) {
    case 'any':
    case 'none':
    case 'all': {
      const options = valueOptions(setup, condition.field)
      const labels = values.map(
        (id) =>
          options.find((o) => valueKey(condition.field, o.id, setup.ctx) === valueKey(condition.field, id, setup.ctx))
            ?.label ?? id
      )
      return { op, value: labels.join(', ') }
    }
    case 'contains':
    case 'not-contains':
      return { op, value: typeof value === 'string' ? value : '' }
    case 'bucket':
      return { op, value: typeof value === 'string' ? bucketLabel(value as DateBucket) : '' }
    case 'between': {
      const isDate = filterKind(condition.field, setup.ctx.customFields) === 'date'
      const [from = '', to = ''] = values.map((v) => (isDate && v ? formatDate(v) : v))
      return { op, value: rangeText(from, to) }
    }
    case 'eq':
    case 'ne':
    case 'gte':
    case 'lte':
      return { op, value: values[0] ?? '' }
    default:
      return { op, value: '' }
  }
}

const PRIMARY = 'data-pm-primary'

/** Marks what a screen of the filter panel hands focus to when it opens. */
function markPrimary(el: Element | null | undefined): void {
  el?.setAttribute(PRIMARY, '')
}

function focusPrimary(root: HTMLElement): void {
  root.querySelector<HTMLElement>(`[${PRIMARY}]`)?.focus()
}

/** Rebuilds a list's rows without dropping the keyboard focus that sat on one of them. */
function keepRowFocus(list: HTMLElement, rebuild: () => void): void {
  const rows = (): HTMLElement[] => Array.from(list.querySelectorAll<HTMLElement>('button.pm-pop-item'))
  const at = rows().indexOf(activeDocument().activeElement as HTMLElement)
  rebuild()
  if (at === -1) return
  const next = rows()
  next[Math.min(at, next.length - 1)]?.focus()
}

/** Controls that sit side by side count as one stop for Up and Down, and Left and Right move along them. */
const SIDE_BY_SIDE = '.pm-filter-pop-ops, .pm-filter-pop-range, .pm-filter-list-row'

function navStops(body: HTMLElement): HTMLElement[][] {
  const stops = new Map<Element, HTMLElement[]>()
  // Icon buttons are not <button>s, but they take focus all the same.
  for (const el of Array.from(body.querySelectorAll<HTMLElement>('button, input, .pm-icon-btn'))) {
    if (el.hasAttribute('disabled')) continue
    const key = el.closest(SIDE_BY_SIDE) ?? el
    const group = stops.get(key)
    if (group) group.push(el)
    else stops.set(key, [el])
  }
  return Array.from(stops.values())
}

/**
 * Arrow keys walk the panel, so it works without Tab: Up and Down go from the back button
 * through the operators and the search field to the rows, Left and Right move along the
 * operators or between a row and its remove button, Home and End jump to the first and
 * last row. Number and date fields keep the arrows for their own value; Tab leaves them.
 */
function enableFilterNavigation(body: HTMLElement): void {
  body.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = event.target as HTMLElement
    const isInput = target.tagName === 'INPUT'
    if (isInput && (target as HTMLInputElement).type !== 'text') return
    const stops = navStops(body)
    const at = stops.findIndex((group) => group.includes(target))
    if (at === -1) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const next = stops[at + (event.key === 'ArrowDown' ? 1 : -1)]
        // Entering the operators lands on the one in use rather than the first.
        ;(next?.find((el) => el.hasClass('pm-chip-btn--active')) ?? next?.[0])?.focus()
        return
      }
      case 'ArrowRight':
      case 'ArrowLeft': {
        if (isInput) return
        const group = stops[at]
        const next = group[group.indexOf(target) + (event.key === 'ArrowRight' ? 1 : -1)]
        if (!next) return
        event.preventDefault()
        next.focus()
        return
      }
      case 'Home':
      case 'End': {
        if (isInput) return
        const rows = Array.from(body.querySelectorAll<HTMLElement>('.pm-pop-list button.pm-pop-item'))
        if (!rows.length) return
        event.preventDefault()
        rows[event.key === 'Home' ? 0 : rows.length - 1].focus()
      }
    }
  })
}

function countFor(setup: FilterSetup, field: string, id: string): number {
  const key = valueKey(field, id, setup.ctx)
  let count = 0
  for (const task of setup.tasks) {
    if (task.archived && !setup.filter.showArchived) continue
    const value = filterValue(task, field, setup.ctx)
    const held = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
    if (held.some((v) => valueKey(field, v, setup.ctx) === key)) count++
  }
  return count
}

/**
 * The field picker, which drills into one field's operator and value, or straight into
 * the condition at `start`. With `start` set to `'list'` it opens on the applied
 * conditions instead, for when the filter bar has no room for its chips; with none applied
 * yet it opens on the picker, which leads back to that list. Every edit
 * applies at once: a condition joins the filter as soon as it narrows anything and leaves
 * it when its values are cleared. `showClear: false` leaves Clear all out of the list, for
 * a host that has its own.
 */
export function renderFilterPanel(
  parent: HTMLElement,
  setup: FilterSetup,
  onChange: () => void,
  start?: number | 'list',
  { showClear = true }: { showClear?: boolean } = {}
): void {
  const body = parent.createDiv('pm-filter-pop')
  const { filter } = setup
  enableFilterNavigation(body)
  // Each screen replaces the last in place, so it hands focus on itself; the first one
  // is left to whoever opened the panel, who knows whether it is on the page yet.
  let ready = false
  const settle = (): void => {
    if (ready) focusPrimary(body)
  }
  /** The row to keep focus on when the list is rebuilt after a removal. */
  let rowAfterRemove: number | null = null

  const showList = (): void => {
    body.empty()
    const list = body.createDiv('pm-pop-list')
    const remove = (row: HTMLElement, label: string, onRemove: () => void): void => {
      new IconButton(row)
        .setIcon('x')
        .setTooltip(t('filter.remove', { label }))
        .onClick(() => {
          rowAfterRemove = list.findAll('.pm-filter-list-row').indexOf(row)
          onRemove()
          onChange()
          showList()
        })
        .el.addClass('pm-filter-list-remove')
    }
    filter.conditions.forEach((condition, index) => {
      const label = filterFieldLabel(condition.field, setup.ctx.customFields)
      const { op, value } = describeCondition(setup, condition)
      const row = list.createDiv('pm-filter-list-row')
      renderOptionRow(row, {
        label,
        icon: filterFieldIcon(condition.field, setup.ctx.customFields),
        note: `${op} ${value}`.trim(),
        onPick: () => showEditor(index, condition.field, showList)
      })
      remove(row, label, () => filter.conditions.splice(index, 1))
    })
    if (filter.showArchived) {
      const row = list.createDiv('pm-filter-list-row')
      renderOptionRow(row, {
        label: t('common.archived'),
        icon: 'archive',
        note: t('filter.included'),
        onPick: () => showFields(showList)
      })
      remove(row, t('common.archived'), () => (filter.showArchived = false))
    }
    renderOptionRow(list, {
      label: t('filter.addFilter'),
      icon: 'plus',
      accent: true,
      onPick: () => showFields(showList)
    })
    if (showClear && (filter.conditions.length || filter.showArchived)) {
      const clear = body.createDiv('pm-filter-list-foot pm-pop-section')
      renderOptionRow(clear, {
        label: t('filter.clearAll'),
        icon: 'x',
        onPick: () => {
          filter.conditions = []
          filter.showArchived = false
          onChange()
          showList()
        }
      })
    }
    const rows = list.findAll('.pm-filter-list-row button.pm-pop-item')
    const kept = rowAfterRemove === null ? undefined : rows[Math.min(rowAfterRemove, rows.length - 1)]
    rowAfterRemove = null
    markPrimary(kept ?? list.find('button.pm-pop-item'))
    settle()
  }

  const showFields = (back?: () => void): void => {
    body.empty()
    if (back) {
      renderPopHead(body, {
        title: t('filter.addFilter'),
        variant: 'title',
        back: { label: t('filter.back'), onClick: back }
      })
    }
    const search = renderPopSearch(body, t('filter.filterBy'), () => renderList())
    const list = body.createDiv('pm-pop-list')
    const fields = offeredFields(setup)
    const renderList = (): void => {
      list.empty()
      const q = search.value.trim().toLowerCase()
      const shown = fields.filter(
        (field) => !q || filterFieldLabel(field, setup.ctx.customFields).toLowerCase().includes(q)
      )
      let headed = false
      for (const field of shown) {
        if (field.startsWith('cf:') && !headed) {
          list.createDiv({ cls: 'pm-pop-heading', text: t('filter.customFields') })
          headed = true
        }
        const index = filter.conditions.findIndex((c) => c.field === field)
        renderOptionRow(list, {
          label: filterFieldLabel(field, setup.ctx.customFields),
          icon: filterFieldIcon(field, setup.ctx.customFields),
          selected: index >= 0,
          onPick: () => showEditor(index >= 0 ? index : null, field, () => showFields(back))
        })
      }
      if (!q) {
        renderOptionRow(list, {
          label: t('filter.includeArchived'),
          icon: 'archive',
          selected: filter.showArchived,
          onPick: () => {
            filter.showArchived = !filter.showArchived
            onChange()
            keepRowFocus(list, renderList)
          }
        })
      }
    }
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      list.querySelector<HTMLButtonElement>('button')?.click()
    })
    renderList()
    markPrimary(search)
    settle()
  }

  const showEditor = (index: number | null, field: string, back?: () => void): void => {
    const kind = filterKind(field, setup.ctx.customFields)
    if (!kind) return
    let at = index
    const draft: FilterCondition =
      at !== null ? structuredClone(filter.conditions[at]) : { field, op: OPS_BY_KIND[kind][0] }

    const commit = (): void => {
      const complete = isConditionComplete(draft)
      if (complete && at === null) {
        filter.conditions.push(structuredClone(draft))
        at = filter.conditions.length - 1
      } else if (complete && at !== null) {
        filter.conditions[at] = structuredClone(draft)
      } else if (!complete && at !== null) {
        filter.conditions.splice(at, 1)
        at = null
      } else {
        return
      }
      onChange()
    }

    body.empty()
    renderPopHead(body, {
      title: filterFieldLabel(field, setup.ctx.customFields),
      variant: 'title',
      back: back && { label: t('filter.back'), onClick: back }
    })

    const ops = body.createDiv('pm-filter-pop-ops')
    const valueEl = body.createDiv('pm-filter-pop-value')
    const renderOps = (): void => {
      ops.empty()
      for (const op of OPS_BY_KIND[kind]) {
        new ChipButton(ops)
          .setVariant('outline')
          .setLabel(opLabel(op, 2))
          .setActive(draft.op === op)
          .onClick(() => {
            const listOps: FilterOp[] = ['any', 'none', 'all']
            const keepsValue = listOps.includes(draft.op) && listOps.includes(op)
            draft.op = op
            if (!keepsValue) delete draft.value
            commit()
            renderOps()
            renderValue()
            // The chip that was pressed is gone with the rebuild; keep the arrows on the operators.
            ops.find('.pm-chip-btn--active')?.focus()
          })
          .el.addClass('pm-filter-pop-op')
      }
    }

    const renderValue = (): void => {
      valueEl.empty()
      switch (draft.op) {
        case 'any':
        case 'none':
        case 'all':
          markPrimary(renderChecklist(valueEl, setup, field, draft, commit))
          return
        case 'contains':
        case 'not-contains': {
          const input = valueEl.createEl('input', {
            cls: 'pm-pop-field',
            attr: { placeholder: t('filter.valuePlaceholder'), spellcheck: 'false' }
          })
          input.value = typeof draft.value === 'string' ? draft.value : ''
          input.addEventListener('input', () => {
            draft.value = input.value
            commit()
          })
          markPrimary(input)
          return
        }
        case 'eq':
        case 'ne':
        case 'gte':
        case 'lte':
        case 'between': {
          const isDate = kind === 'date'
          const count = draft.op === 'between' ? 2 : 1
          const current = Array.isArray(draft.value) ? draft.value : []
          const row = valueEl.createDiv('pm-filter-pop-range')
          const inputs: HTMLInputElement[] = []
          for (let i = 0; i < count; i++) {
            const input = row.createEl('input', {
              type: isDate ? 'date' : 'number',
              cls: 'pm-pop-field',
              attr: { placeholder: t('filter.valuePlaceholder') }
            })
            input.value = current[i] === undefined || current[i] === null ? '' : String(current[i])
            inputs.push(input)
            input.addEventListener('change', () => {
              const numbers = inputs.map((el) => (el.value === '' ? null : Number(el.value)))
              draft.value = isDate ? inputs.map((el) => el.value) : numbers.some((n) => n !== null) ? numbers : []
              commit()
            })
          }
          markPrimary(inputs[0])
          return
        }
        case 'bucket': {
          const list = valueEl.createDiv('pm-pop-list')
          for (const bucket of DATE_BUCKETS) {
            renderOptionRow(list, {
              label: bucketLabel(bucket),
              selected: draft.value === bucket,
              onPick: () => {
                draft.value = draft.value === bucket ? undefined : bucket
                commit()
                keepRowFocus(valueEl, renderValue)
              }
            })
          }
          markPrimary(list.find('.pm-pop-item--selected') ?? list.find('button.pm-pop-item'))
        }
      }
    }

    renderOps()
    renderValue()
    // A field with nothing to choose from still has its operators to land on.
    if (!body.querySelector(`[${PRIMARY}]`)) markPrimary(ops.find('.pm-chip-btn--active'))
    if (at === null) commit()
    settle()
  }

  if (start === 'list') {
    if (filter.conditions.length || filter.showArchived) showList()
    else showFields(showList)
  } else if (start !== undefined && filter.conditions[start]) {
    showEditor(start, filter.conditions[start].field)
  } else {
    showFields()
  }
  ready = true
}

/**
 * The filter panel in a popover under `anchor`. Focus starts on what the first screen
 * leads with once it is on the page: the search field, or the first option to pick.
 */
export function openFilterPopover(
  anchor: HTMLElement,
  setup: FilterSetup,
  onChange: () => void,
  start?: number | 'list'
): Popover {
  const pop = Popover.show({ anchor, width: 300 }, (el) => renderFilterPanel(el, setup, onChange, start))
  focusPrimary(pop.contentEl)
  return pop
}

/** Draws the values to tick; returns where focus should start: the search field, else the first value. */
function renderChecklist(
  parent: HTMLElement,
  setup: FilterSetup,
  field: string,
  draft: FilterCondition,
  commit: () => void
): HTMLElement | null {
  const options = valueOptions(setup, field)
  const search = options.length > 8 ? renderPopSearch(parent, t('filter.findValue'), () => render()) : null
  const list = parent.createDiv('pm-pop-list')
  const selected = (): string[] => (Array.isArray(draft.value) ? draft.value.map(String) : [])
  const keyOf = (id: string): string => valueKey(field, id, setup.ctx)
  const render = (): void => {
    list.empty()
    if (!options.length) {
      list.createDiv({ cls: 'pm-pop-empty', text: t('filter.noValues') })
      return
    }
    const q = search?.value.trim().toLowerCase() ?? ''
    for (const option of options.filter((o) => !q || o.label.toLowerCase().includes(q))) {
      const isSelected = selected().some((id) => keyOf(id) === keyOf(option.id))
      renderOptionRow(list, {
        label: option.label,
        icon: option.icon,
        color: option.color,
        note: String(countFor(setup, field, option.id)),
        selected: isSelected,
        onPick: () => {
          const current = selected()
          draft.value = isSelected ? current.filter((id) => keyOf(id) !== keyOf(option.id)) : [...current, option.id]
          commit()
          keepRowFocus(list, render)
        }
      })
    }
  }
  search?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    list.querySelector<HTMLButtonElement>('button.pm-pop-item')?.click()
  })
  render()
  return search ?? list.find('button.pm-pop-item')
}
