import { ItemView, Menu, Scope, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '#main'
import {
  type ProjectGroupBy,
  type ProjectListField,
  type ProjectListItem,
  type ProjectListView,
  type ProjectProgress,
  type ProjectSortKey,
  allProjectItems,
  arrangeProjects,
  countProjectFilters,
  isProjectQueryActive,
  makeDefaultProjectList,
  makeId,
  PROJECT_LIST_FIELDS,
  projectProgress,
  projectTagCounts,
  sameValue,
  t,
  tidyProjectFields,
  tn,
  withDefault
} from '@dotpm/core'
import {
  ChipButton,
  EmptyState,
  openProjectFieldsPopover,
  openProjectFilterPopover,
  openSavedViewsPopover,
  openSearchPopover,
  openSortPopover,
  renderOptionRow,
  renderProjectFieldsPanel,
  renderProjectFilterPanel,
  renderSortPanel,
  renderBreadcrumb,
  safeAsync,
  SearchBox,
  showMenuBelow,
  SplitButton,
  ViewHeader,
  type PlatformMenu,
  type ProjectFieldsProps,
  type ProjectFilterProps,
  type SearchBoxProps,
  type SortPopoverProps,
  type TuneSheetProps,
  type SortField,
  type TuneItem,
  SavedViewSlot,
  summarizeSort,
  syncSortButton
} from '@dotpm/ui'
import { openProjectCreate } from '#ui/ModalFactory'
import { KeyboardController, type ActionHandlers, type KeyboardSurface } from '#ui/keyboard/index'
import { projectListItems, renderProjectTable, type ProjectListContext } from './ProjectListRenderer'

export const PM_DASHBOARD_VIEW_TYPE = 'pm-dashboard'

const sortFields = (): SortField<ProjectSortKey>[] => [
  { id: 'title', label: t('columns.project') },
  { id: 'progress', label: t('columns.progress') },
  { id: 'due', label: t('columns.due') }
]

const groupLabel = (group: ProjectGroupBy): string =>
  ({ none: t('header.groupNone'), folder: t('header.groupFolder'), tag: t('header.groupTag') })[group]

export class DashboardView extends ItemView {
  private plugin: PMPlugin
  private headerEl!: HTMLElement
  private bodyEl!: HTMLElement
  private header: ViewHeader | null = null
  private searchBox: SearchBox | null = null
  private reloadDebounceTimer: number | null = null
  /** Search text lives as long as this view and is never saved. */
  private text = ''
  private collapsedGroups = new Set<string>()
  private viewSlot: SavedViewSlot | null = null
  private filterButton: ChipButton | null = null
  private archivedButton: ChipButton | null = null
  private sortButton: ChipButton | null = null
  private groupButton: ChipButton | null = null
  private fieldsButton: ChipButton | null = null
  private items: ProjectListItem[] = []
  private shown = 0
  private keyboard!: KeyboardController
  private surface!: KeyboardSurface
  private activePath: string | null = null
  private activeIndex: number | null = null
  private rowPaths: string[] = []

  constructor(leaf: WorkspaceLeaf, plugin: PMPlugin) {
    super(leaf)
    this.plugin = plugin
    this.navigation = false
    const scope = new Scope(this.app.scope)
    this.scope = scope
    scope.register(['Mod'], 's', () => {
      if (!this.viewChanges().length) return true
      safeAsync(() => this.updateActiveView())()
      return false
    })
    this.surface = {
      context: 'projects',
      groups: () => (this.rowPaths.length ? [this.rowPaths] : []),
      activeId: () => this.activePath,
      activePosition: () => (this.activeIndex === null ? null : { group: 0, index: this.activeIndex }),
      setActive: (id) => this.setActivePath(id),
      setActiveAt: (id, _group, index) => this.setActiveRow(id, index),
      pageSize: () => 10,
      canCollapse: () => !isProjectQueryActive(this.state.filter, this.text),
      expand: () => this.setActiveCollapsed(false),
      collapse: () => this.setActiveCollapsed(true)
    }
    this.keyboard = new KeyboardController(this.app, scope, {
      container: () => this.containerEl,
      getSurface: () => this.surface,
      getHandlers: () => this.actionHandlers()
    })
  }

  private actionHandlers(): ActionHandlers {
    const path = (): string | null => this.activePath
    return {
      open: () => {
        const active = path()
        if (active) void safeAsync(() => this.plugin.router.openProjectLink(active))()
      },
      openOverview: () => {
        const active = path()
        if (active) void safeAsync(() => this.plugin.router.openProjectOverview(active))()
      },
      editProject: () => {
        const active = path()
        if (active) void safeAsync(() => this.plugin.router.openProjectEdit(active))()
      },
      new: () => openProjectCreate(this.plugin),
      expand: () => this.setActiveCollapsed(false),
      collapse: () => this.setActiveCollapsed(true),
      search: () => this.searchBox?.focus(),
      filter: () => {
        if (this.filterButton) this.openFilter(this.filterButton.el)
      },
      clearFilter: () => {
        if (countProjectFilters(this.state.filter) === 0) return
        this.state.filter = {}
        this.changed()
      },
      undo: () =>
        (async () => {
          await this.plugin.undoLastAction()
          this.renderList()
        })(),
      redo: () =>
        (async () => {
          await this.plugin.redoLastAction()
          this.renderList()
        })()
    }
  }

  private setActivePath(id: string | null): void {
    if (!id) {
      this.setActiveRow(null, 0)
      return
    }
    const index = this.rowPaths.indexOf(id)
    this.setActiveRow(id, index === -1 ? 0 : index)
  }

  private setActiveRow(id: string | null, index: number): void {
    this.activePath = id
    this.activeIndex = id ? index : null
    this.paintActiveProject()
    if (!id) return
    const row = this.rowAt(index) ?? this.projectRow(id)
    row?.scrollIntoView({ block: 'nearest' })
  }

  private rowAt(index: number | null): HTMLElement | null {
    if (index === null || !this.bodyEl) return null
    return this.bodyEl.querySelectorAll<HTMLElement>('.pm-project-row')[index] ?? null
  }

  private projectRow(id: string): HTMLElement | null {
    if (!this.bodyEl) return null
    return (
      Array.from(this.bodyEl.querySelectorAll<HTMLElement>('.pm-project-row')).find(
        (row) => row.dataset.projectPath === id
      ) ?? null
    )
  }

  private paintActiveProject(): void {
    const rows = this.bodyEl?.querySelectorAll<HTMLElement>('.pm-project-row')
    rows?.forEach((el) => el.removeClass('pm-project-row--active'))
    if (!this.activePath || !rows) return
    let row = this.rowAt(this.activeIndex)
    if (!row || row.dataset.projectPath !== this.activePath) {
      row = this.projectRow(this.activePath)
      this.activeIndex = row ? Array.from(rows).indexOf(row) : null
    }
    row?.addClass('pm-project-row--active')
  }

  private async setActiveCollapsed(collapsed: boolean): Promise<void> {
    const path = this.activePath
    if (!path) return
    const list = this.plugin.settings.collapsedProjects
    const at = list.indexOf(path)
    if (collapsed && at === -1) list.push(path)
    else if (!collapsed && at !== -1) list.splice(at, 1)
    await this.plugin.saveSettings()
    this.renderList()
  }

  getViewType(): string {
    return PM_DASHBOARD_VIEW_TYPE
  }
  getDisplayText(): string {
    return t('dashboard.title')
  }
  getIcon(): string {
    return 'chart-gantt'
  }

  private get state() {
    return this.plugin.settings.projectList
  }

  onOpen(): Promise<void> {
    this.containerEl.addClass('pm-view')
    const root = this.contentEl
    root.empty()
    root.addClass('pm-root')
    this.headerEl = root.createDiv('pm-vh-mount')
    this.bodyEl = root.createDiv('pm-content pm-project-list-container')
    // An untouched list opens with the starred view.
    const starred = this.plugin.settings.projectListViews.find((view) => view.isDefault)
    if (starred && !this.state.activeViewId && sameValue(this.state, makeDefaultProjectList())) {
      this.applyView(starred)
      void this.plugin.saveSettings()
    }
    this.render()
    this.register(this.plugin.index.onChange(() => this.scheduleRender()))
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    this.keyboard.destroy()
    if (this.reloadDebounceTimer !== null) {
      window.clearTimeout(this.reloadDebounceTimer)
      this.reloadDebounceTimer = null
    }
    this.header?.destroy()
    this.header = null
    return Promise.resolve()
  }

  /** The index reports projects appearing, disappearing and changing their counts, wherever they live. */
  private scheduleRender(): void {
    if (this.reloadDebounceTimer !== null) window.clearTimeout(this.reloadDebounceTimer)
    this.reloadDebounceTimer = window.setTimeout(() => {
      this.reloadDebounceTimer = null
      this.renderList()
    }, 300)
  }

  render(): void {
    this.renderHeader()
    this.renderList()
  }

  private renderHeader(): void {
    this.header?.destroy()
    const header = new ViewHeader(this.headerEl)
    this.header = header
    renderBreadcrumb(header.context, {
      icon: 'library',
      ancestors: [],
      title: t('dashboard.title'),
      foldLabel: t('header.parentProjects')
    })
    this.renderViewSlot(header.view)
    this.renderQuerySlot(header.query)
    header
      .setTuneItems(() => this.tuneItems())
      .setTuneSheet(() => this.tuneSheet())
      .setMoreMenu((menu) => this.fillMoreMenu(menu))
    new SplitButton(header.actions)
      .setIcon('plus')
      .setLabel(t('header.newProject'))
      .onClick(() => openProjectCreate(this.plugin))
  }

  private renderViewSlot(parent: HTMLElement): void {
    this.viewSlot = new SavedViewSlot(parent, {
      onOpen: (anchor) => this.openSavedViews(anchor),
      onSave: safeAsync(() => this.updateActiveView())
    })
  }

  private renderQuerySlot(parent: HTMLElement): void {
    this.searchBox = new SearchBox(parent, this.searchProps())
    const filter = new ChipButton(parent).setIcon('list-filter').setLabel(t('header.filter'))
    filter.setAriaLabel(t('header.filter')).onClick(() => this.openFilter(filter.el))
    this.filterButton = filter
    this.archivedButton = new ChipButton(parent).setLabel(t('common.archived')).onClick(() => this.toggleArchived())
    const sort = new ChipButton(parent).setAriaLabel(t('header.sort'))
    sort.onClick(() => this.openSort(sort.el))
    this.sortButton = sort
    const group = new ChipButton(parent).setIcon('group').setAriaLabel(t('header.groupBy'))
    group.onClick(() => this.openGroupMenu(group.el))
    this.groupButton = group
    const fields = new ChipButton(parent).setIcon('columns-3').setLabel(t('header.fields'))
    fields.setAriaLabel(t('header.fields')).onClick(() => this.openFields(fields.el))
    this.fieldsButton = fields
  }

  private shownFields(): ProjectListField[] {
    return this.state.fields ?? [...PROJECT_LIST_FIELDS]
  }

  private setFields(fields: ProjectListField[] | undefined): void {
    const tidy = tidyProjectFields(fields)
    if (tidy) this.state.fields = tidy
    else delete this.state.fields
  }

  private openFields(anchor: HTMLElement): void {
    openProjectFieldsPopover(anchor, this.fieldsProps())
  }

  private fieldsProps(after?: () => void): ProjectFieldsProps {
    return {
      shown: this.shownFields(),
      onChange: (shown) => {
        this.setFields(shown)
        this.changed()
        after?.()
      }
    }
  }

  private searchProps(): SearchBoxProps {
    return {
      value: this.text,
      label: t('header.search'),
      placeholder: t('header.search'),
      clearLabel: t('common.clear'),
      onChange: (value) => {
        this.text = value
        this.renderList()
      }
    }
  }

  private openFilter(anchor: HTMLElement): void {
    openProjectFilterPopover(anchor, this.filterProps())
  }

  private filterProps(after?: () => void): ProjectFilterProps {
    const all = allProjectItems(this.items)
    const progress: Record<ProjectProgress, number> = { 'not-started': 0, 'in-progress': 0, complete: 0 }
    for (const item of all) progress[projectProgress(item)]++
    return {
      filter: this.state.filter,
      progress,
      tags: projectTagCounts(this.items),
      onChange: () => {
        this.changed()
        after?.()
      }
    }
  }

  private toggleArchived(): void {
    safeAsync(async () => {
      this.plugin.settings.showArchivedProjects = !this.plugin.settings.showArchivedProjects
      await this.plugin.saveSettings()
      this.renderList()
    })()
  }

  private openSort(anchor: HTMLElement): void {
    openSortPopover(anchor, this.sortProps())
  }

  private sortProps(after?: () => void): SortPopoverProps<ProjectSortKey> {
    const sorted = (): void => {
      this.changed()
      after?.()
    }
    return {
      fields: sortFields(),
      sort: this.state.sort,
      onChange: sorted,
      onReset: () => {
        const { sort } = this.state
        sort.splice(0, sort.length, ...structuredClone(this.activeView()?.sort ?? []))
        sorted()
      }
    }
  }

  /** The phone's sheet: Filter, Sort and Group, and how many projects they leave. */
  private tuneSheet(): TuneSheetProps {
    return {
      tabs: [
        {
          id: 'filter',
          label: t('header.filter'),
          badge: () => countProjectFilters(this.state.filter),
          render: (parent, changed) =>
            renderProjectFilterPanel(parent, { ...this.filterProps(changed), showClear: false })
        },
        {
          id: 'sort',
          label: t('header.sort'),
          render: (parent, changed) => renderSortPanel(parent, this.sortProps(changed))
        },
        {
          id: 'group',
          label: t('header.group'),
          render: (parent, changed) => {
            const draw = (): void => {
              parent.empty()
              const list = parent.createDiv('pm-pop-list')
              for (const option of ['none', 'folder', 'tag'] as const) {
                renderOptionRow(list, {
                  label: groupLabel(option),
                  selected: this.state.group === option,
                  onPick: () => {
                    this.state.group = option
                    this.changed()
                    draw()
                    changed()
                  }
                })
              }
            }
            draw()
          }
        },
        {
          id: 'fields',
          label: t('header.fields'),
          render: (parent, changed) => renderProjectFieldsPanel(parent, this.fieldsProps(changed))
        }
      ],
      clear: {
        label: t('filter.clearAll'),
        canClear: () => countProjectFilters(this.state.filter) > 0,
        onClear: () => {
          this.state.filter = {}
          this.changed()
        }
      },
      doneLabel: () => tn('header.showProjects', this.shown)
    }
  }

  /** The phone's "More" menu: the Archived toggle, which the header has no room for. */
  private fillMoreMenu(menu: PlatformMenu): void {
    menu.addItem((item) =>
      item
        .setTitle(t('common.archived'))
        .setIcon('archive')
        .setChecked(this.plugin.settings.showArchivedProjects)
        .onClick(() => this.toggleArchived())
    )
    menu.addSeparator()
    menu.addItem((item) =>
      item
        .setTitle(t('keyboard.help'))
        .setIcon('keyboard')
        .onClick(() => this.keyboard.openHelp())
    )
  }

  private openGroupMenu(anchor: HTMLElement): void {
    const menu = new Menu()
    for (const option of ['none', 'folder', 'tag'] as const) {
      menu.addItem((item) =>
        item
          .setTitle(groupLabel(option))
          .setChecked(this.state.group === option)
          .onClick(() => {
            this.state.group = option
            this.changed()
          })
      )
    }
    showMenuBelow(menu, anchor)
  }

  /** The query controls as the Tune button lists them in a narrow header. */
  private tuneItems(): TuneItem[][] {
    const { settings, index } = this.plugin
    const filters = countProjectFilters(this.state.filter)
    const sort = summarizeSort(sortFields(), this.state.sort)
    const items: TuneItem[] = [
      {
        icon: 'search',
        label: t('header.search'),
        state: this.text.trim(),
        onOpen: (anchor) => openSearchPopover(anchor, this.searchProps())
      },
      {
        icon: 'list-filter',
        label: t('header.filter'),
        state: filters ? String(filters) : '',
        onOpen: (anchor) => this.openFilter(anchor)
      }
    ]
    if (index.projectRefs(true).length > index.projectRefs().length || settings.showArchivedProjects) {
      items.push({
        icon: settings.showArchivedProjects ? 'eye' : 'eye-off',
        label: t('common.archived'),
        state: settings.showArchivedProjects ? t('filter.included') : '',
        onOpen: () => this.toggleArchived()
      })
    }
    items.push(
      {
        icon: 'arrow-down-up',
        label: t('header.sort'),
        state: sort ? `${sort.label} ${sort.more}`.trim() : '',
        onOpen: (anchor) => this.openSort(anchor)
      },
      {
        icon: 'group',
        label: t('header.groupBy'),
        state: groupLabel(this.state.group),
        onOpen: (anchor) => this.openGroupMenu(anchor)
      },
      {
        icon: 'columns-3',
        label: t('header.fields'),
        state: this.hiddenFieldsLabel(),
        onOpen: (anchor) => this.openFields(anchor)
      }
    )
    return [items]
  }

  /** The list changed shape: redraw it and keep the change. */
  private changed(): void {
    this.renderList()
    void this.plugin.saveSettings()
  }

  private renderList(): void {
    if (!this.containerEl.isConnected) return
    const { plugin } = this
    this.items = projectListItems(plugin)
    const { groups, shown, total } = arrangeProjects(this.items, this.state, this.text, (path) =>
      plugin.isProjectCollapsed(path)
    )
    this.shown = shown
    this.syncHeader(shown, total)
    this.bodyEl.empty()
    this.rowPaths = []

    if (total === 0) {
      this.activePath = null
      this.renderNothing()
      return
    }
    if (!groups.length) {
      this.activePath = null
      new EmptyState(this.bodyEl)
        .setIcon('search-x')
        .setTitle(t('list.noMatch'))
        .setAction(t('filter.clearAllFilters'), () => {
          this.state.filter = {}
          this.text = ''
          this.renderHeader()
          this.changed()
        })
      return
    }
    const ctx: ProjectListContext = {
      plugin,
      contentEl: this.bodyEl,
      fields: this.shownFields(),
      openProject: (path) => plugin.router.openProjectLink(path),
      redraw: () => this.renderList()
    }
    this.rowPaths = renderProjectTable(ctx, groups, this.state.group, this.collapsedGroups)
    this.keyboard.reconcile()
    this.paintActiveProject()
  }

  private renderNothing(): void {
    const { index } = this.plugin
    const state = new EmptyState(this.bodyEl).setIcon('folder-kanban')
    if (!index.ready) {
      state.setTitle(t('list.looking'))
      return
    }
    if (index.projectRefs(true).length) {
      state.setTitle(t('list.allArchived')).setBody(t('list.allArchivedBody'))
      return
    }
    state
      .setTitle(t('list.empty'))
      .setBody(t('list.emptyBody'))
      .setAction(t('header.newProject'), () => openProjectCreate(this.plugin))
  }

  private syncHeader(shown: number, total: number): void {
    const { settings, index } = this.plugin
    const active = this.activeView()
    this.viewSlot?.sync({
      name: active?.name ?? t('header.allProjects'),
      saved: !!active,
      dirty: this.viewChanges().length > 0,
      count: isProjectQueryActive(this.state.filter, this.text)
        ? t('header.shownOf', { shown, total })
        : tn('count.projects', total)
    })
    const filters = countProjectFilters(this.state.filter)
    this.filterButton?.setBadge(filters).setActive(filters > 0)
    this.searchBox?.setValue(this.text)
    this.header?.tune.setBadge(filters).setActive(isProjectQueryActive(this.state.filter, this.text))
    const hasArchived = index.projectRefs(true).length > index.projectRefs().length
    this.archivedButton?.setActive(settings.showArchivedProjects)
    this.archivedButton?.el.toggleClass('pm-hidden', !hasArchived && !settings.showArchivedProjects)
    if (this.sortButton) syncSortButton(this.sortButton, summarizeSort(sortFields(), this.state.sort))
    const grouped = this.state.group !== 'none'
    this.groupButton?.setLabel(grouped ? groupLabel(this.state.group) : t('header.group')).setActive(grouped)
    this.fieldsButton?.setDetail(this.hiddenFieldsLabel()).setActive(this.state.fields !== undefined)
    this.header?.fit()
  }

  /** "2 hidden" while columns are hidden, or nothing. */
  private hiddenFieldsLabel(): string {
    const hidden = PROJECT_LIST_FIELDS.length - this.shownFields().length
    return hidden ? tn('header.hiddenCount', hidden) : ''
  }

  private activeView(): ProjectListView | undefined {
    return this.plugin.settings.projectListViews.find((view) => view.id === this.state.activeViewId)
  }

  /** What differs from the active saved view, as the reader would name it. */
  private viewChanges(): string[] {
    const active = this.activeView()
    if (!active) return []
    const changes: string[] = []
    if (!sameValue(active.filter, this.state.filter)) changes.push(t('header.changedFilter'))
    if (!sameValue(active.sort, this.state.sort)) changes.push(t('header.changedSort'))
    if (active.group !== this.state.group) changes.push(t('header.changedGroup'))
    if (active.fields && !sameValue(active.fields, this.shownFields())) changes.push(t('header.changedFields'))
    if (active.showArchived !== this.plugin.settings.showArchivedProjects) changes.push(t('header.changedArchived'))
    return changes
  }

  private applyView(view: ProjectListView): void {
    this.state.filter = structuredClone(view.filter)
    this.state.sort = structuredClone(view.sort)
    this.state.group = view.group
    if (view.fields) this.setFields(view.fields)
    this.state.activeViewId = view.id
    this.plugin.settings.showArchivedProjects = view.showArchived
  }

  private snapshot(id: string, name: string): ProjectListView {
    return {
      id,
      name,
      filter: structuredClone(this.state.filter),
      sort: structuredClone(this.state.sort),
      group: this.state.group,
      fields: this.shownFields(),
      showArchived: this.plugin.settings.showArchivedProjects
    }
  }

  private async persistViews(views: ProjectListView[]): Promise<void> {
    this.plugin.settings.projectListViews = views
    await this.plugin.saveSettings()
    this.renderList()
  }

  private async updateActiveView(): Promise<void> {
    const active = this.activeView()
    if (!active) return
    const views = this.plugin.settings.projectListViews.map((view) =>
      view.id === active.id ? { ...this.snapshot(active.id, active.name), isDefault: active.isDefault } : view
    )
    await this.persistViews(views)
  }

  private openSavedViews(anchor: HTMLElement): void {
    const views = this.plugin.settings.projectListViews
    openSavedViewsPopover(anchor, {
      views: views.map((view) => ({ id: view.id, name: view.name, isDefault: view.isDefault })),
      activeId: this.state.activeViewId,
      changes: this.viewChanges(),
      canSave: !sameValue({ ...this.state, activeViewId: null }, makeDefaultProjectList()),
      storageNote: t('header.storedInSettings'),
      builtInName: t('header.allProjects'),
      onSelect: (id) => {
        const view = views.find((v) => v.id === id)
        if (view) this.applyView(view)
        else {
          this.plugin.settings.projectList = makeDefaultProjectList()
          this.plugin.settings.showArchivedProjects = false
        }
        this.text = ''
        this.renderHeader()
        this.changed()
      },
      onSave: async (name, isDefault) => {
        const view = { ...this.snapshot(makeId(), name), ...(isDefault ? { isDefault: true } : {}) }
        const rest = isDefault ? withDefault(views, null) : views
        this.state.activeViewId = view.id
        await this.persistViews([...rest, view])
      },
      onUpdate: () => this.updateActiveView(),
      onRevert: () => {
        const active = this.activeView()
        if (active) this.applyView(active)
        this.changed()
      },
      onRename: (id, name) => this.persistViews(views.map((v) => (v.id === id ? { ...v, name } : v))),
      onDelete: async (id) => {
        if (this.state.activeViewId === id) this.state.activeViewId = null
        await this.persistViews(views.filter((v) => v.id !== id))
      },
      onReorder: (ids) => this.persistViews(ids.flatMap((id) => views.find((v) => v.id === id) ?? [])),
      onSetDefault: (id) => this.persistViews(withDefault(views, id))
    })
  }
}
