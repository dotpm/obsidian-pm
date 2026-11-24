import { Notice } from 'obsidian'
import type PMPlugin from '#main'
import {
  type Project,
  type Task,
  collectAllAssignees,
  collectAllTags,
  dedupePeople,
  displayName,
  findParentId,
  findTaskById,
  flattenTasks,
  isTerminalStatus,
  parsePlainDate,
  t,
  tn,
  today
} from '@dotpm/core'
import { personKeyer, type ProjectRef, type ProjectScope } from '#store'
import { safeAsync } from '@dotpm/ui'
import {
  confirmDialog,
  confirmDuplicateSubtasks,
  openProjectPicker,
  openTaskModal,
  openTaskPicker,
  promptText
} from '#ui/ModalFactory'
import { openChoice, type Choice } from './choice'
import type { ActionHandlers } from './keymap'
import type { KeyboardSurface } from './types'

export interface TaskActionContext {
  plugin: PMPlugin
  scope: ProjectScope
  refresh: () => Promise<void>
  surface: () => KeyboardSurface | null
  activeId: () => string | null
  targetIds: () => string[]
  /** Runs a picker's mutation on the same queue as the key that opened it. */
  enqueue: (fn: () => void | Promise<void>) => void
}

interface TaskEntry {
  project: Project
  task: Task
}

interface UndoPatch {
  project: Project
  taskId: string
  patch: Partial<Task>
}

function entriesFor(ctx: TaskActionContext, ids: string[]): TaskEntry[] {
  const entries: TaskEntry[] = []
  for (const id of ids) {
    const project = ctx.scope.projectOf(id)
    const task = project ? findTaskById(project, id) : null
    if (project && task) entries.push({ project, task })
  }
  return entries
}

function activeEntry(ctx: TaskActionContext): TaskEntry | null {
  const id = ctx.activeId()
  return id ? (entriesFor(ctx, [id])[0] ?? null) : null
}

function targetEntries(ctx: TaskActionContext): TaskEntry[] {
  return entriesFor(ctx, ctx.targetIds())
}

function groupEntries(entries: TaskEntry[]): Map<Project, TaskEntry[]> {
  const groups = new Map<Project, TaskEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.project)
    if (group) group.push(entry)
    else groups.set(entry.project, [entry])
  }
  return groups
}

/** The values a patch replaces, cloned so a later save cannot change them. */
function captureBefore(task: Task, patch: Partial<Task>): Partial<Task> {
  const keys = new Set(Object.keys(patch))
  // A status patch also stamps or clears the completion date, so both sides of an undo need it.
  if ('status' in patch) keys.add('completed')
  const before: Record<string, unknown> = {}
  for (const key of keys) before[key] = structuredClone(task[key as keyof Task])
  return before
}

async function applyPatches(ctx: TaskActionContext, patches: UndoPatch[]): Promise<void> {
  const groups = new Map<Project, Map<string, Partial<Task>>>()
  for (const { project, taskId, patch } of patches) {
    let byTask = groups.get(project)
    if (!byTask) {
      byTask = new Map()
      groups.set(project, byTask)
    }
    byTask.set(taskId, patch)
  }
  for (const [project, byTask] of groups) {
    await ctx.plugin.store.updateTasks(project, [...byTask.keys()], (task) => byTask.get(task.id) ?? null)
  }
  for (const { project, taskId, patch } of patches) {
    if ('due' in patch || 'start' in patch) await ctx.plugin.store.scheduleAfterChange(project, taskId)
  }
  await ctx.refresh()
}

async function patchTasks(
  ctx: TaskActionContext,
  entries: TaskEntry[],
  make: (task: Task, project: Project) => Partial<Task> | null,
  after?: (entries: TaskEntry[]) => Promise<void>
): Promise<void> {
  try {
    const before: UndoPatch[] = []
    const changed: UndoPatch[] = []
    for (const [project, group] of groupEntries(entries)) {
      const byTask = new Map<string, Partial<Task>>()
      for (const { task } of group) {
        const patch = make(task, project)
        if (!patch || Object.keys(patch).length === 0) continue
        before.push({ project, taskId: task.id, patch: captureBefore(task, patch) })
        changed.push({ project, taskId: task.id, patch })
        byTask.set(task.id, patch)
      }
      if (byTask.size) {
        await ctx.plugin.store.updateTasks(project, [...byTask.keys()], (task) => byTask.get(task.id) ?? null)
      }
    }
    if (!changed.length) return
    ctx.plugin.pushUndo({
      undo: () => applyPatches(ctx, before),
      redo: () => applyPatches(ctx, changed)
    })
    if (after) await after(entries)
    await ctx.refresh()
  } catch (err) {
    console.error('Keyboard action failed', err)
    new Notice(t('bulk.failed'))
    await ctx.refresh()
  }
}

function openNew(ctx: TaskActionContext, parentId: string | null): void {
  // A column's value comes from one project's palette, so a multi-project scope asks
  // which project first and starts from that project's defaults instead.
  const defaults = ctx.scope.isMulti ? undefined : (ctx.surface()?.newTaskDefaults?.() ?? undefined)
  const open = (project: Project): void => {
    openTaskModal(ctx.plugin, project, {
      defaults: defaults ?? undefined,
      parentId,
      onSave: ctx.refresh
    })
  }
  if (!ctx.scope.isMulti) {
    const primary = ctx.scope.primary
    if (primary) open(primary)
    return
  }
  const refs = ctx.scope.projects
    .map((project) => ctx.plugin.index.projectRef(project.filePath))
    .filter((ref): ref is ProjectRef => !!ref)
  openProjectPicker(
    ctx.plugin,
    refs,
    safeAsync(async (ref) => {
      const project = await ctx.plugin.store.loadProjectByPath(ref.path)
      if (project) open(project)
    })
  )
}

function cycle<T extends { id: string }>(items: T[], current: string, delta: 1 | -1): string | null {
  if (!items.length) return null
  const index = items.findIndex((item) => item.id === current)
  if (index === -1) return items[delta > 0 ? 0 : items.length - 1].id
  return items[(index + delta + items.length) % items.length].id
}

function askProjectToMoveTo(ctx: TaskActionContext, entries: TaskEntry[]): void {
  const current = new Set(entries.map((entry) => entry.project.filePath))
  const refs = ctx.plugin.index.projectRefs().filter((ref) => !current.has(ref.path))
  if (!refs.length) {
    new Notice(t('taskMenu.noOtherProject'))
    return
  }
  openProjectPicker(ctx.plugin, refs, (ref) => {
    ctx.enqueue(async () => {
      const target = await ctx.plugin.store.loadProjectByPath(ref.path)
      if (!target) return
      for (const { project, task } of entries) await ctx.plugin.store.moveTaskToProject(project, target, task.id)
      new Notice(t('taskMenu.moved', { title: entries[0].task.title, project: target.title }))
      await ctx.refresh()
    })
  })
}

function askParent(ctx: TaskActionContext, entries: TaskEntry[]): void {
  const projects = new Set(entries.map((entry) => entry.project.filePath))
  if (projects.size !== 1) return
  const project = entries[0].project
  const selected = new Set(entries.map((entry) => entry.task.id))
  const excluded = new Set(selected)
  for (const id of selected) {
    const task = findTaskById(project, id)
    if (!task) continue
    for (const child of flattenTasks(task.subtasks)) excluded.add(child.task.id)
  }
  const candidates = flattenTasks(project.tasks)
    .filter((flat) => !excluded.has(flat.task.id))
    .map((flat) => flat.task)
  openTaskPicker(ctx.plugin, candidates, (chosen) => {
    ctx.enqueue(async () => {
      await ctx.plugin.store.moveTasks(project, [...selected], chosen.id)
      await ctx.refresh()
    })
  })
}

function askDueDate(ctx: TaskActionContext, entries: TaskEntry[]): void {
  const now = today()
  const ahead = (days: number): string => now.add({ days }).toString()
  const choices: Choice<string>[] = [
    { label: t('bulk.today', { date: ahead(0) }), value: ahead(0) },
    { label: t('bulk.tomorrow', { date: ahead(1) }), value: ahead(1) },
    { label: t('bulk.inOneWeek', { date: ahead(7) }), value: ahead(7) },
    { label: t('bulk.inTwoWeeks', { date: ahead(14) }), value: ahead(14) },
    { label: t('bulk.pickDate'), value: '__pick' },
    { label: t('bulk.clearDueDate'), value: '' }
  ]
  const apply = (due: string): void => {
    ctx.enqueue(() =>
      patchTasks(
        ctx,
        entries,
        () => ({ due }),
        async (changed) => {
          for (const { project, task } of changed) await ctx.plugin.store.scheduleAfterChange(project, task.id)
        }
      )
    )
  }
  openChoice(ctx.plugin.app, t('keyboard.due'), choices, (value) => {
    if (value !== '__pick') {
      apply(value)
      return
    }
    void safeAsync(async () => {
      const typed = await promptText(ctx.plugin.app, t('keyboard.due'), 'YYYY-MM-DD', now.toString())
      if (typed === null) return
      const date = parsePlainDate(typed.trim())
      if (!date) {
        new Notice(t('keyboard.invalidDate'))
        return
      }
      apply(date.toString())
    })()
  })
}

function askAssignee(ctx: TaskActionContext, entries: TaskEntry[]): void {
  const people = dedupePeople(
    [...ctx.plugin.settings.globalTeamMembers, ...ctx.scope.teamMembers(), ...collectAllAssignees(ctx.scope.tasks())],
    personKeyer(ctx.plugin.app)
  )
  const choices: Choice<string>[] = people.map((person) => ({
    label: displayName(person),
    value: person
  }))
  choices.push({ label: t('keyboard.clearAssignees'), value: '' })
  openChoice(ctx.plugin.app, t('keyboard.assign'), choices, (person) => {
    ctx.enqueue(() =>
      patchTasks(ctx, entries, (task) => ({
        assignees: person ? [...new Set([...task.assignees, person])] : []
      }))
    )
  })
}

function askTag(ctx: TaskActionContext, entries: TaskEntry[]): void {
  const tags = collectAllTags(ctx.scope.tasks())
  const choices: Choice<string>[] = tags.map((tag) => ({ label: `#${tag}`, value: tag }))
  choices.push({ label: t('bulk.newTag'), value: '__new' })
  choices.push({ label: t('bulk.clearTags'), value: '' })
  const apply = (tag: string): void => {
    ctx.enqueue(() =>
      patchTasks(ctx, entries, (task) => ({
        tags: tag ? [...new Set([...task.tags, tag])] : []
      }))
    )
  }
  openChoice(ctx.plugin.app, t('keyboard.tags'), choices, (tag) => {
    if (tag !== '__new') {
      apply(tag)
      return
    }
    void safeAsync(async () => {
      const typed = await promptText(ctx.plugin.app, t('bulk.enterTag'), t('bulk.tagPlaceholder'))
      if (typed?.trim()) apply(typed.trim().replace(/^#/, ''))
    })()
  })
}

function askMove(ctx: TaskActionContext, entries: TaskEntry[]): void {
  const choices: Choice<'project' | 'parent' | 'none'>[] = [{ label: t('taskMenu.moveToProject'), value: 'project' }]
  const oneProject = new Set(entries.map((entry) => entry.project.filePath)).size === 1
  if (oneProject) choices.push({ label: t('keyboard.setParent'), value: 'parent' })
  if (oneProject && entries.some((entry) => findParentId(entry.project, entry.task.id))) {
    choices.push({ label: t('bulk.removeParent'), value: 'none' })
  }
  openChoice(ctx.plugin.app, t('keyboard.move'), choices, (choice) => {
    if (choice === 'project') {
      askProjectToMoveTo(ctx, entries)
      return
    }
    if (choice === 'parent') {
      askParent(ctx, entries)
      return
    }
    const project = entries[0].project
    ctx.enqueue(async () => {
      await ctx.plugin.store.moveTasks(
        project,
        entries.map((entry) => entry.task.id),
        null
      )
      await ctx.refresh()
    })
  })
}

/** The actions every task surface shares. A view adds back its own search, modes and so on. */
export function taskActionHandlers(ctx: TaskActionContext): ActionHandlers {
  return {
    open: () => {
      const entry = activeEntry(ctx)
      if (!entry) return
      openTaskModal(ctx.plugin, entry.project, {
        task: entry.task,
        onSave: ctx.refresh
      })
    },

    new: () => openNew(ctx, null),

    newSubtask: () => {
      const entry = activeEntry(ctx)
      if (!entry) return
      openTaskModal(ctx.plugin, entry.project, {
        parentId: entry.task.id,
        defaults: { type: 'subtask' },
        onSave: ctx.refresh
      })
    },

    toggleDone: () => {
      const entries = targetEntries(ctx)
      return patchTasks(ctx, entries, (task, project) => {
        const statuses = ctx.plugin.store.configFor(project).statuses
        const done = statuses.find((status) => status.complete)
        const open = statuses.find((status) => !status.complete) ?? statuses[0]
        const next = isTerminalStatus(task.status, statuses) ? open : done
        return next ? { status: next.id } : null
      })
    },

    statusNext: () => {
      const entries = targetEntries(ctx)
      return patchTasks(ctx, entries, (task, project) => {
        const next = cycle(ctx.plugin.store.configFor(project).statuses, task.status, 1)
        return next ? { status: next } : null
      })
    },

    statusPrev: () => {
      const entries = targetEntries(ctx)
      return patchTasks(ctx, entries, (task, project) => {
        const next = cycle(ctx.plugin.store.configFor(project).statuses, task.status, -1)
        return next ? { status: next } : null
      })
    },

    priorityNext: () => {
      const entries = targetEntries(ctx)
      return patchTasks(ctx, entries, (task, project) => {
        const next = cycle(ctx.plugin.store.configFor(project).priorities, task.priority, 1)
        return next ? { priority: next } : null
      })
    },

    priorityPrev: () => {
      const entries = targetEntries(ctx)
      return patchTasks(ctx, entries, (task, project) => {
        const next = cycle(ctx.plugin.store.configFor(project).priorities, task.priority, -1)
        return next ? { priority: next } : null
      })
    },

    assign: () => {
      const entries = targetEntries(ctx)
      if (entries.length) askAssignee(ctx, entries)
    },

    due: () => {
      const entries = targetEntries(ctx)
      if (entries.length) askDueDate(ctx, entries)
    },

    tags: () => {
      const entries = targetEntries(ctx)
      if (entries.length) askTag(ctx, entries)
    },

    move: () => {
      const entries = targetEntries(ctx)
      if (entries.length) askMove(ctx, entries)
    },

    duplicate: () => {
      const entry = activeEntry(ctx)
      if (!entry) return
      safeAsync(async () => {
        let includeSubtasks = false
        if (entry.task.subtasks.length) {
          const choice = await confirmDuplicateSubtasks(ctx.plugin.app, entry.task.title)
          if (!choice) return
          includeSubtasks = choice === 'with-subtasks'
        }
        ctx.enqueue(async () => {
          await ctx.plugin.store.duplicateTask(entry.project, entry.task.id, includeSubtasks)
          await ctx.refresh()
        })
      })()
    },

    archive: () => {
      const entries = targetEntries(ctx)
      if (!entries.length) return
      const wasArchived = new Map(entries.map((entry) => [entry.task.id, !!entry.task.archived]))
      return (async () => {
        for (const [project, group] of groupEntries(entries)) {
          const live = group.filter((entry) => !wasArchived.get(entry.task.id)).map((entry) => entry.task.id)
          if (live.length) await ctx.plugin.store.archiveTasks(project, live)
          for (const entry of group.filter((item) => wasArchived.get(item.task.id))) {
            await ctx.plugin.store.unarchiveTask(project, entry.task.id)
          }
        }
        const count = entries.length
        new Notice(
          [...wasArchived.values()].every(Boolean)
            ? tn('table.unarchivedTasks', count)
            : tn('table.archivedTasks', count)
        )
        await ctx.refresh()
      })()
    },

    delete: () => {
      const entries = targetEntries(ctx)
      if (!entries.length) return
      safeAsync(async () => {
        const message =
          entries.length === 1
            ? t('task.deleteConfirm', { title: entries[0].task.title })
            : tn('table.deleteTasksConfirm', entries.length)
        if (!(await confirmDialog(ctx.plugin.app, message))) return
        ctx.enqueue(async () => {
          for (const [project, group] of groupEntries(entries)) {
            await ctx.plugin.store.deleteTasks(
              project,
              group.map((entry) => entry.task.id)
            )
          }
          const selection = ctx.surface()?.selection?.()
          if (selection) {
            selection.set(new Set())
            selection.onChange()
          }
          await ctx.refresh()
        })
      })()
    },

    undo: () =>
      (async () => {
        await ctx.plugin.undoLastAction()
        await ctx.refresh()
      })(),

    redo: () =>
      (async () => {
        await ctx.plugin.redoLastAction()
        await ctx.refresh()
      })()
  }
}
