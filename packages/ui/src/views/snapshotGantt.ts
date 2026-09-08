import { type GanttGranularity, type Task, applyTaskFilterPromote, flattenTasks, today } from '@dotpm/core'
import { svgEl } from '../dom'
import { SegmentedControl } from '../primitives/SegmentedControl'
import { renderProjectChip } from '../composites/projectChip'
import { renderStatusDot } from '../StatusBadge'
import {
  barColor,
  drawDependencyArrows,
  drawMilestoneDiamond,
  drawMilestoneLabels,
  drawRowHover,
  drawTaskBar
} from '../gantt/bars'
import type { GanttCanvas } from '../gantt/canvas'
import { renderGridLines, renderTodayLine } from '../gantt/canvas'
import { renderTimelineHeader } from '../gantt/header'
import { HEADER_HEIGHT, LABEL_WIDTH, ROW_HEIGHT, buildTimelineConfig, dateToX } from '../gantt/TimelineConfig'
import { allTasks, isMulti, mergedConfig, projectOf, type ViewModel } from './model'

const GRANULARITIES: { id: GanttGranularity; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' }
]

const noop = (): void => {}

function visibleTasks(model: ViewModel): Task[] {
  return applyTaskFilterPromote(allTasks(model), model.filter, mergedConfig(model).statuses)
}

function renderLabel(container: HTMLElement, model: ViewModel, task: Task, depth: number): void {
  const el = container.createDiv('pm-gantt-label-row')
  el.setCssStyles({ height: `${ROW_HEIGHT}px`, paddingLeft: `${depth * 18 + 8}px` })
  el.dataset.taskId = task.id
  el.createSpan({ cls: 'pm-gantt-label-spacer' })
  renderStatusDot(el, task.status, mergedConfig(model).statuses, 'pm-gantt-label-dot')
  el.createSpan({ text: task.title, cls: 'pm-gantt-label-title' })
  if (isMulti(model)) {
    const owner = projectOf(model, task.id)
    if (owner) renderProjectChip(el, { title: owner.title, color: owner.color, onClick: noop })
  }
  if (task.progress > 0) el.createSpan({ text: `${task.progress}%`, cls: 'pm-gantt-label-progress' })
}

function renderBody(container: HTMLElement, model: ViewModel, granularity: GanttGranularity): void {
  const tasks = visibleTasks(model)
  const rows = flattenTasks(tasks).map((f) => ({ task: f.task, depth: f.depth }))
  const cfg = buildTimelineConfig(tasks, granularity)
  const statuses = mergedConfig(model).statuses

  const wrapper = container.createDiv('pm-gantt-wrapper')
  const leftPanel = wrapper.createDiv('pm-gantt-left')
  leftPanel.setCssStyles({ width: `${LABEL_WIDTH}px`, minWidth: `${LABEL_WIDTH}px` })
  const leftHeader = leftPanel.createDiv('pm-gantt-left-header')
  leftHeader.setCssStyles({ height: `${HEADER_HEIGHT}px` })
  leftHeader.createSpan({ text: 'Task', cls: 'pm-gantt-left-header-label' })
  const leftBody = leftPanel.createDiv('pm-gantt-left-body')

  const rightPanel = wrapper.createDiv('pm-gantt-right')
  const headerSticky = rightPanel.createDiv('pm-gantt-header-sticky')
  headerSticky.setCssStyles({ width: `${cfg.totalWidth}px`, height: `${HEADER_HEIGHT}px` })
  const headerSvgEl = svgEl('svg', { width: cfg.totalWidth, height: HEADER_HEIGHT, class: 'pm-gantt-header-svg' })
  headerSticky.appendChild(headerSvgEl)

  const svgContainer = rightPanel.createDiv('pm-gantt-svg-container')
  svgContainer.setCssStyles({ width: `${cfg.totalWidth}px`, marginTop: `-${HEADER_HEIGHT}px` })
  const svgHeight = HEADER_HEIGHT + (rows.length + 1) * ROW_HEIGHT
  const canvasSvg = svgEl('svg', { width: cfg.totalWidth, height: svgHeight, class: 'pm-gantt-svg' })
  svgContainer.appendChild(canvasSvg)

  const canvas: GanttCanvas = { svgEl: canvasSvg, headerSvgEl, cfg, weekLabel: model.settings.ganttWeekLabel }
  renderTimelineHeader(canvas)
  renderGridLines(canvas, rows.length)
  renderTodayLine(canvas, svgHeight)

  const barsGroup = svgEl('g', { class: 'pm-gantt-bars' })
  canvasSvg.appendChild(barsGroup)
  rows.forEach(({ task, depth }, row) => {
    renderLabel(leftBody, model, task, depth)
    if (!task.start && !task.due) return
    const color = barColor(canvas, statuses, task)
    drawRowHover(barsGroup, canvas, row)
    if (task.type === 'milestone') drawMilestoneDiamond(barsGroup, canvas, task, row, color)
    else drawTaskBar(barsGroup, canvas, statuses, task, row, color)
  })
  drawDependencyArrows(canvas, rows)
  drawMilestoneLabels(canvas, statuses, rows)

  leftPanel.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      rightPanel.scrollTop += e.deltaY
      rightPanel.scrollLeft += e.deltaX
      e.preventDefault()
    },
    { passive: false }
  )
  rightPanel.addEventListener('scroll', () => {
    leftBody.scrollTop = rightPanel.scrollTop
  })
  window.requestAnimationFrame(() => {
    rightPanel.scrollLeft = Math.max(0, dateToX(cfg, today()) - rightPanel.clientWidth / 2)
  })
}

/** The timeline without drag, links or editing. The zoom control still works, on the page. */
export function renderSnapshotGantt(container: HTMLElement, model: ViewModel): HTMLElement {
  container.addClass('pm-gantt-view')
  let granularity = model.settings.ganttGranularity
  const bar = container.createDiv('pm-gantt-controls')
  const body = container.createDiv('pm-gantt-body')
  const paint = (): void => {
    body.empty()
    renderBody(body, model, granularity)
  }
  new SegmentedControl<GanttGranularity>(bar, {
    options: GRANULARITIES,
    active: granularity,
    onChange: (level) => {
      granularity = level
      paint()
    }
  })
  paint()
  return body
}
