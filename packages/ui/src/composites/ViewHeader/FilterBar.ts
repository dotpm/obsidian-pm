import { activeWindow, createMenu, setIcon } from '#platform'
import { showMenuBelow } from '#dom'
import { FilterChip } from '#primitives/FilterChip'
import {
  type DueDateFilter,
  type FilterState,
  type PriorityConfig,
  type PriorityIconSet,
  type StatusConfig,
  displayName,
  priorityIcon,
  t
} from '@dotpm/core'
import { showFilterMenu, type FilterOption } from '../../FilterDropdown'

export interface FilterBarProps {
  filter: FilterState
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  priorityIcons: PriorityIconSet
  /** Everyone assigned in scope, as stored. */
  assignees: string[]
  tags: string[]
  summary: string
  onChange: () => void
  onClose: () => void
}

type ListFacet = 'statuses' | 'priorities' | 'assignees' | 'tags'

interface FacetDef {
  key: ListFacet
  icon: string
  label: string
  options: FilterOption[]
}

const DUE_OPTIONS: DueDateFilter[] = ['overdue', 'this-week', 'this-month', 'no-date']

const dueLabel = (due: DueDateFilter): string =>
  ({
    any: t('filter.dueDate'),
    overdue: t('filter.overdue'),
    'this-week': t('filter.thisWeek'),
    'this-month': t('filter.thisMonth'),
    'no-date': t('filter.noDate')
  })[due]

/** Runs once the menu that was clicked has closed, so a second menu can open in its place. */
function afterMenu(open: () => void): void {
  activeWindow().setTimeout(open, 0)
}

/**
 * The applied filters as one chip per field, a "+ Filter" picker, the shown count and
 * Clear all. Fields combine with AND, the values inside one chip with OR. It edits
 * `filter` in place and reports each change through `onChange`.
 */
export class FilterBar {
  el: HTMLElement
  private summaryEl!: HTMLElement
  private addBtn!: HTMLButtonElement

  constructor(
    parentEl: HTMLElement,
    private props: FilterBarProps
  ) {
    this.el = parentEl.createDiv('pm-filter-bar')
    this.render()
  }

  setSummary(text: string): void {
    this.props.summary = text
    this.summaryEl.setText(text)
  }

  /** Opens the field picker, as the header's Filter button does. */
  openPicker(): void {
    this.showFieldMenu(this.addBtn)
  }

  private facets(): FacetDef[] {
    const { statuses, priorities, priorityIcons, assignees, tags } = this.props
    const facets: FacetDef[] = [
      {
        key: 'statuses',
        icon: 'circle-dot',
        label: t('taskForm.status'),
        options: statuses.map((s) => ({ id: s.id, label: s.label, icon: s.icon }))
      },
      {
        key: 'priorities',
        icon: 'flag',
        label: t('taskForm.priority'),
        options: priorities.map((p) => ({
          id: p.id,
          label: p.label,
          icon: p.icon,
          namedIcon: priorityIcon(priorities, p.id, priorityIcons)
        }))
      }
    ]
    if (assignees.length) {
      facets.push({
        key: 'assignees',
        icon: 'user',
        label: t('filter.assignee'),
        options: assignees.map((a) => ({ id: a, label: displayName(a) }))
      })
    }
    if (tags.length) {
      facets.push({
        key: 'tags',
        icon: 'tag',
        label: t('filter.tag'),
        options: tags.map((tag) => ({ id: tag, label: tag }))
      })
    }
    return facets
  }

  private changed(): void {
    this.render()
    this.props.onChange()
  }

  private render(): void {
    this.el.empty()
    const { filter } = this.props
    const chips = this.el.createDiv('pm-filter-bar-chips')

    for (const facet of this.facets()) {
      const selected = filter[facet.key]
      if (!selected.length) continue
      const labels = selected.map((id) => facet.options.find((o) => o.id === id)?.label ?? id)
      new FilterChip(chips)
        .setField(facet.label, facet.icon)
        .setOperator(selected.length > 1 ? t('filter.isAnyOf') : t('filter.is'))
        .setValue(labels.join(', '))
        .setRemoveLabel(t('filter.remove', { label: facet.label }))
        .onEdit((anchor) => showFilterMenu(anchor, selected, facet.options, () => this.changed()))
        .onRemove(() => {
          filter[facet.key] = []
          this.changed()
        })
    }

    if (filter.dueDateFilter !== 'any') {
      new FilterChip(chips)
        .setField(t('filter.dueDate'), 'calendar')
        .setOperator(t('filter.is'))
        .setValue(dueLabel(filter.dueDateFilter))
        .setRemoveLabel(t('filter.remove', { label: t('filter.dueDate') }))
        .onEdit((anchor) => this.showDueMenu(anchor))
        .onRemove(() => {
          filter.dueDateFilter = 'any'
          this.changed()
        })
    }

    if (filter.showArchived) {
      new FilterChip(chips)
        .setField(t('common.archived'), 'archive')
        .setOperator('')
        .setValue(t('filter.included'))
        .setRemoveLabel(t('filter.remove', { label: t('common.archived') }))
        .onRemove(() => {
          filter.showArchived = false
          this.changed()
        })
    }

    this.addBtn = chips.createEl('button', { cls: 'pm-filter-bar-add' })
    setIcon(this.addBtn.createSpan('pm-filter-bar-add-icon'), 'plus')
    this.addBtn.createSpan({ text: t('header.filter') })
    this.addBtn.addEventListener('click', () => this.showFieldMenu(this.addBtn))

    const end = this.el.createDiv('pm-filter-bar-end')
    this.summaryEl = end.createSpan({ cls: 'pm-filter-bar-summary', text: this.props.summary })
    if (chips.childElementCount > 1) {
      const clear = end.createEl('button', { cls: 'pm-filter-bar-clear', text: t('filter.clearAll') })
      clear.addEventListener('click', () => {
        for (const facet of ['statuses', 'priorities', 'assignees', 'tags'] as const) filter[facet] = []
        filter.dueDateFilter = 'any'
        filter.showArchived = false
        this.changed()
      })
    }
    const close = end.createEl('button', {
      cls: 'pm-filter-bar-close clickable-icon',
      attr: { 'aria-label': t('filter.hideBar') }
    })
    setIcon(close, 'x')
    close.addEventListener('click', () => this.props.onClose())
  }

  private showFieldMenu(anchor: HTMLElement): void {
    const { filter } = this.props
    const menu = createMenu()
    for (const facet of this.facets()) {
      menu.addItem((item) =>
        item
          .setTitle(facet.label)
          .setIcon(facet.icon)
          .setChecked(filter[facet.key].length > 0)
          .onClick(() =>
            afterMenu(() => showFilterMenu(anchor, filter[facet.key], facet.options, () => this.changed()))
          )
      )
    }
    menu.addItem((item) =>
      item
        .setTitle(t('filter.dueDate'))
        .setIcon('calendar')
        .setChecked(filter.dueDateFilter !== 'any')
        .onClick(() => afterMenu(() => this.showDueMenu(anchor)))
    )
    menu.addItem((item) =>
      item
        .setTitle(t('filter.includeArchived'))
        .setIcon('archive')
        .setChecked(filter.showArchived)
        .onClick(() => {
          filter.showArchived = !filter.showArchived
          this.changed()
        })
    )
    showMenuBelow(menu, anchor)
  }

  private showDueMenu(anchor: HTMLElement): void {
    const { filter } = this.props
    const menu = createMenu()
    for (const due of DUE_OPTIONS) {
      menu.addItem((item) =>
        item
          .setTitle(dueLabel(due))
          .setChecked(filter.dueDateFilter === due)
          .onClick(() => {
            filter.dueDateFilter = filter.dueDateFilter === due ? 'any' : due
            this.changed()
          })
      )
    }
    showMenuBelow(menu, anchor)
  }
}
