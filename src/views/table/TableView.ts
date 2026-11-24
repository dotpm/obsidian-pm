import { Notice } from 'obsidian'
import { confirmDialog } from '#ui/ModalFactory'
import type PMPlugin from '#main'
import {
  t,
  tn,
  type TaskQuery,
  type Project,
  type SortRule,
  type ViewFields,
  isQueryActive,
  shownFields
} from '@dotpm/core'
import type { ProjectScope } from '#store'
import { safeAsync } from '@dotpm/ui'
import type { KeyboardSelection, KeyboardSurface } from '#ui/keyboard/types'
import type { SubView } from '../SubView'
import { collapsedTaskIds, setCollapsed as setTaskCollapsed } from '../collapse'
import {
  renderTable,
  refreshTableBody,
  getVisibleTaskIds,
  updateSelectCheckboxes,
  ROW_HEIGHT_ESTIMATE
} from './TableRenderer'
import type { TableState } from './TableRenderer'
import { updateSelectAllCheckbox, updateSelectedRow } from './TableRow'
import { renderBulkActionBar } from './BulkActionBar'
import type { BulkAction } from './BulkActionBar'

export class TableView implements SubView, KeyboardSurface {
  private state: TableState
  private pendingScrollTop: number | null = null

  constructor(
    private container: HTMLElement,
    private scope: ProjectScope,
    private plugin: PMPlugin,
    private onRefresh: () => Promise<void>,
    query: TaskQuery,
    sort: SortRule[],
    private onSortChange: () => void,
    private fields: ViewFields,
    private onFieldsChange: () => void
  ) {
    this.state = {
      sort,
      query,
      selectedTaskId: null,
      selectedTaskIds: new Set(),
      lastCheckedTaskId: null,
      tableBody: null,
      wrapper: null,
      visibleRows: [],
      rowHeight: ROW_HEIGHT_ESTIMATE,
      calibrating: false,
      resizeObserver: null,
      windowStart: -1,
      windowEnd: -1,
      renderWindow: null
    }
  }

  readonly context = 'table' as const

  get keyboard(): KeyboardSurface {
    return this
  }

  groups(): string[][] {
    return [getVisibleTaskIds(this.state)]
  }

  activeId(): string | null {
    return this.state.selectedTaskId
  }

  setActive(id: string | null): void {
    this.state.selectedTaskId = id
    this.paintActive()
  }

  selection(): KeyboardSelection {
    return {
      ids: () => this.state.selectedTaskIds,
      set: (ids) => {
        this.state.selectedTaskIds.clear()
        for (const id of ids) this.state.selectedTaskIds.add(id)
      },
      onChange: () => {
        updateSelectCheckboxes(this.state)
        updateSelectAllCheckbox(this.state)
        this.updateBulkBar()
        this.paintActive()
      }
    }
  }

  pageSize(): number {
    const wrapper = this.container.querySelector<HTMLElement>('.pm-table-wrapper')
    return Math.max(1, Math.floor((wrapper?.clientHeight ?? 400) / this.state.rowHeight) - 1)
  }

  canCollapse(): boolean {
    return !isQueryActive(this.state.query)
  }

  expand(): Promise<void> {
    return this.setActiveCollapsed(false)
  }

  collapse(): Promise<void> {
    return this.setActiveCollapsed(true)
  }

  private async setActiveCollapsed(collapsed: boolean): Promise<void> {
    const id = this.state.selectedTaskId
    if (!id) return
    const project = this.scope.projectOf(id)
    if (!project) return
    setTaskCollapsed(this.plugin.settings, project, id, collapsed)
    await this.plugin.saveSettings()
    await this.onRefresh()
  }

  /** Paints the active row and lets the virtual window scroll it into range. */
  private paintActive(): void {
    updateSelectedRow(this.state)
  }

  getScrollTop(): number {
    const wrapper = this.container.querySelector('.pm-table-wrapper')
    return wrapper?.scrollTop ?? 0
  }

  setPendingScrollTop(top: number): void {
    this.pendingScrollTop = top
  }

  render(): void {
    this.state.tableBody = null
    this.container.empty()
    this.container.addClass('pm-table-view')

    const ctx = this.makeTableContext()
    renderTable(ctx)
    renderBulkActionBar({ ctx, onAction: safeAsync((a) => this.handleBulkAction(a)) })

    if (this.pendingScrollTop !== null) {
      const wrapper = this.container.querySelector('.pm-table-wrapper')
      if (wrapper) {
        wrapper.scrollTop = this.pendingScrollTop
        // Synchronously, rather than waiting on the scroll event's animation frame.
        this.state.renderWindow?.()
      }
      this.pendingScrollTop = null
    }
    this.pruneSelection()
  }

  destroy(): void {
    this.state.resizeObserver?.disconnect()
    this.state.resizeObserver = null
  }

  refresh(): void {
    this.doRefreshTable()
    this.pruneSelection()
    this.updateBulkBar()
  }

  /** A hidden row must not stay deletable just because it was selected before the filter. */
  private pruneSelection(): void {
    const visible = new Set(getVisibleTaskIds(this.state))
    let removed = false
    for (const id of this.state.selectedTaskIds) {
      if (visible.has(id)) continue
      this.state.selectedTaskIds.delete(id)
      removed = true
    }
    if (!removed) return
    updateSelectCheckboxes(this.state)
    updateSelectAllCheckbox(this.state)
    this.updateBulkBar()
  }

  private doRefreshTable(): void {
    if (this.state.tableBody) {
      refreshTableBody(this.makeTableContext())
    } else {
      this.render()
    }
  }

  async handleBulkAction(action: BulkAction): Promise<void> {
    const ids = [...this.state.selectedTaskIds]
    if (!ids.length) return

    // A selection can span projects, and every mutator takes one. Each project's share
    // of the selection goes in its own call, so each still saves once.
    const groups = this.scope.groupByProject(ids)
    try {
      if (action.type === 'delete') {
        if (!(await confirmDialog(this.plugin.app, tn('table.deleteTasksConfirm', ids.length)))) {
          return
        }
      }
      for (const { project, taskIds } of groups) {
        await this.applyBulkAction(action, project, taskIds)
      }
      switch (action.type) {
        case 'set-parent':
          new Notice(tn('table.movedTasksUnderParent', ids.length))
          break
        case 'remove-parent':
          new Notice(tn('table.movedTasksToTopLevel', ids.length))
          break
        case 'archive':
          new Notice(tn('table.archivedTasks', ids.length))
          break
        case 'unarchive':
          new Notice(tn('table.unarchivedTasks', ids.length))
          break
      }
      this.state.selectedTaskIds.clear()
      await this.onRefresh()
    } catch (err) {
      console.error('Bulk action failed', err)
      new Notice(t('bulk.failed'))
      await this.onRefresh()
    }
  }

  private async applyBulkAction(action: BulkAction, project: Project, ids: string[]): Promise<void> {
    switch (action.type) {
      case 'set-status':
        await this.plugin.store.updateTasks(project, ids, { status: action.status })
        break
      case 'set-priority':
        await this.plugin.store.updateTasks(project, ids, { priority: action.priority })
        break
      case 'set-assignee':
        if (action.assignee === '') {
          await this.plugin.store.updateTasks(project, ids, { assignees: [] })
        } else {
          await this.bulkAddToArray(project, ids, 'assignees', action.assignee)
        }
        break
      case 'set-tag':
        if (action.tag === '') {
          await this.plugin.store.updateTasks(project, ids, { tags: [] })
        } else {
          await this.bulkAddToArray(project, ids, 'tags', action.tag)
        }
        break
      case 'set-due-date':
        await this.plugin.store.updateTasks(project, ids, { due: action.due })
        for (const id of ids) {
          await this.plugin.store.scheduleAfterChange(project, id)
        }
        break
      case 'set-progress':
        await this.plugin.store.updateTasks(project, ids, { progress: action.progress })
        break
      case 'set-parent':
        await this.plugin.store.moveTasks(project, ids, action.parentId)
        break
      case 'remove-parent':
        await this.plugin.store.moveTasks(project, ids, null)
        break
      case 'archive':
        for (const id of ids) {
          await this.plugin.store.archiveTask(project, id)
        }
        break
      case 'unarchive':
        for (const id of ids) {
          await this.plugin.store.unarchiveTask(project, id)
        }
        break
      case 'delete':
        await this.plugin.store.deleteTasks(project, ids)
        break
    }
  }

  private async bulkAddToArray(
    project: Project,
    ids: string[],
    field: 'assignees' | 'tags',
    value: string
  ): Promise<void> {
    await this.plugin.store.updateTasks(project, ids, (task) =>
      task[field].includes(value) ? null : { [field]: [...task[field], value] }
    )
  }

  private updateBulkBar(): void {
    const ctx = this.makeTableContext()
    renderBulkActionBar({ ctx, onAction: safeAsync((a) => this.handleBulkAction(a)) })
  }

  private makeTableContext() {
    const config = this.scope.config
    return {
      container: this.container,
      scope: this.scope,
      plugin: this.plugin,
      statuses: config.statuses,
      priorities: config.priorities,
      priorityIcons: config.priorityIcons,
      showSubtreeConnections: config.showSubtreeConnections,
      lineBorders: config.lineBorders,
      collapsedIds: collapsedTaskIds(this.plugin.settings, this.scope.projects),
      columns: shownFields(this.fields, 'table', this.scope.fieldCatalog()),
      fields: this.fields,
      state: this.state,
      onRefresh: this.onRefresh,
      onSelectionChange: () => {
        updateSelectAllCheckbox(this.state)
        this.updateBulkBar()
      },
      onSortChange: this.onSortChange,
      onFieldsChange: this.onFieldsChange
    }
  }
}
