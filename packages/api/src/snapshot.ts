import type { FilterState, GanttGranularity, GanttWeekLabel, LineBorders, PriorityIconSet, ViewMode } from '@dotpm/core'
import type { ProjectResource, TaskResource } from './contract'

export const SNAPSHOT_FORMAT = 'dotpm-snapshot'
export const SNAPSHOT_VERSION = 1

export interface SnapshotProject extends ProjectResource {
  tasks: TaskResource[]
}

export interface SnapshotView {
  mode: ViewMode
  filter: FilterState
  sortKey: string
  sortDir: 'asc' | 'desc'
  ganttGranularity: GanttGranularity
}

export interface SnapshotSettings {
  priorityIcons: PriorityIconSet
  showTagColors: boolean
  showSubtreeConnections: boolean
  lineBorders: LineBorders
  kanbanShowSubtasks: boolean
  ganttWeekLabel: GanttWeekLabel
}

/**
 * A self-contained picture of a view at one moment: the projects in scope with every task,
 * the view state the reader started from, and the icon glyphs the page needs, so nothing
 * has to be fetched to show it.
 */
export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT
  version: typeof SNAPSHOT_VERSION
  generator: { name: string; version: string }
  exportedAt: string
  title: string
  /** The project the view was opened from; first in `projects`. */
  primaryProjectId: string
  view: SnapshotView
  settings: SnapshotSettings
  projects: SnapshotProject[]
  /** Lucide id to the `<svg>` markup, for every icon a status, priority or the chrome uses. */
  icons: Record<string, string>
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record['format'] === SNAPSHOT_FORMAT && record['version'] === SNAPSHOT_VERSION && Array.isArray(record['projects'])
  )
}
