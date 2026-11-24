import type PMPlugin from '#main'
import {
  type Task,
  type NonWorkingDays,
  type ViewFields,
  shownFields,
  type GanttGranularity,
  type TaskQuery,
  type FlatTask,
  flattenTasks,
  applyTaskFilterPromote,
  Temporal,
  today,
  t
} from '@dotpm/core'
import { personKeyer, type ProjectScope } from '#store'
import {
  renderAddButton,
  svgEl,
  type TimelineCfg,
  buildTimelineConfig,
  clampZoom,
  dateToX,
  nonWorkingDay,
  xToDate,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  LABEL_WIDTH
} from '@dotpm/ui'
import { openAddTask } from '../addTask'
import type { KeyboardSurface } from '#ui/keyboard/types'
import type { SubView } from '../SubView'
import { collapsedTaskIds, setCollapsed as setTaskCollapsed } from '../collapse'
import { makeDragState } from './GanttDragHandler'
import type { DragState } from './GanttDragHandler'
import { makeLinkState, cancelLink } from './GanttLinkHandler'
import type { LinkState } from './GanttLinkHandler'
import {
  renderTimelineHeader,
  renderGridLines,
  renderTodayLine,
  renderTaskBar,
  renderDependencyArrows,
  renderMilestoneLabels
} from './GanttRenderer'
import type { RendererContext } from './GanttRenderer'
import { renderTaskLabel } from './TaskLabelRenderer'

export class GanttView implements SubView, KeyboardSurface {
  private scrollEl!: HTMLElement
  private svgEl!: SVGSVGElement
  private headerSvgEl!: SVGSVGElement
  private flatTasks: FlatTask[] = []
  /** Task ids in the order the label column paints them. */
  private rowIds: string[] = []
  private activeTaskId: string | null = null
  /** Read from settings once per render pass. */
  private collapsedIds: ReadonlySet<string> = new Set()
  private cfg!: TimelineCfg
  private drag: DragState = makeDragState()
  private link: LinkState = makeLinkState()
  private labelWidth: number = LABEL_WIDTH

  readonly context = 'timeline' as const

  get keyboard(): KeyboardSurface {
    return this
  }

  groups(): string[][] {
    return [this.rowIds]
  }

  activeId(): string | null {
    return this.activeTaskId
  }

  setActive(id: string | null): void {
    this.activeTaskId = id
    this.paintActive()
    if (!id || !this.scrollEl) return
    const index = this.rowIds.indexOf(id)
    if (index === -1) return
    const top = index * ROW_HEIGHT
    const viewport = this.scrollEl.clientHeight
    if (top < this.scrollEl.scrollTop || top + ROW_HEIGHT > this.scrollEl.scrollTop + viewport) {
      this.scrollEl.scrollTop = Math.max(0, top - viewport / 2)
    }
  }

  pageSize(): number {
    return Math.max(1, Math.floor((this.scrollEl?.clientHeight ?? 500) / ROW_HEIGHT))
  }

  cancel(): boolean {
    if (this.link.active) {
      cancelLink(this.link)
      return true
    }
    if (!this.activeTaskId) return false
    this.setActive(null)
    return true
  }

  expand(): Promise<void> {
    return this.setActiveCollapsed(false)
  }

  collapse(): Promise<void> {
    return this.setActiveCollapsed(true)
  }

  private async setActiveCollapsed(collapsed: boolean): Promise<void> {
    const id = this.activeTaskId
    if (!id) return
    const project = this.scope.projectOf(id)
    if (!project) return
    setTaskCollapsed(this.plugin.settings, project, id, collapsed)
    await this.plugin.saveSettings()
    await this.onRefresh()
  }

  private paintActive(): void {
    this.container
      .querySelectorAll('.pm-gantt-label-row--active')
      .forEach((el) => el.removeClass('pm-gantt-label-row--active'))
    if (!this.activeTaskId) return
    this.container
      .querySelector(`.pm-gantt-label-row[data-task-id="${this.activeTaskId}"]`)
      ?.addClass('pm-gantt-label-row--active')
  }

  isDragging(): boolean {
    return this.drag.isDragging
  }

  getLabelWidth(): number {
    return this.labelWidth
  }
  setLabelWidth(w: number): void {
    this.labelWidth = w
  }
  private cleanupFns: (() => void)[] = []
  /** `anchorDate` lands `offset` px from the left edge; without one, at the edge. */
  private pendingScroll: { top: number; anchorDate: Temporal.PlainDate; offset?: number } | null = null
  private zoomFrame: number | null = null

  constructor(
    private container: HTMLElement,
    private scope: ProjectScope,
    private plugin: PMPlugin,
    private onRefresh: () => Promise<void>,
    private query: TaskQuery,
    private granularity: GanttGranularity,
    private fields: ViewFields,
    private zoom: number,
    private nonWorkingDays: NonWorkingDays,
    /** Ctrl+scroll changed the zoom. */
    private onZoom: (zoom: number) => void
  ) {}

  /** Redraws at `zoom`, keeping the date at `clientX` (or the middle of the chart) where it was. */
  setZoom(zoom: number, clientX?: number): void {
    if (!this.scrollEl) return
    const rect = this.scrollEl.getBoundingClientRect()
    const offset = clientX === undefined ? this.scrollEl.clientWidth / 2 : clientX - rect.left
    this.pendingScroll = {
      top: this.scrollEl.scrollTop,
      anchorDate: xToDate(this.cfg, this.scrollEl.scrollLeft + offset),
      offset
    }
    this.zoom = zoom
    this.render()
  }

  /** Ctrl+scroll (pinch on a trackpad) zooms around the pointer, one redraw per frame. */
  private handleZoomWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const next = clampZoom(this.zoom * Math.exp(-e.deltaY / 300))
    if (next === this.zoom) return
    this.zoom = next
    const clientX = e.clientX
    if (this.zoomFrame !== null) return
    this.zoomFrame = window.requestAnimationFrame(() => {
      this.zoomFrame = null
      this.setZoom(this.zoom, clientX)
      this.onZoom(this.zoom)
    })
  }

  destroy(): void {
    if (this.zoomFrame !== null) window.cancelAnimationFrame(this.zoomFrame)
    for (const fn of this.cleanupFns) fn()
    this.cleanupFns = []
  }

  getScrollPosition(): { top: number; anchorDate: Temporal.PlainDate } {
    const top = this.scrollEl?.scrollTop ?? 0
    const anchorDate = this.scrollEl ? xToDate(this.cfg, this.scrollEl.scrollLeft) : today()
    return { top, anchorDate }
  }

  setPendingScroll(pos: { top: number; anchorDate: Temporal.PlainDate }): void {
    this.pendingScroll = pos
  }

  refresh(): void {
    this.pendingScroll = this.getScrollPosition()
    this.render()
  }

  render(): void {
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
    cancelLink(this.link)
    this.container.empty()
    this.container.addClass('pm-gantt-view')

    const activeTasks = this.getVisibleTasks()
    this.collapsedIds = collapsedTaskIds(this.plugin.settings, this.scope.projects)
    this.flatTasks = flattenTasks(activeTasks, this.collapsedIds).filter((f) => f.visible || f.depth === 0)
    this.cfg = buildTimelineConfig(activeTasks, this.granularity, {
      zoom: this.zoom,
      isHidden: nonWorkingDay(this.nonWorkingDays, this.plugin.settings.holidays),
      minWidth: this.container.clientWidth - this.labelWidth
    })

    this.renderGantt()
  }

  private renderGantt(): void {
    const wrapper = this.container.createDiv('pm-gantt-wrapper')

    const leftPanel = wrapper.createDiv('pm-gantt-left')
    leftPanel.style.width = `${this.labelWidth}px`
    leftPanel.style.minWidth = `${this.labelWidth}px`
    const leftHeader = leftPanel.createDiv('pm-gantt-left-header')
    leftHeader.style.height = `${HEADER_HEIGHT}px`
    leftHeader.createSpan({ text: t('columns.task'), cls: 'pm-gantt-left-header-label' })
    const leftBody = leftPanel.createDiv('pm-gantt-left-body')

    const resizeHandle = wrapper.createDiv('pm-gantt-resize-handle')
    let resizing = false
    let startX = 0
    let startWidth = 0
    resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault()
      resizing = true
      startX = e.clientX
      startWidth = this.labelWidth
      activeDocument.body.addClass('pm-resize-active')
    })
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing) return
      const newWidth = Math.max(150, Math.min(600, startWidth + (e.clientX - startX)))
      this.labelWidth = newWidth
      leftPanel.style.width = `${newWidth}px`
      leftPanel.style.minWidth = `${newWidth}px`
    }
    const onMouseUp = () => {
      if (!resizing) return
      resizing = false
      activeDocument.body.removeClass('pm-resize-active')
    }
    activeDocument.addEventListener('mousemove', onMouseMove)
    activeDocument.addEventListener('mouseup', onMouseUp)
    this.cleanupFns.push(() => {
      activeDocument.removeEventListener('mousemove', onMouseMove)
      activeDocument.removeEventListener('mouseup', onMouseUp)
    })

    const rightPanel = wrapper.createDiv('pm-gantt-right')
    this.scrollEl = rightPanel
    rightPanel.addEventListener('wheel', (e) => this.handleZoomWheel(e), { passive: false })

    // The header has its own SVG in a sticky wrapper: it shares the body's horizontal
    // scroll but pins to the top, so the time period stays visible as rows scroll.
    const headerSticky = rightPanel.createDiv('pm-gantt-header-sticky')
    headerSticky.style.width = `${this.cfg.totalWidth}px`
    headerSticky.style.height = `${HEADER_HEIGHT}px`
    this.headerSvgEl = svgEl('svg', {
      width: this.cfg.totalWidth,
      height: HEADER_HEIGHT,
      class: 'pm-gantt-header-svg'
    })
    headerSticky.appendChild(this.headerSvgEl)

    const svgContainer = rightPanel.createDiv('pm-gantt-svg-container')
    svgContainer.style.width = `${this.cfg.totalWidth}px`
    // Tuck the body's top band (still drawn at y=HEADER_HEIGHT) under the sticky header.
    svgContainer.style.marginTop = `-${HEADER_HEIGHT}px`

    const totalRows = this.flatTasks.filter((f) => f.visible || f.depth === 0).length
    const svgHeight = HEADER_HEIGHT + (totalRows + 1) * ROW_HEIGHT // +1 for add-task row

    this.svgEl = svgEl('svg', {
      width: this.cfg.totalWidth,
      height: svgHeight,
      class: 'pm-gantt-svg'
    })
    svgContainer.appendChild(this.svgEl)

    const ctx = this.makeRendererContext()
    renderTimelineHeader(ctx)
    renderGridLines(ctx, totalRows)
    renderTodayLine(ctx, svgHeight)
    this.renderTaskRows(leftBody, ctx)
    this.paintActive()
    renderDependencyArrows(ctx)
    renderMilestoneLabels(ctx)

    // The left panel is overflow:hidden, so its wheel events would be swallowed.
    const onLeftWheel = (e: WheelEvent) => {
      rightPanel.scrollTop += e.deltaY
      rightPanel.scrollLeft += e.deltaX
      e.preventDefault()
    }
    leftPanel.addEventListener('wheel', onLeftWheel, { passive: false })
    this.cleanupFns.push(() => leftPanel.removeEventListener('wheel', onLeftWheel))

    const addRow = leftBody.createDiv('pm-gantt-label-row pm-gantt-add-row')
    addRow.style.height = `${ROW_HEIGHT}px`
    renderAddButton(addRow, t('task.add'), (e) => {
      openAddTask(this.plugin, this.scope, { event: e, onSave: () => this.onRefresh() })
    })

    // The right panel's horizontal scrollbar eats into its viewport height, letting it
    // scroll further than the left body; without this spacer the rows desync at the bottom.
    const leftSpacer = leftBody.createDiv()
    leftSpacer.addClass('pm-no-shrink')
    const syncSpacer = () => {
      const hScrollbarH = rightPanel.offsetHeight - rightPanel.clientHeight
      leftSpacer.style.height = `${hScrollbarH}px`
    }

    rightPanel.addEventListener('scroll', () => {
      syncSpacer()
      leftBody.scrollTop = rightPanel.scrollTop
    })

    window.requestAnimationFrame(() => {
      syncSpacer()
      if (this.pendingScroll) {
        this.scrollEl.scrollTop = this.pendingScroll.top
        const { anchorDate, offset = 0 } = this.pendingScroll
        this.scrollEl.scrollLeft = Math.max(0, dateToX(this.cfg, anchorDate) - offset)
        this.pendingScroll = null
      } else {
        this.scrollToToday()
      }
    })
  }

  private renderTaskRows(leftBody: HTMLElement, ctx: RendererContext): void {
    const barsGroup = svgEl('g', { class: 'pm-gantt-bars' })
    this.svgEl.appendChild(barsGroup)
    this.rowIds = []

    const labelCtx = {
      plugin: this.plugin,
      scope: this.scope,
      statuses: this.scope.config.statuses,
      collapsedIds: this.collapsedIds,
      onRefresh: this.onRefresh
    }
    let rowIndex = 0
    const renderFlatList = (tasks: Task[], depth: number) => {
      for (const task of tasks) {
        this.rowIds.push(task.id)
        renderTaskLabel(leftBody, task, depth, rowIndex, labelCtx)
        renderTaskBar(barsGroup, task, rowIndex, depth, ctx)
        rowIndex++
        if (!this.collapsedIds.has(task.id) && task.subtasks.length) {
          renderFlatList(task.subtasks, depth + 1)
        }
      }
    }
    renderFlatList(this.getVisibleTasks(), 0)
  }

  private makeRendererContext(): RendererContext {
    return {
      svgEl: this.svgEl,
      headerSvgEl: this.headerSvgEl,
      cfg: this.cfg,
      weekLabel: this.plugin.settings.ganttWeekLabel,
      plugin: this.plugin,
      scope: this.scope,
      statuses: this.scope.config.statuses,
      labelFields: shownFields(this.fields, 'gantt', this.scope.fieldCatalog()).filter((id) => id !== 'title'),
      labelSource: {
        statuses: this.scope.config.statuses,
        priorities: this.scope.config.priorities,
        customFields: this.scope.customFields()
      },
      flatTasks: this.flatTasks,
      drag: this.drag,
      link: this.link,
      onRefresh: this.onRefresh,
      cleanupFns: this.cleanupFns
    }
  }

  private getVisibleTasks(): Task[] {
    return applyTaskFilterPromote(
      this.scope.tasks(),
      this.query,
      this.scope.filterContext(personKeyer(this.plugin.app))
    )
  }

  scrollToToday(): void {
    if (!this.scrollEl) return
    const x = dateToX(this.cfg, today())
    const center = x - this.scrollEl.clientWidth / 2
    this.scrollEl.scrollLeft = Math.max(0, center)
  }
}
