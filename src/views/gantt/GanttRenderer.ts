import type PMPlugin from '#main'
import type { Project, StatusConfig, Task } from '@dotpm/core'
import type { ProjectScope } from '#store'
import type { GanttCanvas, GanttRow, LabelSource } from '@dotpm/ui'
import type { DragState } from './GanttDragHandler'
import type { LinkState } from './GanttLinkHandler'

export { renderGridLines, renderTodayLine, renderTimelineHeader } from '@dotpm/ui'
export { renderTaskBar, renderProjectSpan, renderMilestoneLabels, renderDependencyArrows } from './GanttTaskBarRenderer'

/**
 * One row of the timeline, top to bottom. With several projects in view each one heads its
 * own tasks; folded, it keeps only that row.
 */
export type TimelineRow =
  | { kind: 'project'; project: Project; tasks: Task[]; collapsed: boolean }
  | { kind: 'task'; task: Task; depth: number }

/** The drawing surfaces plus everything the interactive layer needs to edit through them. */
export interface RendererContext extends GanttCanvas {
  plugin: PMPlugin
  scope: ProjectScope
  /** Resolved once per render pass. */
  statuses: StatusConfig[]
  /** The timeline label fields past the title, in order. */
  labelFields: string[]
  labelSource: LabelSource
  /** The task rows, each with its place on the canvas. */
  taskRows: GanttRow[]
  /** Every row drawn, project rows included. */
  rowCount: number
  drag: DragState
  link: LinkState
  onRefresh: () => Promise<void>
  cleanupFns: (() => void)[]
}
