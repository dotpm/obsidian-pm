import { getIcon } from 'obsidian'
import { type FilterState, type Project, type ViewMode, flattenTasks, PRIORITY_ICON_SETS } from '@dotpm/core'
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  taskResources,
  toProjectResource,
  type ProjectSummary,
  type Snapshot,
  type SnapshotProject
} from '@dotpm/api'
import type { SortDir, SortKey } from '@dotpm/ui'
import type PMPlugin from '../main'
import type { ProjectScope } from '../store'

export interface ExportViewState {
  mode: ViewMode
  filter: FilterState
  sortKey: SortKey
  sortDir: SortDir
}

/** Icons the page chrome and the composites ask for by name, whatever the data holds. */
const CHROME_ICONS = [
  'plus',
  'x',
  'check',
  'chevron-down',
  'chevron-right',
  'right-triangle',
  'more-horizontal',
  'calendar',
  'link-2',
  'clock',
  'repeat',
  'table',
  'git-fork',
  'layout-dashboard'
]

function summarize(plugin: PMPlugin, project: Project): ProjectSummary {
  const complete = new Set(
    plugin.store
      .configFor(project)
      .statuses.filter((status) => status.complete)
      .map((status) => status.id)
  )
  const live = flattenTasks(project.tasks).filter((f) => !f.task.archived)
  return {
    id: project.id,
    path: project.filePath,
    title: project.title,
    icon: project.icon,
    color: project.color,
    parentId: plugin.index.parentOf(project.filePath)?.id ?? null,
    taskCount: live.length,
    doneCount: live.filter((f) => complete.has(f.task.status)).length
  }
}

function iconMarkup(names: Iterable<string>): Record<string, string> {
  const icons: Record<string, string> = {}
  for (const name of names) {
    if (!name || icons[name] !== undefined) continue
    const svg = getIcon(name)
    if (svg) icons[name] = svg.outerHTML
  }
  return icons
}

export async function buildSnapshot(plugin: PMPlugin, scope: ProjectScope, view: ExportViewState): Promise<Snapshot> {
  const primary = scope.primary
  if (!primary) throw new Error('nothing to export: the scope holds no project')

  const projects: SnapshotProject[] = []
  const iconNames = new Set<string>(CHROME_ICONS)
  for (const set of Object.values(PRIORITY_ICON_SETS)) for (const name of set) iconNames.add(name)

  for (const project of scope.projects) {
    await Promise.all(flattenTasks(project.tasks).map(({ task }) => plugin.store.loadTaskBody(task)))
    const config = plugin.store.configFor(project)
    for (const status of config.statuses) iconNames.add(status.icon)
    for (const priority of config.priorities) iconNames.add(priority.icon)
    for (const field of config.customFields) if (field.icon) iconNames.add(field.icon)
    iconNames.add(project.icon)
    projects.push({
      ...toProjectResource(project, config, summarize(plugin, project)),
      tasks: taskResources(project, project.id, true)
    })
  }

  const config = scope.config
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    generator: { name: 'dotpm', version: plugin.manifest.version },
    exportedAt: new Date().toISOString(),
    title: scope.label(),
    primaryProjectId: primary.id,
    view: {
      mode: view.mode,
      filter: { ...view.filter },
      sortKey: view.sortKey,
      sortDir: view.sortDir,
      ganttGranularity: plugin.settings.ganttGranularity
    },
    settings: {
      priorityIcons: config.priorityIcons,
      showTagColors: plugin.settings.showTagColors,
      showSubtreeConnections: config.showSubtreeConnections,
      lineBorders: config.lineBorders,
      kanbanShowSubtasks: config.kanbanShowSubtasks,
      ganttWeekLabel: plugin.settings.ganttWeekLabel
    },
    projects,
    icons: iconMarkup(iconNames)
  }
}
