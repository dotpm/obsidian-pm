import {
  type CustomFieldDef,
  type PriorityConfig,
  type StatusConfig,
  type Task,
  displayName,
  formatDateShort,
  getPriorityConfig,
  getStatusConfig,
  parsePlainDate,
  Temporal,
  t
} from '@dotpm/core'
import { cardCustomValues } from '../views/boardCards'
import { svgEl } from '#dom'
import type { GanttCanvas } from './canvas'
import { BAR_BORDER_RADIUS, BAR_PADDING, HEADER_HEIGHT, ROW_HEIGHT, dateToX } from './TimelineConfig'

/** One drawn row: the task and where it sits, top to bottom. */
export interface GanttRow {
  task: Task
  depth: number
  /** Its row on the canvas, when rows other than tasks sit between them. Defaults to its place in the list. */
  row?: number
}

/** The first and last day dated anywhere in some tasks and their subtasks, both inclusive. */
export interface DateSpan {
  start: Temporal.PlainDate
  end: Temporal.PlainDate
}

export function dateSpan(tasks: Task[]): DateSpan | null {
  let span: DateSpan | null = null
  const walk = (list: Task[]): void => {
    for (const task of list) {
      const start = parsePlainDate(task.start) ?? parsePlainDate(task.due)
      const end = parsePlainDate(task.due) ?? start
      if (start && end) {
        if (!span) span = { start, end }
        else {
          if (Temporal.PlainDate.compare(start, span.start) < 0) span.start = start
          if (Temporal.PlainDate.compare(end, span.end) > 0) span.end = end
        }
      }
      walk(task.subtasks)
    }
  }
  walk(tasks)
  return span
}

const MILESTONE_SIZE = 12

/** Where a task's own bar or milestone diamond sits across the canvas. Null when it has no date. */
export function barExtent(canvas: GanttCanvas, task: Task): { x1: number; x2: number } | null {
  const startDate = parsePlainDate(task.start)
  const endDate = parsePlainDate(task.due)
  if (task.type === 'milestone') {
    const date = endDate ?? startDate
    if (!date) return null
    const cx = dateToX(canvas.cfg, date) + canvas.cfg.dayWidth / 2
    return { x1: cx - MILESTONE_SIZE, x2: cx + MILESTONE_SIZE }
  }
  // A task due on E occupies day E, so the bar's right edge sits at the start of E+1.
  const effectiveStart = startDate ?? endDate
  if (!effectiveStart) return null
  const effectiveEnd = (endDate ?? effectiveStart).add({ days: 1 })
  const x1 = Math.max(0, dateToX(canvas.cfg, effectiveStart))
  const xEnd = Math.min(canvas.cfg.totalWidth, dateToX(canvas.cfg, effectiveEnd))
  return { x1, x2: x1 + Math.max(8, xEnd - x1) }
}

/** Where `span` runs across the canvas, from the start of its first day to the end of its last. */
export function spanExtent(canvas: GanttCanvas, span: DateSpan): { x1: number; x2: number } {
  return {
    x1: Math.max(0, dateToX(canvas.cfg, span.start)),
    x2: Math.min(canvas.cfg.totalWidth, dateToX(canvas.cfg, span.end.add({ days: 1 })))
  }
}

function spanTooltip(span: DateSpan): SVGTitleElement {
  const tooltip = svgEl('title', {})
  tooltip.textContent = t('gantt.spanTooltip', {
    start: formatDateShort(span.start.toString()),
    end: formatDateShort(span.end.toString())
  })
  return tooltip
}

/**
 * For a folded task or project: a line out of each end of its own `bar` to the first and
 * last day of `span`, capped by a tick, so the bar shows how far what is folded into it
 * reaches. A side the folded tasks don't reach past gets nothing. Without a bar, as for a
 * project, the line runs the whole span.
 */
export function drawSpanWhiskers(
  g: SVGGElement,
  canvas: GanttCanvas,
  row: number,
  span: DateSpan,
  color: string,
  bar: { x1: number; x2: number } | null
): SVGGElement | null {
  const { x1, x2 } = spanExtent(canvas, span)
  const left = bar && bar.x1 > x1 ? bar.x1 : null
  const right = bar && bar.x2 < x2 ? bar.x2 : null
  if (bar && left === null && right === null) return null

  const y = HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2
  const tick = (ROW_HEIGHT - BAR_PADDING * 2) / 3
  // Each segment runs from its capped outer end in to where it meets the bar.
  const segments: { outer: number; inner: number }[] = []
  if (!bar) segments.push({ outer: x1, inner: x2 })
  if (left !== null) segments.push({ outer: x1, inner: left })
  if (right !== null) segments.push({ outer: x2, inner: right })
  const caps = bar ? segments.map((s) => s.outer) : [x1, x2]

  const group = svgEl('g', { class: 'pm-gantt-span' })
  const d = [
    ...caps.map((x) => `M ${x} ${y - tick} L ${x} ${y + tick}`),
    ...segments.map(({ outer, inner }) => `M ${outer} ${y} L ${inner} ${y}`)
  ]
  group.appendChild(svgEl('path', { d: d.join(' '), stroke: color, class: 'pm-gantt-span-line' }))
  // The link dots sit just past the bar's ends, so the pointer strip stops short of them.
  const DOT_CLEARANCE = 14
  for (const { outer, inner } of segments) {
    const toward = Math.sign(inner - outer)
    const end = bar ? inner - toward * DOT_CLEARANCE : inner
    if ((end - outer) * toward < 2) continue
    const hit = svgEl('line', { x1: outer, y1: y, x2: end, y2: y, class: 'pm-gantt-span-hit' })
    hit.appendChild(spanTooltip(span))
    group.appendChild(hit)
  }
  g.appendChild(group)
  return group
}

/** A status color, or the accent the theme resolves for the canvas. */
export function barColor(canvas: GanttCanvas, statuses: StatusConfig[], task: Task): string {
  return (
    getStatusConfig(statuses, task.status)?.color ??
    getComputedStyle(canvas.svgEl).getPropertyValue('--interactive-accent').trim()
  )
}

export function drawRowHover(g: SVGGElement, canvas: GanttCanvas, row: number): void {
  g.appendChild(
    svgEl('rect', {
      x: 0,
      y: HEADER_HEIGHT + row * ROW_HEIGHT,
      width: canvas.cfg.totalWidth,
      height: ROW_HEIGHT,
      class: 'pm-gantt-row-hover'
    })
  )
}

export interface DrawnBar {
  barGroup: SVGGElement
  rect: SVGRectElement
  x: number
  y: number
  width: number
  height: number
}

export interface LabelSource {
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  customFields: CustomFieldDef[]
}

/** The label fields other than the title, as the text beside a bar. Empty when there are none or they hold nothing. */
export function barAsideText(task: Task, fields: string[], source: LabelSource): string {
  const custom = cardCustomValues(task, source.customFields, fields)
  const parts = fields.map((field) => {
    switch (field) {
      case 'assignees':
        return task.assignees.map(displayName).join(', ')
      case 'progress':
        return task.progress > 0 ? `${task.progress}%` : ''
      case 'dates':
        return [task.start, task.due].filter(Boolean).map(formatDateShort).join(' - ')
      case 'status':
        return getStatusConfig(source.statuses, task.status)?.label ?? task.status
      case 'priority':
        return getPriorityConfig(source.priorities, task.priority)?.label ?? task.priority
      default:
        return custom[field]?.text ?? ''
    }
  })
  return parts.filter(Boolean).join(', ')
}

/**
 * The bar itself: fill, progress, recurrence mark, label, the `aside` text past its end,
 * and tooltip. Nothing interactive. `asideAfter` pushes the mark and text out past that x,
 * clear of anything drawn beside the bar.
 */
export function drawTaskBar(
  g: SVGGElement,
  canvas: GanttCanvas,
  statuses: StatusConfig[],
  task: Task,
  row: number,
  color: string,
  aside = '',
  asideAfter = 0
): DrawnBar | null {
  const startDate = parsePlainDate(task.start)
  const endDate = parsePlainDate(task.due)
  // A task due on E occupies day E, so the bar's right edge sits at the start of E+1.
  const effectiveStart = startDate ?? endDate
  if (!effectiveStart) return null
  const effectiveEnd = (endDate ?? effectiveStart).add({ days: 1 })

  const y = HEADER_HEIGHT + row * ROW_HEIGHT + BAR_PADDING
  const height = ROW_HEIGHT - BAR_PADDING * 2
  const x = Math.max(0, dateToX(canvas.cfg, effectiveStart))
  const xEnd = Math.min(canvas.cfg.totalWidth, dateToX(canvas.cfg, effectiveEnd))
  const width = Math.max(8, xEnd - x)

  const barGroup = svgEl('g', { class: 'pm-gantt-bar-group' })
  g.appendChild(barGroup)

  const rect = svgEl('rect', {
    x,
    y,
    width,
    height,
    rx: BAR_BORDER_RADIUS,
    ry: BAR_BORDER_RADIUS,
    fill: color,
    opacity: 0.4,
    class: 'pm-gantt-bar'
  })
  barGroup.appendChild(rect)

  if (task.progress > 0) {
    barGroup.appendChild(
      svgEl('rect', {
        x,
        y,
        width: (task.progress / 100) * width,
        height,
        rx: BAR_BORDER_RADIUS,
        ry: BAR_BORDER_RADIUS,
        fill: color,
        opacity: 0.9,
        class: 'pm-gantt-bar-progress'
      })
    )
  }

  const besideX = Math.max(x + width, asideAfter)
  let asideX = besideX + 6
  if (task.recurrence) {
    const icon = svgEl('text', { x: besideX + 4, y: y + height / 2 + 5, class: 'pm-gantt-bar-icon' })
    icon.textContent = t('chip.recurring')
    barGroup.appendChild(icon)
    asideX += 20
  }
  if (aside) {
    const text = svgEl('text', { x: asideX, y: y + height / 2, class: 'pm-gantt-bar-aside' })
    text.textContent = aside
    barGroup.appendChild(text)
  }

  if (width > 55) {
    const label = svgEl('text', { x: x + 8, y: y + height / 2 + 5, class: 'pm-gantt-bar-label' })
    const maxChars = Math.max(4, Math.floor((width - 16) / 7.5))
    label.textContent = task.title.length > maxChars ? task.title.slice(0, maxChars - 1) + '…' : task.title
    barGroup.appendChild(label)
  }

  const statusConfig = getStatusConfig(statuses, task.status)
  const tooltip = svgEl('title', {})
  const lines = [
    task.title,
    `${statusConfig?.label ?? task.status} · ${task.priority}`,
    `${t('gantt.tooltipStart', { date: task.start || '—' })}  ${t('gantt.tooltipDue', { date: task.due || '—' })}`,
    t('gantt.tooltipProgress', { percent: task.progress })
  ]
  if (task.assignees.length) {
    lines.push(t('gantt.tooltipAssignees', { names: task.assignees.map(displayName).join(', ') }))
  }
  tooltip.textContent = lines.join('\n')
  rect.appendChild(tooltip)

  return { barGroup, rect, x, y, width, height }
}

export function drawMilestoneDiamond(
  g: SVGGElement,
  canvas: GanttCanvas,
  task: Task,
  row: number,
  color: string
): SVGPolygonElement | null {
  const date = parsePlainDate(task.due) ?? parsePlainDate(task.start)
  if (!date) return null
  const cx = dateToX(canvas.cfg, date) + canvas.cfg.dayWidth / 2
  const cy = HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2
  const size = MILESTONE_SIZE
  const diamond = svgEl('polygon', {
    points: `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`,
    fill: color,
    opacity: 0.8,
    class: 'pm-gantt-milestone',
    cursor: 'pointer'
  })
  g.appendChild(diamond)
  const tooltip = svgEl('title', {})
  tooltip.textContent = `${t('gantt.milestoneTitle', { title: task.title })}\n${t('gantt.tooltipDate', { date: task.due || task.start || '—' })}`
  diamond.appendChild(tooltip)
  return diamond
}

/** A dashed line down the body and a label in the sticky header for every dated milestone. */
export function drawMilestoneLabels(
  canvas: GanttCanvas,
  statuses: StatusConfig[],
  rows: GanttRow[],
  rowCount = rows.length
): void {
  const milestones = rows.filter(({ task }) => task.type === 'milestone' && (task.due || task.start))
  if (!milestones.length) return

  const linesG = svgEl('g', { class: 'pm-gantt-milestone-labels' })
  const totalH = HEADER_HEIGHT + rowCount * ROW_HEIGHT

  for (const { task } of milestones) {
    const date = parsePlainDate(task.due) ?? parsePlainDate(task.start)
    if (!date) continue
    const x = dateToX(canvas.cfg, date) + canvas.cfg.dayWidth / 2
    const color = barColor(canvas, statuses, task)

    linesG.appendChild(
      svgEl('line', {
        x1: x,
        y1: HEADER_HEIGHT,
        x2: x,
        y2: totalH,
        stroke: color,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
        opacity: 0.4
      })
    )

    // Label rides the sticky header so it stays visible while rows scroll.
    const label = svgEl('text', { x, y: 14, 'text-anchor': 'middle', class: 'pm-gantt-milestone-label', fill: color })
    label.textContent = task.title.length > 16 ? task.title.slice(0, 14) + '…' : task.title
    canvas.headerSvgEl.appendChild(label)
  }

  canvas.svgEl.appendChild(linesG)
}

export function drawDependencyArrows(canvas: GanttCanvas, rows: GanttRow[]): void {
  const indexMap = new Map<string, number>()
  const taskAt = new Map<number, Task>()
  rows.forEach((row, i) => {
    indexMap.set(row.task.id, row.row ?? i)
    taskAt.set(row.row ?? i, row.task)
  })

  const arrowGroup = svgEl('g', { class: 'pm-gantt-arrows' })

  for (const { task } of rows) {
    if (!task.dependencies?.length) continue
    const toRow = indexMap.get(task.id)
    if (toRow === undefined) continue
    const toY = HEADER_HEIGHT + toRow * ROW_HEIGHT + ROW_HEIGHT / 2
    const taskStart = parsePlainDate(task.start)
    if (!taskStart) continue
    const toX = dateToX(canvas.cfg, taskStart)

    for (const depId of task.dependencies) {
      const fromRow = indexMap.get(depId)
      if (fromRow === undefined) continue
      const depDue = parsePlainDate(taskAt.get(fromRow)?.due ?? '')
      if (!depDue) continue
      const fromX = dateToX(canvas.cfg, depDue.add({ days: 1 }))
      const fromY = HEADER_HEIGHT + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2
      const midX = (fromX + toX) / 2
      arrowGroup.appendChild(
        svgEl('path', {
          d: `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`,
          class: 'pm-gantt-arrow',
          'marker-end': 'url(#pm-arrowhead)'
        })
      )
    }
  }

  const defs =
    canvas.svgEl.querySelector('defs') ?? canvas.svgEl.insertBefore(svgEl('defs', {}), canvas.svgEl.firstChild)
  const marker = svgEl('marker', {
    id: 'pm-arrowhead',
    markerWidth: 8,
    markerHeight: 8,
    refX: 6,
    refY: 3,
    orient: 'auto'
  })
  marker.appendChild(svgEl('path', { d: 'M0,0 L0,6 L8,3 z', class: 'pm-gantt-arrowhead' }))
  defs.appendChild(marker)

  canvas.svgEl.appendChild(arrowGroup)
}
