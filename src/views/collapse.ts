import { type PMSettings, type Project, flattenTasks } from '@dotpm/core'

/**
 * Which parents are collapsed is the reader's own state, so it is read from settings at
 * render time and never carried on the task objects a reload replaces. Task ids are unique
 * across the vault, so a scope covering several projects reads one merged set.
 */
export function collapsedTaskIds(settings: PMSettings, projects: Project[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const project of projects) {
    for (const id of settings.collapsedTasks[project.filePath] ?? []) ids.add(id)
  }
  return ids
}

export function toggleCollapsed(settings: PMSettings, project: Project, taskId: string): void {
  const ids = settings.collapsedTasks[project.filePath] ?? []
  const at = ids.indexOf(taskId)
  if (at === -1) ids.push(taskId)
  else ids.splice(at, 1)
  settings.collapsedTasks[project.filePath] = ids
}

/** The projects in a timeline covering several that are folded to their own row. */
export function collapsedProjectRows(settings: PMSettings, projects: Project[]): ReadonlySet<string> {
  const folded = new Set(settings.collapsedProjectRows)
  return new Set(projects.map((project) => project.filePath).filter((path) => folded.has(path)))
}

export function toggleProjectRow(settings: PMSettings, project: Project): void {
  const paths = settings.collapsedProjectRows
  const at = paths.indexOf(project.filePath)
  if (at === -1) paths.push(project.filePath)
  else paths.splice(at, 1)
}

/** `projectRows` folds or unfolds the projects' own rows too, for a timeline that draws them. */
export function setAllCollapsed(
  settings: PMSettings,
  projects: Project[],
  collapsed: boolean,
  projectRows = false
): void {
  for (const project of projects) {
    settings.collapsedTasks[project.filePath] = collapsed
      ? flattenTasks(project.tasks)
          .filter((flat) => flat.task.subtasks.length > 0)
          .map((flat) => flat.task.id)
      : []
  }
  if (!projectRows) return
  const paths = new Set(projects.map((project) => project.filePath))
  const others = settings.collapsedProjectRows.filter((path) => !paths.has(path))
  settings.collapsedProjectRows = collapsed ? [...others, ...paths] : others
}
