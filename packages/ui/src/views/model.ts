import {
  type CustomFieldDef,
  type FilterContext,
  type FilterState,
  type TaskQuery,
  type GanttGranularity,
  type GanttWeekLabel,
  type LineBorders,
  type PriorityConfig,
  type PriorityIconSet,
  type ResolvedProjectConfig,
  type SortRule,
  type StatusConfig,
  type Task,
  displayName,
  flattenTasks,
  mergeById
} from '@dotpm/core'
import type { AvatarPerson } from '../primitives/AvatarStack'

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
  sort: SortRule[]
  projects: ViewProject[]
  settings: ViewSettings
  filter: FilterState
  /** A person value, as stored, to the color its note sets. */
  personColors: Record<string, string>
}

export function personOf(model: ViewModel, raw: string): AvatarPerson {
  return { name: displayName(raw), color: model.personColors[raw] }
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

/** A page has no search box, so its query is the filter the export started from. */
export function queryOf(model: ViewModel): TaskQuery {
  return { filter: model.filter, text: '' }
}

export function filterContextOf(model: ViewModel): FilterContext {
  return {
    statuses: mergedConfig(model).statuses,
    customFields: customFieldColumns(model),
    projectOf: (task) => projectOf(model, task.id)?.id
  }
}
