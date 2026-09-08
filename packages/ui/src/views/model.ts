import {
  type CustomFieldDef,
  type FilterState,
  type GanttGranularity,
  type GanttWeekLabel,
  type LineBorders,
  type PriorityConfig,
  type PriorityIconSet,
  type ResolvedProjectConfig,
  type StatusConfig,
  type Task,
  flattenTasks,
  mergeById
} from '@dotpm/core'
import type { SortDir, SortKey } from './tableSort'

export interface ViewProject {
  id: string
  title: string
  color: string
  icon: string
  tasks: Task[]
  config: ResolvedProjectConfig
}

export interface ViewSettings {
  priorityIcons: PriorityIconSet
  showTagColors: boolean
  showSubtreeConnections: boolean
  lineBorders: LineBorders
  kanbanShowSubtasks: boolean
  ganttWeekLabel: GanttWeekLabel
  ganttGranularity: GanttGranularity
}

/**
 * Everything the read-only views need, resolved by whoever holds the data: the plugin
 * from a scope, a page from a snapshot. Projects come primary first.
 */
export interface ViewModel {
  projects: ViewProject[]
  settings: ViewSettings
  filter: FilterState
  sortKey: SortKey
  sortDir: SortDir
}

export function isMulti(model: ViewModel): boolean {
  return model.projects.length > 1
}

export function allTasks(model: ViewModel): Task[] {
  return model.projects.flatMap((project) => project.tasks)
}

export function projectOf(model: ViewModel, taskId: string): ViewProject | null {
  for (const project of model.projects) {
    if (flattenTasks(project.tasks).some((f) => f.task.id === taskId)) return project
  }
  return null
}

export function configOf(model: ViewModel, taskId: string): ResolvedProjectConfig {
  return projectOf(model, taskId)?.config ?? mergedConfig(model)
}

/** Statuses and priorities of every project merged by id, primary first, for columns and headers. */
export function mergedConfig(model: ViewModel): ResolvedProjectConfig {
  const base = model.projects[0].config
  if (!isMulti(model)) return base
  return {
    ...base,
    statuses: mergeById<StatusConfig>(model.projects.map((p) => p.config.statuses)),
    priorities: mergeById<PriorityConfig>(model.projects.map((p) => p.config.priorities))
  }
}

export function customFieldColumns(model: ViewModel): CustomFieldDef[] {
  if (!isMulti(model)) return model.projects[0].config.customFields
  return mergeById(model.projects.map((p) => p.config.customFields))
}
