import { type StatusConfig, type Task, displayName, getStatusConfig, parsePlainDate } from '@dotpm/core'
import { svgEl } from '../dom'
import type { GanttCanvas } from './canvas'
import { BAR_BORDER_RADIUS, BAR_PADDING, HEADER_HEIGHT, ROW_HEIGHT, dateToX } from './TimelineConfig'

/** One drawn row: the task and where it sits, top to bottom. */
export interface GanttRow {
  task: Task
  depth: number
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

/** The bar itself: fill, progress, recurrence mark, label and tooltip. Nothing interactive. */
export function drawTaskBar(
  g: SVGGElement,
  canvas: GanttCanvas,
  statuses: StatusConfig[],
  task: Task,
  row: number,
  color: string
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

  if (task.recurrence) {
    const icon = svgEl('text', { x: x + width + 4, y: y + height / 2 + 5, class: 'pm-gantt-bar-icon' })
    icon.textContent = 'R'
    barGroup.appendChild(icon)
  }

  if (width > 55) {
    const label = svgEl('text', { x: x + 8, y: y + height / 2 + 5, class: 'pm-gantt-bar-label' })
    const maxChars = Math.max(4, Math.floor((width - 16) / 7.5))
    label.textContent = task.title.length > maxChars ? task.title.slice(0, maxChars - 1) + '…' : task.title
    barGroup.appendChild(label)
  }

  const statusConfig = getStatusConfig(statuses, task.status)
  const tooltip = svgEl('title', {})
  const assigneesStr = task.assignees.length ? `\nAssignees: ${task.assignees.map(displayName).join(', ')}` : ''
  tooltip.textContent = `${task.title}\n${statusConfig?.label ?? task.status} · ${task.priority}\nStart: ${task.start || '—'}  Due: ${task.due || '—'}\nProgress: ${task.progress}%${assigneesStr}`
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
  const size = 12
  const diamond = svgEl('polygon', {
    points: `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`,
    fill: color,
    opacity: 0.8,
    class: 'pm-gantt-milestone',
    cursor: 'pointer'
  })
  g.appendChild(diamond)
  const tooltip = svgEl('title', {})
  tooltip.textContent = `${task.title} (milestone)\nDate: ${task.due || task.start || '—'}`
  diamond.appendChild(tooltip)
  return diamond
}

/** A dashed line down the body and a label in the sticky header for every dated milestone. */
export function drawMilestoneLabels(canvas: GanttCanvas, statuses: StatusConfig[], rows: GanttRow[]): void {
  const milestones = rows.filter(({ task }) => task.type === 'milestone' && (task.due || task.start))
  if (!milestones.length) return

  const linesG = svgEl('g', { class: 'pm-gantt-milestone-labels' })
  const totalH = HEADER_HEIGHT + rows.length * ROW_HEIGHT

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
  rows.forEach((row, i) => indexMap.set(row.task.id, i))

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
      const depDue = parsePlainDate(rows[fromRow].task.due)
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
