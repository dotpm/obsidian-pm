import { ButtonComponent, type Scope } from 'obsidian'
import type PMPlugin from '../../main'
import {
  type Task,
  type GanttGranularity,
  type FilterState,
  type FlatTask,
  flattenTasks,
  applyTaskFilterPromote,
  Temporal,
  today
} from '@dotpm/core'
import { personKeyer, type ProjectScope } from '../../store'
import {
  renderAddButton,
  SegmentedControl,
  svgEl,
  type TimelineCfg,
  buildTimelineConfig,
  dateToX,
  xToDate,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  LABEL_WIDTH
} from '@dotpm/ui'
import { openAddTask } from '../addTask'
import type { SubView } from '../SubView'
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

export class GanttView implements SubView {
  private granularity: GanttGranularity
  private scrollEl!: HTMLElement
  private svgEl!: SVGSVGElement
  private headerSvgEl!: SVGSVGElement
  private flatTasks: FlatTask[] = []
  private cfg!: TimelineCfg
  private drag: DragState = makeDragState()
  private link: LinkState = makeLinkState()
  private labelWidth: number = LABEL_WIDTH

  getLabelWidth(): number {
    return this.labelWidth
  }
  setLabelWidth(w: number): void {
    this.labelWidth = w
  }
  private cleanupFns: (() => void)[] = []
  private pendingScroll: { top: number; anchorDate: Temporal.PlainDate } | null = null

  constructor(
    private container: HTMLElement,
    private scope: ProjectScope,
    private plugin: PMPlugin,
    private onRefresh: () => Promise<void>,
    private filter: FilterState,
    private keyScope: Scope
  ) {
    this.granularity = plugin.settings.ganttGranularity
  }

  destroy(): void {
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
    this.flatTasks = flattenTasks(activeTasks).filter((f) => f.visible || f.depth === 0)
    this.cfg = buildTimelineConfig(activeTasks, this.granularity)

    this.renderGranularityControls()
    this.renderGantt()
  }

  private renderGranularityControls(): void {
    const bar = this.container.createDiv('pm-gantt-controls')
    const levels: GanttGranularity[] = ['day', 'week', 'month', 'quarter', 'year']
    const labels: Record<GanttGranularity, string> = {
      day: 'Day',
      week: 'Week',
      month: 'Month',
      quarter: 'Quarter',
      year: 'Year'
    }

    new SegmentedControl<GanttGranularity>(bar, {
      options: levels.map((level) => ({ id: level, label: labels[level] })),
      active: this.granularity,
      onChange: (level) => {
        this.granularity = level
        this.plugin.settings.ganttGranularity = level
        void this.plugin.saveSettings()
        this.render()
      }
    })

    bar.createSpan({ cls: 'pm-gantt-sep' })
    new ButtonComponent(bar).setButtonText('Today').onClick(() => this.scrollToToday())

    new ButtonComponent(bar).setButtonText('Expand all').onClick(() => this.setAllCollapsed(false))
    new ButtonComponent(bar).setButtonText('Collapse all').onClick(() => this.setAllCollapsed(true))
  }

  private renderGantt(): void {
    const wrapper = this.container.createDiv('pm-gantt-wrapper')

    const leftPanel = wrapper.createDiv('pm-gantt-left')
    leftPanel.style.width = `${this.labelWidth}px`
    leftPanel.style.minWidth = `${this.labelWidth}px`
    const leftHeader = leftPanel.createDiv('pm-gantt-left-header')
    leftHeader.style.height = `${HEADER_HEIGHT}px`
    leftHeader.createSpan({ text: 'Task', cls: 'pm-gantt-left-header-label' })
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

    const undo = () => {
      if (this.drag.isDragging) return
      void this.plugin.undoLastAction()
      return false
    }
    const redo = () => {
      if (this.drag.isDragging) return
      void this.plugin.redoLastAction()
      return false
    }
    const keyHandlers = [
      this.keyScope.register([], 'Escape', () => {
        if (this.link.active) cancelLink(this.link)
      }),
      this.keyScope.register(['Mod'], 'z', undo),
      this.keyScope.register(['Mod', 'Shift'], 'z', redo),
      this.keyScope.register(['Mod'], 'y', redo)
    ]
    this.cleanupFns.push(() => {
      for (const handler of keyHandlers) this.keyScope.unregister(handler)
    })

    const ctx = this.makeRendererContext()
    renderTimelineHeader(ctx)
    renderGridLines(ctx, totalRows)
    renderTodayLine(ctx, svgHeight)
    this.renderTaskRows(leftBody, ctx)
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
    renderAddButton(addRow, 'Add task', (e) => {
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
        this.scrollEl.scrollLeft = Math.max(0, dateToX(this.cfg, this.pendingScroll.anchorDate))
        this.pendingScroll = null
      } else {
        this.scrollToToday()
      }
    })
  }

  private renderTaskRows(leftBody: HTMLElement, ctx: RendererContext): void {
    const barsGroup = svgEl('g', { class: 'pm-gantt-bars' })
    this.svgEl.appendChild(barsGroup)

    const labelCtx = {
      plugin: this.plugin,
      scope: this.scope,
      statuses: this.scope.config.statuses,
      onRefresh: this.onRefresh
    }
    let rowIndex = 0
    const renderFlatList = (tasks: Task[], depth: number) => {
      for (const task of tasks) {
        renderTaskLabel(leftBody, task, depth, rowIndex, labelCtx)
        renderTaskBar(barsGroup, task, rowIndex, depth, ctx)
        rowIndex++
        if (!task.collapsed && task.subtasks.length) {
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
      this.filter,
      this.scope.config.statuses,
      personKeyer(this.plugin.app)
    )
  }

  private scrollToToday(): void {
    if (!this.scrollEl) return
    const x = dateToX(this.cfg, today())
    const center = x - this.scrollEl.clientWidth / 2
    this.scrollEl.scrollLeft = Math.max(0, center)
  }

  private setAllCollapsed(collapsed: boolean): void {
    for (const { task } of flattenTasks(this.scope.tasks())) {
      if (task.subtasks.length > 0) task.collapsed = collapsed
    }
    for (const project of this.scope.projects) void this.plugin.persistCollapsedState(project)
    this.render()
  }
}
