import type {
  FilterState,
  GroupState,
  SortRule,
  GanttGranularity,
  GanttWeekLabel,
  LineBorders,
  NonWorkingDays,
  PriorityIconSet,
  ViewFields,
  ViewMode
} from '@dotpm/core'
import type { ProjectResource, TaskResource } from './contract'

export const SNAPSHOT_FORMAT = 'dotpm-snapshot'
export const SNAPSHOT_VERSION = 2

/** Version 1 pages hold the filter as fixed facets; `hydrateFilter` reads either shape. */
const READABLE_VERSIONS: unknown[] = [1, SNAPSHOT_VERSION]

export interface SnapshotProject extends ProjectResource {
  tasks: TaskResource[]
}

export interface SnapshotView {
  mode: ViewMode
  /** Read through `hydrateFilter`: a version 1 page holds the older facet shape. */
  filter: FilterState
  /** Read through `hydrateSort`: a version 1 page holds one `sortKey` / `sortDir` pair. */
  sort: SortRule[]
  /** Absent on a page exported before boards could group by other fields; read through `hydrateGroup`. */
  group?: GroupState
  /** Absent on a page exported before views chose their fields; read through `hydrateFields`. */
  fields?: ViewFields
  ganttGranularity: GanttGranularity
  /** Absent on a page exported before the timeline could leave days out. */
  nonWorkingDays?: NonWorkingDays
}

export interface SnapshotSettings {
  priorityIcons: PriorityIconSet
  showTagColors: boolean
  showSubtreeConnections: boolean
  lineBorders: LineBorders
  /** Only on a version 1 page, where the board's subtask cards were a setting rather than a field. */
  kanbanShowSubtasks?: boolean
  ganttWeekLabel: GanttWeekLabel
  dateFormat: string
  holidays?: string[]
}

/**
 * A self-contained picture of a view at one moment: the projects in scope with every task,
 * the view state the reader started from, and the icon glyphs the page needs, so nothing
 * has to be fetched to show it.
 */
export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT
  version: number
  generator: { name: string; version: string }
  exportedAt: string
  /** The language tag the page's own text is shown in. */
  locale: string
  title: string
  /** The project the view was opened from; first in `projects`. */
  primaryProjectId: string
  view: SnapshotView
  settings: SnapshotSettings
  projects: SnapshotProject[]
  /** Lucide id to the `<svg>` markup, for every icon a status, priority or the chrome uses. */
  icons: Record<string, string>
  /** An assignee or person field value, as stored, to the color its person note sets. */
  personColors?: Record<string, string>
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record['format'] === SNAPSHOT_FORMAT &&
    READABLE_VERSIONS.includes(record['version']) &&
    Array.isArray(record['projects'])
  )
}
