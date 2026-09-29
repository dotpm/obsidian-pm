import { Menu, setIcon } from 'obsidian'
import type PMPlugin from '#main'
import {
  type Task,
  type TaskType,
  type FilterContext,
  type GroupState,
  type SortRule,
  type TaskQuery,
  type ResolvedProjectConfig,
  type ViewFields,
  customFieldOf,
  shownFields,
  valueKey,
  flattenTasks,
  totalLoggedHours,
  matchesQuery,
  dueUrgency,
  getPriorityConfig,
  t,
  tn
} from '@dotpm/core'
import { personKeyer, type ProjectScope } from '#store'
import {
  safeAsync,
  boardCandidates,
  boardColumns,
  boardField,
  cardCustomValues,
  descriptionPreview,
  compareTasks,
  groupValues,
  KanbanColumn,
  type FilterSetup,
  type KanbanCardData,
  renderProjectChip
} from '@dotpm/ui'
import { openTaskModal } from '#ui/ModalFactory'
import { buildTaskContextMenu } from '#ui/TaskContextMenu'
import { linkedRefs } from './linkedRefs'
import type { SubView } from './SubView'

/**
 * `values` with the one of the column a card left swapped for the one it landed in; the
 * column of tasks without a value takes them all away.
 */
function moveValue(values: string[], from: string, to: string, keyOf: (value: string) => string): string[] {
  if (!to) return []
  const next = values.filter((value) => keyOf(value) !== keyOf(from))
  if (!next.some((value) => keyOf(value) === keyOf(to))) next.push(to)
  return next
}

export class KanbanView implements SubView {
  private dragTask: Task | null = null
  private dragFrom: string | null = null
  private setup!: FilterSetup
  /** Resolved once per board render. */
  private config!: ResolvedProjectConfig
  private filterContext!: FilterContext
  /** The card fields, resolved once per board render. */
  private cardFields: string[] = []

  constructor(
    private container: HTMLElement,
    private scope: ProjectScope,
    private plugin: PMPlugin,
    private onRefresh: () => Promise<void>,
    private query: TaskQuery,
    private sort: SortRule[],
    private group: GroupState,
    private fields: ViewFields,
    /** Opens the Group popover from the strip that stands in for hidden columns. */
    private onShowHidden: (anchor: HTMLElement) => void
  ) {}

  render(): void {
    this.renderBoard()
    if (this.cardFields.includes('description')) {
      void this.hydrateDescriptions()
    }
  }

  private renderBoard(): void {
    this.config = this.scope.config
    this.setup = this.scope.filterSetup(this.query.filter, personKeyer(this.plugin.app))
    this.filterContext = this.setup.ctx
    this.cardFields = shownFields(this.fields, 'kanban', this.scope.fieldCatalog())
    this.container.empty()
    this.container.addClass('pm-kanban-view')

    const board = this.container.createDiv('pm-kanban-board')
    const columns = boardColumns(this.setup, this.group, this.visibleTasks())
    for (const column of columns.filter((c) => !c.hidden)) {
      new KanbanColumn(board, {
        column,
        fields: this.cardFields,
        cards: column.tasks.map((task) => this.buildCardData(task)),
        onCardClick: (task) => this.openTask(task),
        onCardContextMenu: (task, e) => this.openContextMenu(task, e),
        onCardDragStart: (task) => {
          this.dragTask = task
          this.dragFrom = column.id
        },
        onCardDragEnd: () => {
          this.dragTask = null
          this.dragFrom = null
        },
        onDrop: (taskId, to) => this.handleDrop(taskId, to)
      })
    }

    const hidden = columns.filter((c) => c.hidden).length
    if (hidden) {
      const rail = board.createEl('button', { cls: 'pm-kanban-hidden-rail' })
      setIcon(rail.createSpan('pm-kanban-hidden-icon'), 'eye-off')
      rail.createSpan({ text: tn('header.hiddenCount', hidden) })
      rail.setAttribute('aria-label', t('header.showHiddenColumns'))
      rail.addEventListener('click', () => this.onShowHidden(rail))
    }
  }

  /** Descriptions load lazily from the note body, so previews fill in on a second render. */
  private async hydrateDescriptions(): Promise<void> {
    const pending = boardCandidates(this.scope.tasks(), this.cardFields).filter(
      (t) => t.filePath && !t.description && matchesQuery(t, this.query, this.filterContext)
    )
    if (!pending.length) return
    await Promise.all(pending.map((t) => this.plugin.store.loadTaskBody(t)))
    if (pending.some((t) => t.description)) this.renderBoard()
  }

  private visibleTasks(): Task[] {
    return boardCandidates(this.scope.tasks(), this.cardFields)
      .filter((task) => matchesQuery(task, this.query, this.filterContext))
      .sort((a, b) => compareTasks(a, b, this.sort, this.config.statuses, this.config.priorities))
  }

  private buildCardData(task: Task): KanbanCardData {
    const priorityConfig = getPriorityConfig(this.config.priorities, task.priority)
    const priorityColor =
      priorityConfig && task.priority !== 'medium' && task.priority !== 'low' ? priorityConfig.color : undefined

    let parentTitle: string | undefined
    if (this.cardFields.includes('subtasks') && task.type === 'subtask') {
      const parent = this.findParentTask(task.id)
      if (parent) parentTitle = parent.title
    }

    const owner = this.scope.isMulti ? this.scope.projectOf(task.id) : null

    return {
      task,
      people: linkedRefs(this.plugin.app, task.assignees, task.filePath ?? ''),
      priorityColor,
      descriptionPreview: this.cardFields.includes('description') ? descriptionPreview(task.description) : undefined,
      parentTitle,
      customValues: cardCustomValues(task, this.scope.customFields(), this.cardFields),
      renderSource: owner
        ? (el) =>
            renderProjectChip(el, {
              title: owner.title,
              color: owner.color,
              onClick: safeAsync(() => this.plugin.router.openProjectLink(owner.filePath))
            })
        : undefined,
      loggedHours: totalLoggedHours(task),
      overdue: dueUrgency(task, this.config.statuses) === 'overdue',
      showTagColors: this.plugin.settings.showTagColors
    }
  }

  private findParentTask(taskId: string): Task | null {
    for (const ft of flattenTasks(this.scope.tasks())) {
      const parent = ft.task
      if (parent.subtasks.some((s) => s.id === taskId)) return parent
    }
    return null
  }

  private openTask(task: Task): void {
    const owner = this.scope.projectOf(task.id)
    if (!owner) return
    openTaskModal(this.plugin, owner, {
      task,
      onSave: async () => {
        await this.onRefresh()
      }
    })
  }

  private openContextMenu(task: Task, e: MouseEvent): void {
    const owner = this.scope.projectOf(task.id)
    if (!owner) return
    const menu = new Menu()
    buildTaskContextMenu(menu, task, { plugin: this.plugin, project: owner, onRefresh: this.onRefresh })
    menu.showAtMouseEvent(e)
  }

  private async handleDrop(taskId: string, to: string): Promise<void> {
    const task = this.dragTask
    const from = this.dragFrom
    if (!task || task.id !== taskId || from === null || from === to) return
    const owner = this.scope.projectOf(taskId)
    const patch = this.dropPatch(task, from, to)
    if (!owner || !patch) return
    await this.plugin.store.updateTask(owner, task.id, patch)
    await this.onRefresh()
  }

  /** What moving a card from one column to another changes on its task. Null where a move means nothing. */
  private dropPatch(task: Task, from: string, to: string): Partial<Task> | null {
    const field = boardField(this.setup, this.group)
    const keyOf = (value: string): string => valueKey(field, value, this.filterContext)
    switch (field) {
      case 'status':
        return { status: to }
      case 'priority':
        return { priority: to }
      case 'type':
        return to ? { type: to as TaskType } : null
      case 'assignee':
        return { assignees: moveValue(task.assignees, from, to, keyOf) }
      case 'tag':
        return { tags: moveValue(task.tags, from, to, keyOf) }
    }
    const custom = customFieldOf(field, this.filterContext.customFields)
    if (!custom) return null
    const next = custom.type === 'select' ? to : moveValue(groupValues(task, field, this.setup), from, to, keyOf)
    const customFields = Object.fromEntries(Object.entries(task.customFields).filter(([id]) => id !== custom.id))
    if (next.length) customFields[custom.id] = next
    return { customFields }
  }
}
