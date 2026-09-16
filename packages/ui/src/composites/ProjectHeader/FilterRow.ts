import { createMenu } from '#platform'
import {
  type Task,
  type FilterState,
  type StatusConfig,
  type PriorityConfig,
  type PriorityIconSet,
  type DueDateFilter,
  collectAllAssignees,
  collectAllTags,
  countActiveFilters,
  displayName,
  priorityIcon,
  t
} from '@dotpm/core'
import { renderFilterDropdown } from '../../FilterDropdown'
import { ChipButton } from '#primitives/ChipButton'

export interface FilterRowProps {
  tasks: Task[]
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  priorityIcons: PriorityIconSet
  filter: FilterState
  personKeyOf: (raw: string) => string
  onFilterChange: () => void
  onClear: () => void
}

const dueLabels = (): Record<DueDateFilter, string> => ({
  any: t('filter.dueDate'),
  overdue: t('filter.overdue'),
  'this-week': t('filter.thisWeek'),
  'this-month': t('filter.thisMonth'),
  'no-date': t('filter.noDate')
})

export class FilterRow {
  el: HTMLElement
  private clearBtn: ChipButton | null = null

  constructor(
    parentEl: HTMLElement,
    private props: FilterRowProps
  ) {
    this.el = parentEl.createDiv('pm-project-header-filter')
    this.render()
  }

  private render(): void {
    this.el.empty()
    const { filter, statuses, priorities, tasks } = this.props

    const notify = () => {
      this.props.onFilterChange()
      this.updateClearButton()
    }

    renderFilterDropdown(
      this.el,
      t('taskForm.status'),
      filter.statuses,
      statuses.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
      (selected) => {
        filter.statuses = selected
        notify()
      }
    )

    renderFilterDropdown(
      this.el,
      t('taskForm.priority'),
      filter.priorities,
      priorities.map((p) => ({
        id: p.id,
        label: p.label,
        icon: p.icon,
        namedIcon: priorityIcon(priorities, p.id, this.props.priorityIcons)
      })),
      (selected) => {
        filter.priorities = selected
        notify()
      }
    )

    const allAssignees = collectAllAssignees(tasks, undefined, this.props.personKeyOf)
    if (allAssignees.length) {
      renderFilterDropdown(
        this.el,
        t('filter.assignee'),
        filter.assignees,
        allAssignees.map((a) => ({ id: a, label: displayName(a) })),
        (selected) => {
          filter.assignees = selected
          notify()
        }
      )
    }

    const allTags = collectAllTags(tasks)
    if (allTags.length) {
      renderFilterDropdown(
        this.el,
        t('filter.tag'),
        filter.tags,
        allTags.map((tag) => ({ id: tag, label: tag })),
        (selected) => {
          filter.tags = selected
          notify()
        }
      )
    }

    this.renderDueDateButton(notify)
    this.renderArchivedButton(notify)
    this.renderClearButton()
  }

  private renderDueDateButton(notify: () => void): void {
    const { filter } = this.props
    const btn = new ChipButton(this.el)
    const labels = dueLabels()
    const updateLabel = () => {
      const current = filter.dueDateFilter
      const label = current !== 'any' ? t('filter.dueWith', { label: labels[current] }) : labels.any
      btn.setLabel(label).setActive(current !== 'any')
    }
    updateLabel()
    btn.onClick((e) => {
      const menu = createMenu()
      const opts: DueDateFilter[] = ['any', 'overdue', 'this-week', 'this-month', 'no-date']
      for (const opt of opts) {
        menu.addItem((item) =>
          item
            .setTitle(labels[opt])
            .setChecked(filter.dueDateFilter === opt)
            .onClick(() => {
              filter.dueDateFilter = opt
              updateLabel()
              notify()
            })
        )
      }
      menu.showAtMouseEvent(e)
    })
  }

  private renderArchivedButton(notify: () => void): void {
    const { filter } = this.props
    const btn = new ChipButton(this.el).setLabel(t('common.archived')).setActive(filter.showArchived)
    btn.onClick(() => {
      filter.showArchived = !filter.showArchived
      btn.setActive(filter.showArchived)
      notify()
    })
  }

  private renderClearButton(): void {
    const count = countActiveFilters(this.props.filter)
    if (count === 0) {
      this.clearBtn = null
      return
    }
    this.clearBtn = new ChipButton(this.el).setLabel(t('filter.clear', { count })).onClick(() => {
      this.props.onClear()
    })
  }

  refreshClearButton(): void {
    this.updateClearButton()
  }

  private updateClearButton(): void {
    if (this.clearBtn) {
      this.clearBtn.el.remove()
      this.clearBtn = null
    }
    this.renderClearButton()
  }
}
