import { Menu } from 'obsidian'
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
  ChipButton,
  descriptionPreview,
  compareTasks,
  groupValues,
  KanbanColumn,
  type FilterSetup,
  type KanbanCardData,
  renderProjectChip
} from '@dotpm/ui'
import { openTaskModal } from '#ui/ModalFactory'
import type { KeyboardSurface } from '#ui/keyboard/types'
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

export class KanbanView implements SubView, KeyboardSurface {
  private dragTask: Task | null = null
  private dragFrom: string | null = null
  private setup!: FilterSetup
  /** Resolved once per board render. */
  private config!: ResolvedProjectConfig
  private filterContext!: FilterContext
  /** The card fields, resolved once per board render. */
  private cardFields: string[] = []
  private activeTaskId: string | null = null
  private activeOccurrence: { group: number; index: number } | null = null
  private activeColumnId: string | null = null
  /** The visible columns in order, with their card ids, for keyboard movement. */
  private columns: { id: string; ids: string[] }[] = []

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

  readonly context = 'board' as const

  get keyboard(): KeyboardSurface {
    return this
  }

  groups(): string[][] {
    return this.columns.map((column) => column.ids)
  }

  activeId(): string | null {
    return this.activeTaskId
  }

  activeGroupKey(): string | null {
    return this.activeColumn()?.id ?? null
  }

  activePosition(): { group: number; index: number } | null {
    const id = this.activeTaskId
    if (!id) return null
    const position = this.activeOccurrence
    if (position && this.columns[position.group]?.ids[position.index] === id) return position
    if (this.activeColumnId) {
      const group = this.columns.findIndex((column) => column.id === this.activeColumnId)
      const index = group === -1 ? -1 : this.columns[group].ids.indexOf(id)
      if (index !== -1) return { group, index }
    }
    return this.findOccurrence(id)
  }

  setActive(id: string | null): void {
    if (!id) {
      this.activeTaskId = null
      this.activeOccurrence = null
      this.activeColumnId = null
      this.paintActive()
      return
    }
    const position = this.findOccurrence(id)
    if (position) this.setActiveAt(id, position.group, position.index)
    else {
      this.activeTaskId = id
      this.activeOccurrence = null
      this.paintActive()
    }
  }

  setActiveAt(id: string | null, group: number, index: number): void {
    this.activeTaskId = id
    this.activeOccurrence = id ? { group, index } : null
    this.activeColumnId = id ? (this.columns[group]?.id ?? null) : null
    this.paintActive()
    if (id) this.cardElAt(group, id)?.scrollIntoView({ block: 'nearest' })
  }

  private findOccurrence(id: string): { group: number; index: number } | null {
    for (let group = 0; group < this.columns.length; group++) {
      const index = this.columns[group].ids.indexOf(id)
      if (index !== -1) return { group, index }
    }
    return null
  }

  private paintActive(): void {
    this.container.querySelectorAll('.pm-kanban-card--active').forEach((el) => el.removeClass('pm-kanban-card--active'))
    const id = this.activeTaskId
    if (!id) return
    const position = this.activeOccurrence
    const holdsActive = position !== null && this.columns[position.group]?.ids[position.index] === id
    let at = holdsActive ? position : null
    if (!at && this.activeColumnId) {
      const group = this.columns.findIndex((column) => column.id === this.activeColumnId)
      const index = group === -1 ? -1 : this.columns[group].ids.indexOf(id)
      if (index !== -1) at = { group, index }
    }
    at = at ?? this.findOccurrence(id)
    this.activeOccurrence = at
    this.activeColumnId = at ? (this.columns[at.group]?.id ?? null) : null
    if (at) this.cardElAt(at.group, id)?.addClass('pm-kanban-card--active')
  }

  private cardElAt(group: number, id: string): HTMLElement | null {
    const columns = this.container.querySelectorAll<HTMLElement>('.pm-kanban-cards')
    return columns[group]?.querySelector<HTMLElement>(`.pm-kanban-card[data-task-id="${id}"]`) ?? null
  }

  pageSize(): number {
    return 8
  }

  newTaskDefaults(): Partial<Task> | null {
    const column = this.activeColumn()
    if (!column || !this.setup) return null
    const field = boardField(this.setup, this.group)
    switch (field) {
      case 'status':
        return column.id ? { status: column.id } : null
      case 'priority':
        return column.id ? { priority: column.id } : null
      case 'type':
        return column.id ? { type: column.id as TaskType } : null
      case 'assignee':
        return { assignees: column.id ? [column.id] : [] }
      case 'tag':
        return { tags: column.id ? [column.id] : [] }
    }
    const custom = customFieldOf(field, this.filterContext.customFields)
    if (!custom) return null
    return {
      customFields: {
        [custom.id]: custom.type === 'select' ? column.id : column.id ? [column.id] : []
      }
    }
  }

  cancel(): boolean {
    if (!this.activeTaskId) return false
    this.setActive(null)
    return true
  }

  private activeColumn(): { id: string; ids: string[] } | null {
    const id = this.activeTaskId
    if (!id) return null
    const position = this.activeOccurrence
    if (position && this.columns[position.group]?.ids[position.index] === id) {
      return this.columns[position.group]
    }
    if (this.activeColumnId) {
      const column = this.columns.find((candidate) => candidate.id === this.activeColumnId)
      if (column?.ids.includes(id)) return column
    }
    return this.columns.find((column) => column.ids.includes(id)) ?? null
  }

  /** Steps a card into the adjacent column, the same way dragging it there does. */
  async moveCard(delta: 1 | -1, id?: string, columnId?: string): Promise<void> {
    const taskId = id ?? this.activeTaskId
    const column =
      (columnId ? this.columns.find((candidate) => candidate.id === columnId) : null) ?? this.activeColumn()
    if (!taskId || !column) return
    const index = this.columns.indexOf(column)
    const target = this.columns[index + delta]
    if (!target || target.id === column.id) return
    const previous = { id: this.activeTaskId, column: this.activeColumnId, position: this.activeOccurrence }
    this.activeTaskId = taskId
    this.activeColumnId = target.id
    this.activeOccurrence = null
    try {
      const moved = await this.handleDrop(taskId, target.id, column.id)
      if (!moved) {
        this.activeTaskId = previous.id
        this.activeColumnId = previous.column
        this.activeOccurrence = previous.position
        this.paintActive()
        return
      }
      this.activeTaskId = taskId
      this.activeColumnId = target.id
      this.activeOccurrence = null
      this.paintActive()
    } catch (err) {
      this.activeTaskId = previous.id
      this.activeColumnId = previous.column
      this.activeOccurrence = previous.position
      this.paintActive()
      throw err
    }
  }

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
    const visible = columns.filter((c) => !c.hidden)
    this.columns = visible.map((column) => ({ id: column.id, ids: column.tasks.map((task) => task.id) }))
    for (const column of visible) {
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
        onDrop: async (taskId, to) => {
          await this.handleDrop(taskId, to)
        }
      })
    }
    this.paintActive()

    const hidden = columns.filter((c) => c.hidden).length
    if (hidden) {
      const rail = new ChipButton(board)
        .setVariant('flat')
        .setIcon('eye-off')
        .setLabel(tn('header.hiddenCount', hidden))
        .setAriaLabel(t('header.showHiddenColumns'))
        .onClick(() => this.onShowHidden(rail.el))
      rail.el.addClass('pm-kanban-hidden-rail')
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

  private async handleDrop(taskId: string, to: string, fromOverride?: string): Promise<boolean> {
    const task = this.dragTask?.id === taskId ? this.dragTask : this.scope.taskById(taskId)
    // A drag knows the column it started in; a key-driven move passes the occurrence it is on.
    const from = fromOverride ?? this.dragFrom ?? this.columns.find((column) => column.ids.includes(taskId))?.id ?? null
    this.dragTask = null
    this.dragFrom = null
    if (!task || from === null || from === to) return false
    const owner = this.scope.projectOf(taskId)
    if (!owner) return false
    if (boardField(this.setup, this.group) === 'project') {
      const target = this.scope.projects.find((project) => project.id === to)
      if (!target || target.filePath === owner.filePath) return false
      await this.plugin.store.moveTaskToProject(owner, target, task.id)
      await this.onRefresh()
      return true
    }
    const patch = this.dropPatch(task, from, to)
    if (!patch) return false
    const before: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(patch), ...('status' in patch ? ['completed'] : [])])) {
      before[key] = structuredClone(task[key as keyof Task])
    }
    await this.plugin.store.updateTask(owner, task.id, patch)
    this.plugin.pushUndo({
      undo: () => this.plugin.store.updateTask(owner, task.id, before),
      redo: () => this.plugin.store.updateTask(owner, task.id, patch)
    })
    await this.onRefresh()
    return true
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
