import { ItemView, Menu, Scope, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '#main'
import {
  type FilterState,
  type GanttGranularity,
  type Project,
  type SavedView,
  type SortKey,
  type SortOrder,
  type ViewMode,
  collectAllAssignees,
  collectAllTags,
  countActiveFilters,
  flattenTasks,
  GANTT_GRANULARITIES,
  isFilterActive,
  makeDefaultFilter,
  makeDefaultSort,
  makeId,
  matchesFilter,
  truncateTitle,
  t,
  tn
} from '@dotpm/core'
import {
  folderOf,
  personKeyer,
  ProjectScope,
  projectFolderOf,
  resolveScopePaths,
  scopeKey,
  type ScopeSpec
} from '#store'
import {
  ChipButton,
  FilterBar,
  openProjectSwitcher,
  openSavedViewsPopover,
  openSortPopover,
  renderBreadcrumb,
  safeAsync,
  SearchBox,
  showMenuBelow,
  SplitButton,
  ViewHeader,
  type SwitcherProject
} from '@dotpm/ui'
import type { SubView } from './SubView'
import { TableView } from './table/TableView'
import type { ExportViewState } from '../export/snapshot'
import { GanttView } from './gantt/GanttView'
import { KanbanView } from './KanbanView'
import { openTaskModal } from '#ui/ModalFactory'
import { exportViewAsHtml } from '../export/exportView'
import { collapsedTaskIds, setAllCollapsed } from './collapse'

export const PM_PROJECT_VIEW_TYPE = 'pm-project'

interface ProjectViewState {
  scope?: ScopeSpec
  /** How a project view was addressed before scopes; still accepted from saved layouts. */
  filePath?: string
  [key: string]: unknown
}

const MODES: ViewMode[] = ['table', 'gantt', 'kanban']
const MODE_ICONS: Record<ViewMode, string> = { table: 'table', gantt: 'chart-gantt', kanban: 'kanban' }
const modeLabel = (mode: ViewMode): string =>
  ({ table: t('views.table'), gantt: t('views.gantt'), kanban: t('views.kanban') })[mode]
const granularityLabel = (granularity: GanttGranularity): string => t(`granularity.${granularity}`)

const sortFields = (): { id: SortKey; label: string }[] => [
  { id: 'title', label: t('columns.task') },
  { id: 'status', label: t('columns.status') },
  { id: 'priority', label: t('columns.priority') },
  { id: 'assignees', label: t('columns.assignees') },
  { id: 'due', label: t('columns.due') },
  { id: 'progress', label: t('columns.progress') }
]

/** Filters the query bar shows as chips; the search text stays in the search box. */
function barFilterCount(filter: FilterState): number {
  return countActiveFilters(filter) - (filter.text ? 1 : 0)
}

function specOf(state: ProjectViewState): ScopeSpec | null {
  if (state.scope) return state.scope
  if (state.filePath) return { kind: 'project', path: state.filePath }
  return null
}

export class ProjectView extends ItemView {
  plugin: PMPlugin
  projectScope: ProjectScope | null = null
  private spec: ScopeSpec | null = null
  currentView: ViewMode
  filter: FilterState = makeDefaultFilter()
  activeSavedViewId: string | null = null
  sort: SortOrder = makeDefaultSort()
  granularity: GanttGranularity
  private subview: SubView | null = null
  private headerEl!: HTMLElement
  private bodyEl!: HTMLElement
  private header: ViewHeader | null = null
  private filterBar: FilterBar | null = null
  private queryBarOpen = false
  private savedViewButton: ChipButton | null = null
  private countEl: HTMLElement | null = null
  private filterButton: ChipButton | null = null
  private sortButton: ChipButton | null = null
  private keyScope: Scope
  private pendingRefresh: Promise<void> | null = null
  private initialized = false
  /** Set once the default view mode is applied, so reloads don't undo a mode switch. */
  private defaultViewAppliedFor: string | null = null
  /**
   * The paths the current load covers, claimed before it starts. Loading a project can
   * write to it, and that write comes back as an index change, so comparing against the
   * projects already in hand would reload on top of a load that has not finished.
   */
  private loadedPaths: string[] = []

  constructor(leaf: WorkspaceLeaf, plugin: PMPlugin) {
    super(leaf)
    this.plugin = plugin
    this.currentView = plugin.settings.defaultView
    this.granularity = plugin.settings.ganttGranularity
    this.navigation = false
    this.keyScope = new Scope(this.app.scope)
    this.scope = this.keyScope
  }

  getViewType(): string {
    return PM_PROJECT_VIEW_TYPE
  }
  getDisplayText(): string {
    return truncateTitle(this.projectScope?.label() ?? t('common.project'), 10)
  }

  /** The mode, filter, sort and scale a reader of an export starts from. */
  exportState(): ExportViewState {
    return {
      mode: this.currentView,
      filter: { ...this.filter },
      ...this.sort,
      ganttGranularity: this.granularity
    }
  }
  getIcon(): string {
    return 'chart-gantt'
  }

  /** The project a command should act on: the only one, or the group's primary. */
  get project(): Project | null {
    return this.projectScope?.primary ?? null
  }

  async setState(state: ProjectViewState, result: unknown): Promise<void> {
    const spec = specOf(state)
    if (spec && (!this.spec || scopeKey(this.spec) !== scopeKey(spec))) {
      this.spec = spec
      await this.loadScope()
    }
    await super.setState(state, result as import('obsidian').ViewStateResult)
  }

  getState(): ProjectViewState {
    return { scope: this.spec ?? undefined, filePath: this.projectScope?.primary?.filePath }
  }

  onOpen(): Promise<void> {
    // Setup only. setState is the sole loader; this just guarantees the scaffold and
    // listeners exist for hosts that open the view without it.
    this.ensureInitialized()
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    this.subview?.destroy?.()
    this.subview = null
    this.header?.destroy()
    this.header = null
    return Promise.resolve()
  }

  // Pane Relief and Hover Editor restore a deferred leaf via setState without ever
  // calling onOpen, so the one-time setup runs from whichever fires first.
  private ensureInitialized(): void {
    if (this.initialized) return
    this.initialized = true

    this.containerEl.addClass('pm-view')
    const root = this.contentEl
    root.empty()
    root.addClass('pm-root')
    this.headerEl = root.createDiv('pm-vh-mount')
    this.bodyEl = root.createDiv('pm-content')

    this.register(
      this.plugin.store.onProjectChanged((path) => {
        if (this.scopeDependsOn(path)) this.redraw()
      })
    )
    this.register(this.plugin.index.onNoteColorChange(() => this.redraw()))
    // A scope changes when a project joins or leaves it, which for a single-project scope
    // includes the project appearing once the index has caught up with the vault.
    this.register(
      this.plugin.index.onChange(() => {
        if (!this.spec) return
        const paths = resolveScopePaths(this.spec, this.plugin.index)
        const current = this.loadedPaths
        if (paths.length !== current.length || paths.some((path, i) => path !== current[i])) {
          void this.loadScope()
        }
      })
    )
  }

  private scopeDependsOn(path: string): boolean {
    const projects = this.projectScope?.projects
    if (!projects) return false
    return projects.some(
      (project) =>
        project.filePath === path || this.plugin.index.ancestorRefs(project.filePath).some((ref) => ref.path === path)
    )
  }

  /**
   * Something outside the DOM changed: a project in scope, or a setting that decides how
   * it is drawn. The store keeps one instance per file, so the projects are already
   * current and only the DOM needs catching up.
   */
  redraw(): void {
    if (!this.projectScope || !this.spec) return
    if (!this.projectScope.primary) {
      this.renderEmptyScope()
      return
    }
    // A settings edit may have changed a palette, which the scope has resolved and kept.
    this.projectScope.invalidate()
    // Rebuilding the header would drop the caret out of the search box.
    if (this.headerEl.contains(activeDocument.activeElement)) this.syncHeader()
    else this.renderHeader()
    void this.refreshProject()
  }

  private async loadScope(): Promise<void> {
    this.ensureInitialized()
    if (!this.spec) return
    const paths = resolveScopePaths(this.spec, this.plugin.index)
    this.loadedPaths = paths
    const projects = await this.plugin.store.loadProjects(paths)
    this.projectScope = new ProjectScope(this.spec, projects, this.plugin.store)
    if (!this.projectScope.primary) {
      this.renderEmptyScope()
      return
    }
    if (this.defaultViewAppliedFor !== this.projectScope.key) {
      this.defaultViewAppliedFor = this.projectScope.key
      this.currentView = this.projectScope.config.defaultView
    }
    this.loadFilterFromSettings()
    this.queryBarOpen = barFilterCount(this.filter) > 0
    ;(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.()
    this.renderHeader()
    this.renderCurrentView()
  }

  private async switchScope(spec: ScopeSpec): Promise<void> {
    this.spec = spec
    await this.loadScope()
    await this.leaf.setViewState({ type: PM_PROJECT_VIEW_TYPE, state: this.getState() })
  }

  /** Moves this leaf to another scope in the same mode, or opens it in a new tab. */
  private async goTo(spec: ScopeSpec, newTab: boolean): Promise<void> {
    if (newTab) {
      await this.plugin.router.openScope(spec)
      return
    }
    this.defaultViewAppliedFor = scopeKey(spec)
    await this.switchScope(spec)
  }

  private loadFilterFromSettings(): void {
    const saved = this.projectScope ? this.plugin.settings.projectFilters[this.projectScope.key] : undefined
    if (saved) {
      this.filter = saved.filter
      this.activeSavedViewId = saved.activeSavedViewId
      this.sort = { sortKey: saved.sortKey, sortDir: saved.sortDir }
      this.granularity = saved.ganttGranularity
    } else {
      this.filter = makeDefaultFilter()
      this.activeSavedViewId = null
      this.sort = makeDefaultSort()
      this.granularity = this.plugin.settings.ganttGranularity
    }
  }

  private async persistFilter(): Promise<void> {
    if (!this.projectScope) return
    this.plugin.settings.projectFilters[this.projectScope.key] = {
      filter: this.filter,
      activeSavedViewId: this.activeSavedViewId,
      ...this.sort,
      ganttGranularity: this.granularity
    }
    await this.plugin.saveSettings()
  }

  /** One project owns its saved views; a group of them has no file to keep them in. */
  private savedViews(): SavedView[] {
    if (!this.projectScope) return []
    if (this.projectScope.spec.kind === 'project') return this.projectScope.primary?.savedViews ?? []
    return this.plugin.settings.scopeViews[this.projectScope.key] ?? []
  }

  private async persistSavedViews(views: SavedView[]): Promise<void> {
    if (!this.projectScope) return
    const primary = this.projectScope.primary
    if (this.projectScope.spec.kind === 'project' && primary) {
      primary.savedViews = views
      await this.plugin.store.saveProject(primary)
      return
    }
    this.plugin.settings.scopeViews[this.projectScope.key] = views
    await this.plugin.saveSettings()
  }

  private renderEmptyScope(): void {
    this.header?.destroy()
    this.header = null
    this.filterBar = null
    this.headerEl.empty()
    this.bodyEl.empty()
    const msg = this.bodyEl.createDiv('pm-empty-state')
    msg.createEl('h3', { text: t('projectView.nothingToShow') })
    msg.createEl('p', { text: t('projectView.missing') })
  }

  private renderHeader(): void {
    const scope = this.projectScope
    const primary = scope?.primary
    if (!scope || !primary) return
    this.header?.destroy()
    this.headerEl.empty()
    const header = new ViewHeader(this.headerEl)
    this.header = header
    this.renderContextSlot(header.context, scope, primary)
    this.renderViewSlot(header.view)
    this.renderQuerySlot(header.query)
    this.renderOptionsSlot(header.options, scope)
    this.renderActionsSlot(header.actions, scope, primary)
    this.renderFilterBar()
    this.syncHeader()
  }

  /** Brings the parts that follow the filter, sort and task counts up to date without rebuilding them. */
  private syncHeader(): void {
    const active = this.savedViews().find((view) => view.id === this.activeSavedViewId)
    this.savedViewButton
      ?.setLabel(active?.name ?? t('header.allTasks'))
      .setTooltip(active?.name ?? t('header.allTasks'))
    this.savedViewButton?.el.toggleClass('pm-vh-saved-view--none', !active)
    const counts = this.taskCounts()
    this.countEl?.setText(
      isFilterActive(this.filter)
        ? t('header.shownOf', { shown: counts.shown, total: counts.total })
        : tn('header.taskCount', counts.total)
    )
    this.filterBar?.setSummary(t('header.shownSummary', { shown: counts.shown, total: counts.total }))
    const filters = barFilterCount(this.filter)
    this.filterButton?.setBadge(filters ? String(filters) : '').setActive(filters > 0)
    if (this.sortButton) {
      const isDefault = this.sort.sortKey === makeDefaultSort().sortKey
      const field = sortFields().find((f) => f.id === this.sort.sortKey)
      this.sortButton
        .setLabel(isDefault ? t('header.sort') : (field?.label ?? t('header.sort')))
        .setIcon(this.sort.sortDir === 'asc' ? 'arrow-up-narrow-wide' : 'arrow-down-wide-narrow')
        .setActive(!isDefault)
    }
    this.header?.fit()
  }

  private taskCounts(): { shown: number; total: number } {
    const scope = this.projectScope
    if (!scope) return { shown: 0, total: 0 }
    const statuses = scope.config.statuses
    const keyOf = personKeyer(this.plugin.app)
    const all = flattenTasks(scope.tasks())
    const total = all.filter((flat) => this.filter.showArchived || !flat.task.archived).length
    const shown = all.filter((flat) => matchesFilter(flat.task, this.filter, statuses, keyOf)).length
    return { shown, total }
  }

  private renderContextSlot(parent: HTMLElement, scope: ProjectScope, primary: Project): void {
    const kind = scope.spec.kind
    const isProject = kind === 'project' || kind === 'subtree'
    renderBreadcrumb(parent, {
      icon: isProject ? primary.icon : kind === 'folder' ? 'folder' : 'library',
      color: isProject ? primary.color : undefined,
      ancestors: isProject
        ? this.plugin.index.ancestorRefs(primary.filePath).map((ref) => ({
            title: ref.title,
            onOpen: safeAsync((newTab: boolean) => this.goTo({ kind: 'project', path: ref.path }, newTab))
          }))
        : [],
      title: scope.label(),
      onSwitch: isProject ? (anchor) => this.openSwitcher(anchor, primary) : undefined,
      switchLabel: t('header.switchProject'),
      foldLabel: t('header.parentProjects'),
      mode: {
        icon: MODE_ICONS[this.currentView],
        label: modeLabel(this.currentView),
        tooltip: t('header.viewMode', { mode: modeLabel(this.currentView) }),
        onOpen: (anchor) => this.showModeMenu(anchor, scope, primary)
      }
    })
    this.renderScopeButton(parent, scope, primary)
  }

  private showModeMenu(anchor: HTMLElement, scope: ProjectScope, primary: Project): void {
    const menu = new Menu()
    for (const mode of MODES) {
      menu.addItem((item) =>
        item
          .setTitle(modeLabel(mode))
          .setIcon(MODE_ICONS[mode])
          .setChecked(mode === this.currentView)
          .onClick(() => this.switchMode(mode))
      )
    }
    if (!scope.isMulti) {
      menu.addSeparator()
      menu.addItem((item) =>
        item
          .setTitle(t('views.overview'))
          .setIcon('file-text')
          .onClick(safeAsync(() => this.plugin.router.openProjectOverview(primary.filePath, this.leaf)))
      )
    }
    showMenuBelow(menu, anchor)
  }

  private switchMode(mode: ViewMode): void {
    if (mode === this.currentView) return
    this.currentView = mode
    this.renderHeader()
    this.renderCurrentView()
  }

  private openSwitcher(anchor: HTMLElement, primary: Project): void {
    const index = this.plugin.index
    const parent = index.parentOf(primary.filePath)
    const siblings = parent ? index.childRefs(parent.path) : index.rootRefs()
    const projects: SwitcherProject[] = []
    if (parent) {
      projects.push({ path: parent.path, title: parent.title, depth: 0, isParent: true })
    }
    for (const ref of siblings) {
      const isCurrent = ref.path === primary.filePath
      projects.push({ path: ref.path, title: ref.title, icon: ref.icon, color: ref.color, depth: 0, isCurrent })
      if (!isCurrent) continue
      for (const child of index.childRefs(ref.path)) {
        projects.push({ path: child.path, title: child.title, icon: child.icon, color: child.color, depth: 1 })
      }
    }
    const kind = this.projectScope?.spec.kind === 'subtree' ? 'subtree' : 'project'
    openProjectSwitcher(anchor, {
      projects,
      onPick: safeAsync((path: string, newTab: boolean) => this.goTo({ kind, path }, newTab)),
      onAllProjects: safeAsync(() => this.plugin.router.openDashboard())
    })
  }

  private scopeOptions(scope: ProjectScope, primary: Project): { label: string; spec: ScopeSpec }[] {
    const path = scope.spec.kind === 'vault' ? primary.filePath : scope.spec.path
    const projectPath = scope.spec.kind === 'project' || scope.spec.kind === 'subtree' ? path : primary.filePath
    // A project owns its folder, so "the containing folder" is the one holding that folder.
    const own = projectFolderOf(this.app, projectPath)
    const folder = folderOf(own ?? projectPath)
    return [
      { label: t('scope.thisProject'), spec: { kind: 'project', path: projectPath } },
      { label: t('scope.subtree'), spec: { kind: 'subtree', path: projectPath } },
      {
        label: folder ? t('scope.folder', { folder }) : t('scope.vaultFolder'),
        spec: { kind: 'folder', path: folder }
      },
      { label: t('scope.all'), spec: { kind: 'vault' } }
    ]
  }

  private renderScopeButton(parent: HTMLElement, scope: ProjectScope, primary: Project): void {
    const options = this.scopeOptions(scope, primary)
    const current = options.find((option) => scope.key === scopeKey(option.spec))
    const button = new ChipButton(parent)
      .setIcon('layers')
      .setLabel(scope.spec.kind === 'project' ? '' : tn('scope.projectCount', scope.projects.length))
      .setActive(scope.spec.kind !== 'project')
      .setAriaLabel(t('scope.change'))
      .setTooltip(t('header.scope', { label: current?.label ?? t('scope.thisProject') }))
    button.el.addClass('pm-vh-scope')
    button.onClick(() => {
      const menu = new Menu()
      for (const option of options) {
        menu.addItem((item) =>
          item
            .setTitle(option.label)
            .setChecked(scope.key === scopeKey(option.spec))
            .onClick(safeAsync(() => this.switchScope(option.spec)))
        )
      }
      showMenuBelow(menu, button.el)
    })
  }

  private renderViewSlot(parent: HTMLElement): void {
    const button = new ChipButton(parent).setIcon('bookmark').setChevron(true).setAriaLabel(t('header.savedViews'))
    button.el.addClass('pm-vh-saved-view')
    button.onClick(() => {
      openSavedViewsPopover(button.el, {
        views: this.savedViews().map((view) => ({
          id: view.id,
          name: view.name,
          modeIcon: view.viewMode ? MODE_ICONS[view.viewMode] : undefined
        })),
        activeId: this.activeSavedViewId,
        canSave: isFilterActive(this.filter) || this.filter.showArchived,
        onSelect: (id) => this.handleSavedViewSelect(id),
        onSave: (name) => this.handleSavedViewSave(name),
        onUpdate: (id) => this.handleSavedViewUpdate(id),
        onDelete: (id) => this.handleSavedViewDelete(id)
      })
    })
    this.savedViewButton = button
    this.countEl = parent.createSpan('pm-vh-count')
  }

  private renderQuerySlot(parent: HTMLElement): void {
    new SearchBox(parent, {
      value: this.filter.text,
      label: t('header.search'),
      placeholder: t('taskForm.searchTasks'),
      clearLabel: t('common.clear'),
      onChange: (value) => {
        this.filter.text = value
        this.handleFilterMutation()
      }
    })
    this.filterButton = new ChipButton(parent)
      .setIcon('list-filter')
      .setLabel(t('header.filter'))
      .setAriaLabel(t('header.filter'))
      .onClick(() => {
        this.queryBarOpen = true
        if (!this.filterBar) this.renderFilterBar()
        this.filterBar?.openPicker()
      })
    this.sortButton = null
    if (this.currentView !== 'table') return
    const sortButton = new ChipButton(parent).setAriaLabel(t('header.sort'))
    sortButton.onClick(() => {
      openSortPopover(sortButton.el, {
        fields: sortFields(),
        sort: this.sort,
        onChange: () => {
          this.syncHeader()
          this.refreshSubview()
          void this.persistFilter()
        }
      })
    })
    this.sortButton = sortButton
  }

  private renderOptionsSlot(parent: HTMLElement, scope: ProjectScope): void {
    if (this.currentView === 'gantt') {
      new ChipButton(parent)
        .setIcon('calendar-check')
        .setLabel(t('gantt.today'))
        .setAriaLabel(t('gantt.today'))
        .onClick(() => {
          if (this.subview instanceof GanttView) this.subview.scrollToToday()
        })
      const scale = new ChipButton(parent)
        .setLabel(granularityLabel(this.granularity))
        .setChevron(true)
        .setAriaLabel(t('header.scale'))
      scale.onClick(() => {
        const menu = new Menu()
        for (const granularity of GANTT_GRANULARITIES) {
          menu.addItem((item) =>
            item
              .setTitle(granularityLabel(granularity))
              .setChecked(granularity === this.granularity)
              .onClick(() => this.setGranularity(granularity))
          )
        }
        showMenuBelow(menu, scale.el)
      })
    }
    if (this.currentView === 'kanban') return
    const anyCollapsed = collapsedTaskIds(this.plugin.settings, scope.projects).size > 0
    const label = anyCollapsed ? t('gantt.expandAll') : t('gantt.collapseAll')
    new ChipButton(parent)
      .setIcon(anyCollapsed ? 'chevrons-up-down' : 'chevrons-down-up')
      .setLabel('')
      .setAriaLabel(label)
      .setTooltip(label)
      .onClick(() => {
        setAllCollapsed(this.plugin.settings, scope.projects, !anyCollapsed)
        void this.plugin.saveSettings()
        this.renderHeader()
        this.refreshSubview()
      })
  }

  private setGranularity(granularity: GanttGranularity): void {
    if (granularity === this.granularity) return
    this.granularity = granularity
    void this.persistFilter()
    this.renderHeader()
    this.renderCurrentView()
  }

  private renderActionsSlot(parent: HTMLElement, scope: ProjectScope, primary: Project): void {
    const add = new SplitButton(parent).setIcon('plus').setLabel(t('projectView.addTask'))
    add.onClick(() => this.addTask(add.el))
    if (this.currentView === 'gantt') {
      add.onMenu(t('header.moreToAdd'), () => {
        const menu = new Menu()
        menu.addItem((item) =>
          item
            .setTitle(t('projectView.addMilestone'))
            .setIcon('diamond')
            .onClick(() => this.addTask(add.el, { type: 'milestone' }))
        )
        showMenuBelow(menu, add.el)
      })
    }

    const more = new ChipButton(parent).setIcon('ellipsis').setLabel('').setAriaLabel(t('header.more'))
    more.setTooltip(t('header.more'))
    more.onClick(() => {
      const menu = new Menu()
      if (!scope.isMulti) {
        menu.addItem((item) =>
          item
            .setTitle(t('project.openAsNote'))
            .setIcon('file-text')
            .onClick(safeAsync(() => this.plugin.openAsMarkdown(primary.filePath, this.leaf)))
        )
        menu.addItem((item) =>
          item
            .setTitle(t('project.settings'))
            .setIcon('settings')
            .onClick(safeAsync(() => this.plugin.router.openProjectEdit(primary.filePath)))
        )
      }
      menu.addItem((item) =>
        item
          .setTitle(t('commands.exportViewHtml'))
          .setIcon('file-output')
          .onClick(
            safeAsync(async () => {
              await exportViewAsHtml(this.plugin, this)
            })
          )
      )
      showMenuBelow(menu, more.el)
    })
  }

  private renderFilterBar(): void {
    const header = this.header
    const scope = this.projectScope
    if (!header || !scope) return
    header.bar.empty()
    this.filterBar = null
    if (!this.queryBarOpen) return
    const tasks = scope.tasks()
    const config = scope.config
    const counts = this.taskCounts()
    this.filterBar = new FilterBar(header.bar, {
      filter: this.filter,
      statuses: config.statuses,
      priorities: config.priorities,
      priorityIcons: config.priorityIcons,
      assignees: collectAllAssignees(tasks, undefined, personKeyer(this.plugin.app)),
      tags: collectAllTags(tasks),
      summary: t('header.shownSummary', { shown: counts.shown, total: counts.total }),
      onChange: () => this.handleFilterMutation(),
      onClose: () => {
        this.queryBarOpen = false
        this.renderFilterBar()
      }
    })
  }

  private handleFilterMutation(): void {
    this.activeSavedViewId = null
    this.syncHeader()
    void this.persistFilter()
    this.refreshSubview()
  }

  private handleSavedViewSelect(id: string | null): void {
    if (!this.projectScope) return
    if (id === null) {
      Object.assign(this.filter, makeDefaultFilter())
      this.activeSavedViewId = null
    } else {
      const sv = this.savedViews().find((v) => v.id === id)
      if (!sv) return
      Object.assign(this.filter, sv.filter)
      this.activeSavedViewId = sv.id
      this.sort = { sortKey: sv.sortKey, sortDir: sv.sortDir }
      if (sv.ganttGranularity) this.granularity = sv.ganttGranularity
      if (sv.viewMode) this.currentView = sv.viewMode
    }
    this.queryBarOpen = barFilterCount(this.filter) > 0
    void this.persistFilter()
    this.renderHeader()
    this.renderCurrentView()
  }

  private async handleSavedViewSave(name: string): Promise<void> {
    if (!this.projectScope) return
    const sv: SavedView = {
      id: makeId(),
      name,
      filter: { ...this.filter },
      ...this.sort,
      viewMode: this.currentView,
      ganttGranularity: this.granularity
    }
    this.activeSavedViewId = sv.id
    await this.persistSavedViews([...this.savedViews(), sv])
    void this.persistFilter()
    this.syncHeader()
  }

  private async handleSavedViewUpdate(id: string): Promise<void> {
    const views = this.savedViews()
    const sv = views.find((v) => v.id === id)
    if (!sv) return
    sv.filter = { ...this.filter }
    sv.viewMode = this.currentView
    sv.sortKey = this.sort.sortKey
    sv.sortDir = this.sort.sortDir
    sv.ganttGranularity = this.granularity
    this.activeSavedViewId = sv.id
    await this.persistSavedViews(views)
    void this.persistFilter()
    this.syncHeader()
  }

  private async handleSavedViewDelete(id: string): Promise<void> {
    if (this.activeSavedViewId === id) this.activeSavedViewId = null
    await this.persistSavedViews(this.savedViews().filter((v) => v.id !== id))
    void this.persistFilter()
    this.syncHeader()
  }

  private refreshSubview(): void {
    this.subview?.render()
  }

  /** With several projects in view, a new task has to say which one it belongs to. */
  private addTask(anchor: HTMLElement, defaults?: Parameters<typeof openTaskModal>[2]['defaults']): void {
    const scope = this.projectScope
    if (!scope?.primary) return
    const open = (project: Project): void => {
      openTaskModal(this.plugin, project, {
        defaults,
        onSave: async () => {
          await this.refreshProject()
        }
      })
    }
    if (!scope.isMulti) {
      open(scope.primary)
      return
    }
    const menu = new Menu()
    for (const project of scope.projects) {
      menu.addItem((item) =>
        item
          .setTitle(project.title)
          .setIcon('plus')
          .onClick(() => open(project))
      )
    }
    showMenuBelow(menu, anchor)
  }

  private renderCurrentView(): void {
    const scope = this.projectScope
    if (!scope?.primary) return

    let savedGanttScroll: ReturnType<GanttView['getScrollPosition']> | null = null
    let savedGanttLabelWidth: number | null = null
    if (this.currentView === 'gantt' && this.subview instanceof GanttView) {
      savedGanttScroll = this.subview.getScrollPosition()
      savedGanttLabelWidth = this.subview.getLabelWidth()
    }

    let savedTableScrollTop: number | null = null
    if (this.currentView === 'table' && this.subview instanceof TableView) {
      savedTableScrollTop = this.subview.getScrollTop()
    }

    this.subview?.destroy?.()
    this.bodyEl.empty()
    this.subview = null

    switch (this.currentView) {
      case 'table': {
        const table = new TableView(
          this.bodyEl,
          scope,
          this.plugin,
          () => this.refreshProject(),
          this.filter,
          this.sort,
          safeAsync(async () => {
            this.syncHeader()
            await this.persistFilter()
          }),
          this.keyScope
        )
        if (savedTableScrollTop !== null) table.setPendingScrollTop(savedTableScrollTop)
        this.subview = table
        break
      }
      case 'gantt': {
        const gantt = new GanttView(
          this.bodyEl,
          scope,
          this.plugin,
          () => this.refreshProject(),
          this.filter,
          this.granularity,
          this.keyScope
        )
        if (savedGanttScroll) gantt.setPendingScroll(savedGanttScroll)
        if (savedGanttLabelWidth !== null) gantt.setLabelWidth(savedGanttLabelWidth)
        this.subview = gantt
        break
      }
      case 'kanban':
        this.subview = new KanbanView(this.bodyEl, scope, this.plugin, () => this.refreshProject(), this.filter)
        break
    }
    this.bodyEl.toggleClass('pm-content--kanban', this.currentView === 'kanban')
    this.subview?.render()
  }

  /**
   * Re-render from the projects in memory. Coalesced, so a mutation reporting back
   * through both its own callback and the store's change event paints once.
   */
  refreshProject(): Promise<void> {
    if (this.pendingRefresh) return this.pendingRefresh
    this.pendingRefresh = new Promise((resolve) => {
      window.setTimeout(() => {
        this.pendingRefresh = null
        if (this.projectScope?.primary) {
          if (this.subview?.refresh) this.subview.refresh()
          else if (this.subview) this.subview.render()
          else this.renderCurrentView()
          this.syncHeader()
        }
        resolve()
      }, 0)
    })
    return this.pendingRefresh
  }
}
