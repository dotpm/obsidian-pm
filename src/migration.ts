import { Notice, TFile } from 'obsidian'
import type PMPlugin from './main'
import type { ScopeSpec } from './store'
import { isRefLink } from './store/refs'
import { parseFrontmatter, isOldFormat } from '@dotpm/core'

/** Rewrites projects whose tasks are embedded in frontmatter as one file per task. */
export async function migrateProjects(plugin: PMPlugin): Promise<void> {
  let migrated = 0

  for (const path of plugin.index.projectPaths()) {
    const file = plugin.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) continue
    try {
      const content = await plugin.app.vault.read(file)
      const parsed = parseFrontmatter(content)
      if (parsed.kind !== 'frontmatter' || parsed.frontmatter['pm-project'] !== true) continue
      if (!isOldFormat(parsed.frontmatter)) continue

      const project = await plugin.store.loadProject(file)
      if (!project || project.tasks.length === 0) continue

      new Notice(`Migrating project: ${project.title}...`)

      await plugin.store.saveProject(project)
      migrated++
    } catch (e) {
      console.error(`[PM] Migration failed for ${file.path}:`, e)
      new Notice(`dotpm: Migration failed for "${file.basename}". Check console for details.`)
    }
  }

  if (migrated > 0) {
    new Notice(`dotpm: Migrated ${migrated} project(s) to new format.`)
  }
}

const REF_KEYS = ['projectId', 'parentId', 'subtaskIds', 'dependencies', 'taskIds']

function holdsBareId(frontmatter: Record<string, unknown> | undefined): boolean {
  if (!frontmatter) return false
  for (const key of REF_KEYS) {
    const value = frontmatter[key]
    const entries = Array.isArray(value) ? value : [value]
    if (entries.some((entry) => typeof entry === 'string' && entry !== '' && !isRefLink(entry))) return true
  }
  return false
}

function frontmatterOf(plugin: PMPlugin, path: string): Record<string, unknown> | undefined {
  const file = plugin.app.vault.getAbstractFileByPath(path)
  return file instanceof TFile ? plugin.app.metadataCache.getFileCache(file)?.frontmatter : undefined
}

/**
 * Points the notes that still name a task or project by id at the note itself. Both forms
 * read the same, so this only makes a vault written across the change consistent. It reads
 * the frontmatter cache rather than the notes, and touches nothing in a vault that holds
 * no ids, which is what makes a second run free.
 */
export async function migrateTaskRefs(plugin: PMPlugin): Promise<void> {
  let rewritten = 0

  for (const path of plugin.index.projectPaths()) {
    const stale = plugin.index
      .taskRefs(path)
      .filter((ref) => holdsBareId(frontmatterOf(plugin, ref.path)))
      .map((ref) => ref.id)
    const projectNoteStale = holdsBareId(frontmatterOf(plugin, path))
    if (stale.length === 0 && !projectNoteStale) continue

    try {
      const project = await plugin.store.loadProjectByPath(path)
      if (!project) continue
      await plugin.store.normalizeTaskRefs(project, stale, projectNoteStale)
      rewritten += stale.length
    } catch (e) {
      console.error(`[PM] Failed to update the references in "${path}":`, e)
    }
  }

  if (rewritten > 0) {
    new Notice(`dotpm: Updated the references in ${rewritten} task note(s).`)
  }
}

interface ProjectMove {
  from: string
  to: string
  tasksFrom: string
  tasksTo: string
}

/**
 * Moves every project that still sits beside a `<name>_tasks` folder into a folder of its
 * own, then follows the moved paths through the settings and any open tab. Idempotent: a
 * project that already owns its folder is skipped, so a run interrupted halfway finishes
 * on the next launch.
 */
export async function migrateProjectLayout(plugin: PMPlugin): Promise<void> {
  const moves: ProjectMove[] = []
  // Read before the first move: a sub-project's parent link stops resolving once the
  // parent note moves, so the index can no longer answer who belongs to whom.
  const childrenOf = new Map<string, string[]>()
  for (const path of plugin.index.projectPaths()) {
    const children = plugin.index.childRefs(path).map((ref) => ref.path)
    if (children.length) childrenOf.set(path, children)
  }

  for (const path of plugin.index.projectPaths()) {
    try {
      const to = await plugin.store.moveProjectIntoOwnFolder(path)
      if (!to) continue
      moves.push({
        from: path,
        to,
        tasksFrom: path.replace(/\.md$/, '_tasks'),
        tasksTo: `${to.slice(0, to.lastIndexOf('/'))}/_tasks`
      })
    } catch (e) {
      console.error(`[PM] Failed to move "${path}" into its own folder:`, e)
      new Notice(`dotpm: Could not move "${path}" into its own folder. Check console for details.`)
    }
  }

  if (moves.length === 0) return

  for (const { from, to } of moves) {
    for (const child of childrenOf.get(from) ?? []) {
      await plugin.store.repointProjectParent(movedPath(child, moves) ?? child, to)
    }
  }

  remapProjectSettings(plugin, moves)
  retargetOpenViews(plugin, moves)
  await plugin.saveSettings()
  new Notice(`dotpm: Moved ${moves.length} project(s) into their own folders.`)
}

function movedPath(path: string, moves: ProjectMove[]): string | null {
  for (const move of moves) {
    if (path === move.from) return move.to
    if (path === move.tasksFrom) return move.tasksTo
    if (path.startsWith(move.tasksFrom + '/')) return move.tasksTo + path.slice(move.tasksFrom.length)
  }
  return null
}

/** Per-project filters, saved views and collapsed state are keyed by the project's path. */
function remapProjectSettings(plugin: PMPlugin, moves: ProjectMove[]): void {
  const { projectFilters, scopeViews, collapsedTasks, collapsedProjects } = plugin.settings

  for (const { from, to } of moves) {
    for (const kind of ['project', 'subtree']) {
      const oldKey = `${kind}:${from}`
      const newKey = `${kind}:${to}`
      const filter = projectFilters[oldKey]
      if (filter) {
        projectFilters[newKey] = filter
        Reflect.deleteProperty(projectFilters, oldKey)
      }
      const views = scopeViews[oldKey]
      if (views) {
        scopeViews[newKey] = views
        Reflect.deleteProperty(scopeViews, oldKey)
      }
    }

    const collapsed = collapsedTasks[from]
    if (collapsed) {
      collapsedTasks[to] = collapsed
      Reflect.deleteProperty(collapsedTasks, from)
    }

    const at = collapsedProjects.indexOf(from)
    if (at !== -1) collapsedProjects[at] = to
  }
}

/** The workspace restores its tabs before this runs, so open views still hold old paths. */
function retargetOpenViews(plugin: PMPlugin, moves: ProjectMove[]): void {
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    const viewState = leaf.getViewState()
    const state = { ...(viewState.state as Record<string, unknown>) }
    let changed = false

    for (const key of ['filePath', 'projectPath']) {
      const value = state[key]
      const moved = typeof value === 'string' ? movedPath(value, moves) : null
      if (moved) {
        state[key] = moved
        changed = true
      }
    }

    const scope = state.scope as ScopeSpec | undefined
    if (scope && scope.kind !== 'vault') {
      const moved = movedPath(scope.path, moves)
      if (moved) {
        state.scope = { ...scope, path: moved }
        changed = true
      }
    }

    if (changed) void leaf.setViewState({ ...viewState, state })
  })
}
