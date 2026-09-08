import { Notice } from 'obsidian'
import type { Task } from '@dotpm/core'
import {
  svgEl,
  safeAsync,
  barColor,
  drawDependencyArrows,
  drawMilestoneDiamond,
  drawMilestoneLabels,
  drawRowHover,
  drawTaskBar,
  type GanttRow,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  BAR_PADDING,
  BAR_BORDER_RADIUS,
  xToDate,
  getSnapPoints,
  snapX
} from '@dotpm/ui'
import { openTaskModal } from '../../ui/ModalFactory'
import { attachBarDrag } from './GanttDragHandler'
import { handleLinkDotClick } from './GanttLinkHandler'
import type { RendererContext } from './GanttRenderer'

export function renderTaskBar(g: SVGGElement, task: Task, row: number, _depth: number, ctx: RendererContext): void {
  const project = ctx.scope.projectOf(task.id)
  if (!project) return
  if (!task.start && !task.due) {
    renderEmptyRowClickTarget(g, task, row, ctx)
    return
  }

  const color = barColor(ctx, ctx.statuses, task)
  drawRowHover(g, ctx, row)

  if (task.type === 'milestone') {
    renderMilestoneDiamond(g, task, row, color, ctx)
    return
  }

  const drawn = drawTaskBar(g, ctx, ctx.statuses, task, row, color)
  if (!drawn) return
  const { barGroup, rect, x, y, width, height } = drawn

  const HANDLE_W = 8
  for (const side of ['left', 'right'] as const) {
    const hx = side === 'left' ? x : x + width - HANDLE_W
    const handle = svgEl('rect', {
      x: hx,
      y,
      width: HANDLE_W,
      height,
      rx: 3,
      ry: 3,
      class: 'pm-gantt-drag-handle',
      cursor: 'ew-resize'
    })
    ctx.cleanupFns.push(
      attachBarDrag({
        trigger: handle,
        rect,
        barGroup,
        task,
        side,
        x,
        width,
        cfg: ctx.cfg,
        drag: ctx.drag,
        plugin: ctx.plugin,
        project,
        onRefresh: ctx.onRefresh
      })
    )
    barGroup.appendChild(handle)
  }

  const DOT_R = 4
  const DOT_GAP = 4
  for (const side of ['left', 'right'] as const) {
    const cx = side === 'left' ? x - DOT_GAP - DOT_R : x + width + DOT_GAP + DOT_R
    const cy = y + height / 2
    const dot = svgEl('circle', {
      cx,
      cy,
      r: DOT_R,
      class: 'pm-gantt-link-dot',
      cursor: 'crosshair'
    })
    dot.addEventListener('mousedown', (e: MouseEvent) => {
      e.stopPropagation()
    })
    dot.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation()
      handleLinkDotClick(dot, task.id, side, ctx.link, ctx.plugin, ctx.scope, ctx.onRefresh)
    })
    barGroup.appendChild(dot)
  }

  if (task.start && task.due) {
    ctx.cleanupFns.push(
      attachBarDrag({
        trigger: rect,
        rect,
        barGroup,
        task,
        side: 'move',
        x,
        width,
        cfg: ctx.cfg,
        drag: ctx.drag,
        plugin: ctx.plugin,
        project,
        onRefresh: ctx.onRefresh
      })
    )
    rect.setAttribute('cursor', 'grab')
  } else {
    rect.setAttribute('cursor', 'pointer')
  }

  rect.addEventListener('click', () => {
    if (ctx.drag.dragMoved) {
      ctx.drag.dragMoved = false
      return
    }
    openTaskModal(ctx.plugin, project, { task, onSave: () => ctx.onRefresh() })
  })
}

function renderEmptyRowClickTarget(g: SVGGElement, task: Task, row: number, ctx: RendererContext): void {
  const project = ctx.scope.projectOf(task.id)
  if (!project) return
  const rowY = HEADER_HEIGHT + row * ROW_HEIGHT

  const hitArea = svgEl('rect', {
    x: 0,
    y: rowY,
    width: ctx.cfg.totalWidth,
    height: ROW_HEIGHT,
    fill: 'transparent',
    cursor: 'cell',
    class: 'pm-gantt-empty-row-hit'
  })

  const previewY = rowY + BAR_PADDING
  const previewH = ROW_HEIGHT - BAR_PADDING * 2
  const previewW = Math.max(ctx.cfg.dayWidth, 8)
  const preview = svgEl('rect', {
    x: 0,
    y: previewY,
    width: previewW,
    height: previewH,
    rx: BAR_BORDER_RADIUS,
    ry: BAR_BORDER_RADIUS,
    class: 'pm-gantt-empty-row-preview',
    'pointer-events': 'none'
  })
  preview.classList.add('pm-hidden')

  g.appendChild(hitArea)
  g.appendChild(preview)

  const snapPoints = getSnapPoints(ctx.cfg)
  const snapThreshold = ctx.cfg.dayWidth * 0.4

  hitArea.addEventListener('mousemove', (e: MouseEvent) => {
    const svgRect = ctx.svgEl.getBoundingClientRect()
    const rawX = e.clientX - svgRect.left
    const snapped = snapX(rawX, snapPoints, snapThreshold)
    preview.setAttribute('x', String(snapped))
    preview.classList.remove('pm-hidden')
  })

  hitArea.addEventListener('mouseleave', () => {
    preview.classList.add('pm-hidden')
  })

  hitArea.addEventListener(
    'click',
    safeAsync(async (e: MouseEvent) => {
      const svgRect = ctx.svgEl.getBoundingClientRect()
      const rawX = e.clientX - svgRect.left
      const snapped = snapX(rawX, snapPoints, snapThreshold)
      const iso = xToDate(ctx.cfg, snapped).toString()

      try {
        await ctx.plugin.store.updateTask(project, task.id, { start: iso, due: iso })
      } catch (err) {
        new Notice('Failed to set task dates. Please try again.')
        console.error('GanttTaskBarRenderer: click-to-set-dates failed', err)
        return
      }
      await ctx.plugin.store.scheduleAfterChange(project, task.id)
      await ctx.onRefresh()
    })
  )

  const tt = svgEl('title', {})
  tt.textContent = 'Click to set dates'
  hitArea.appendChild(tt)
}

function renderMilestoneDiamond(g: SVGGElement, task: Task, row: number, color: string, ctx: RendererContext): void {
  const project = ctx.scope.projectOf(task.id)
  if (!project) return
  const diamond = drawMilestoneDiamond(g, ctx, task, row, color)
  diamond?.addEventListener('click', () => {
    openTaskModal(ctx.plugin, project, { task, onSave: () => ctx.onRefresh() })
  })
}

export function renderMilestoneLabels(ctx: RendererContext): void {
  drawMilestoneLabels(ctx, ctx.statuses, visibleRows(ctx))
}

export function renderDependencyArrows(ctx: RendererContext): void {
  drawDependencyArrows(ctx, visibleRows(ctx))
}

function visibleRows(ctx: RendererContext): GanttRow[] {
  return ctx.flatTasks.filter((f) => f.visible || f.depth === 0).map((f) => ({ task: f.task, depth: f.depth }))
}
