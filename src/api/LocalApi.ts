import type { Project, Task } from '@dotpm/core'
import { displayName, findParentId, findTaskById, flattenTasks, makeTask } from '@dotpm/core'
import {
  ApiRequestError,
  parseTaskCreate,
  parseTaskMove,
  parseTaskWrite,
  taskPatch,
  taskResources,
  toProjectResource,
  toTaskResource,
  type ChangePage,
  type DomainApi,
  type ProjectResource,
  type ProjectSummary,
  type TaskResource,
  type TaskSearch,
  type TaskWrite
} from '@dotpm/api'
import type PMPlugin from '../main'
import type { ProjectRef } from '../store'
import { ChangeLog } from './ChangeLog'

const SCHEDULE_FIELDS: Array<keyof TaskWrite> = ['start', 'due', 'dependencies', 'status', 'type']

function notFound(what: string, id: string): never {
  throw new ApiRequestError('not_found', `${what} ${id} not found`)
}

/** The contract over this vault: ids resolve through the index, data through the store. */
export class LocalApi implements DomainApi {
  readonly changeLog = new ChangeLog()
  /** Task id to project path for every task served so far. The index learns about a new
   * file only once the metadata cache has parsed it, and a client that just created a
   * task reads it back before then. */
  private readonly known = new Map<string, string>()

  constructor(private readonly plugin: PMPlugin) {}

  /** Feeds the change log from the store and the index. Returns the unsubscribe function. */
  attach(): () => void {
    const offStore = this.plugin.store.onProjectChanged((path) => {
      void (async () => {
        const project = await this.plugin.store.loadProjectByPath(path)
        if (project) this.changeLog.observe(project, true)
      })()
    })
    const offIndex = this.plugin.index.onChange(() => {
      for (const path of this.changeLog.trackedPaths()) {
        if (!this.plugin.index.projectRef(path)) this.changeLog.forget(path)
      }
    })
    return () => {
      offStore()
      offIndex()
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.plugin.index.projectRefs().map((ref) => this.summary(ref))
  }

  async getProject(projectId: string): Promise<ProjectResource> {
    const ref = this.refById(projectId)
    const project = await this.load(ref)
    return toProjectResource(project, this.plugin.store.configFor(project), this.summary(ref))
  }

  async listTasks(projectId: string, includeArchived = false): Promise<TaskResource[]> {
    const ref = this.refById(projectId)
    const project = await this.load(ref)
    await Promise.all(flattenTasks(project.tasks).map(({ task }) => this.plugin.store.loadTaskBody(task)))
    return taskResources(project, ref.id, includeArchived)
  }

  async getTask(taskId: string): Promise<TaskResource> {
    const { project, ref, task } = await this.locate(taskId)
    return this.serve(project, ref, task)
  }

  async searchTasks(search: TaskSearch): Promise<TaskResource[]> {
    const query = search.query?.toLowerCase()
    const projectPath = search.projectId ? this.refById(search.projectId).path : undefined
    const assignee = search.assignee ? displayName(search.assignee).toLowerCase() : undefined
    const limit = search.limit ?? 50
    const hits = this.plugin.index.allTaskRefs().filter((ref) => {
      if (ref.archived && !search.includeArchived) return false
      if (projectPath && ref.projectPath !== projectPath) return false
      if (search.status && ref.status !== search.status) return false
      if (query && !ref.title.toLowerCase().includes(query)) return false
      if (assignee && !ref.assignees.some((raw) => displayName(raw).toLowerCase() === assignee)) return false
      return true
    })
    const out: TaskResource[] = []
    for (const hit of hits) {
      if (out.length >= limit) break
      if (!hit.projectPath) continue
      const ref = this.plugin.index.projectRef(hit.projectPath)
      if (!ref) continue
      const project = await this.load(ref)
      const task = findTaskById(project, hit.id)
      if (task) out.push(await this.serve(project, ref, task))
    }
    return out
  }

  async createTask(projectId: string, input: unknown): Promise<TaskResource> {
    const ref = this.refById(projectId)
    const project = await this.load(ref)
    const create = parseTaskCreate(input, this.plugin.store.configFor(project))
    if (create.parentId && !findTaskById(project, create.parentId)) notFound('parent task', create.parentId)
    const task = makeTask(taskPatch(create))
    await this.plugin.store.insertTask(project, task, create.parentId ?? null)
    this.known.set(task.id, project.filePath)
    await this.plugin.store.scheduleAfterChange(project, task.id)
    this.plugin.refreshViews()
    return this.serve(project, ref, this.taskOf(project, task.id))
  }

  async updateTask(taskId: string, input: unknown, expectedUpdatedAt?: string): Promise<TaskResource> {
    const { project, ref, task } = await this.locate(taskId)
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== task.updatedAt) {
      throw new ApiRequestError('conflict', `task ${taskId} changed at ${task.updatedAt}`)
    }
    const write = parseTaskWrite(input, this.plugin.store.configFor(project))
    await this.plugin.store.updateTask(project, taskId, taskPatch(write))
    if (SCHEDULE_FIELDS.some((field) => write[field] !== undefined)) {
      await this.plugin.store.scheduleAfterChange(project, taskId)
    }
    this.plugin.refreshViews()
    return this.serve(project, ref, this.taskOf(project, taskId))
  }

  async moveTask(taskId: string, input: unknown): Promise<TaskResource> {
    const move = parseTaskMove(input)
    const located = await this.locate(taskId)
    let { project, ref } = located
    const store = this.plugin.store

    if (move.projectId !== undefined && move.projectId !== ref.id) {
      const targetRef = this.refById(move.projectId)
      const target = await this.load(targetRef)
      const parentId = move.parentId ?? null
      if (parentId && !findTaskById(target, parentId)) notFound('parent task', parentId)
      await store.moveTaskToProject(project, target, taskId, parentId)
      project = target
      ref = targetRef
    } else if (move.parentId !== undefined && move.parentId !== findParentId(project, taskId)) {
      if (move.parentId && !findTaskById(project, move.parentId)) notFound('parent task', move.parentId)
      if (move.parentId && this.inSubtree(located.task, move.parentId)) {
        throw new ApiRequestError('invalid', 'a task cannot be moved under itself')
      }
      await store.moveTask(project, taskId, move.parentId)
    }

    const sibling = move.before ?? move.after
    if (sibling) {
      if (!findTaskById(project, sibling)) notFound('sibling task', sibling)
      if (findParentId(project, sibling) !== findParentId(project, taskId)) {
        throw new ApiRequestError('invalid', 'before and after must name a sibling; pass parentId to re-parent first')
      }
      await store.reorderTask(project, taskId, sibling, move.before ? 'before' : 'after')
    }
    this.plugin.refreshViews()
    return this.serve(project, ref, this.taskOf(project, taskId))
  }

  async archiveTask(taskId: string, archived: boolean): Promise<TaskResource> {
    const { project, ref, task } = await this.locate(taskId)
    if (archived && !task.archived) await this.plugin.store.archiveTask(project, taskId)
    if (!archived && task.archived) await this.plugin.store.unarchiveTask(project, taskId)
    this.plugin.refreshViews()
    return this.serve(project, ref, this.taskOf(project, taskId))
  }

  async deleteTask(taskId: string): Promise<void> {
    const { project } = await this.locate(taskId)
    await this.plugin.store.deleteTask(project, taskId)
    this.plugin.refreshViews()
  }

  async changes(since: number | null): Promise<ChangePage> {
    return this.changeLog.since(since)
  }

  private refById(projectId: string): ProjectRef {
    return this.plugin.index.projectRefs().find((ref) => ref.id === projectId) ?? notFound('project', projectId)
  }

  private summary(ref: ProjectRef): ProjectSummary {
    const counts = this.plugin.index.counts(ref)
    return {
      id: ref.id,
      path: ref.path,
      title: ref.title,
      icon: ref.icon,
      color: ref.color,
      parentId: this.plugin.index.parentOf(ref.path)?.id ?? null,
      taskCount: counts.total,
      doneCount: counts.done
    }
  }

  private async load(ref: ProjectRef): Promise<Project> {
    const project = (await this.plugin.store.loadProjectByPath(ref.path)) ?? notFound('project', ref.id)
    this.changeLog.observe(project, false)
    for (const { task } of flattenTasks(project.tasks)) this.known.set(task.id, project.filePath)
    return project
  }

  private async locate(taskId: string): Promise<{ project: Project; ref: ProjectRef; task: Task }> {
    const path = this.plugin.index.task(taskId)?.projectPath ?? this.known.get(taskId) ?? notFound('task', taskId)
    const ref = this.plugin.index.projectRef(path) ?? notFound('task', taskId)
    const project = await this.load(ref)
    return { project, ref, task: this.taskOf(project, taskId) }
  }

  private taskOf(project: Project, taskId: string): Task {
    return findTaskById(project, taskId) ?? notFound('task', taskId)
  }

  /** The task as a client sees it, with its note body loaded. */
  private async serve(project: Project, ref: ProjectRef, task: Task): Promise<TaskResource> {
    await this.plugin.store.loadTaskBody(task)
    const parentId = findParentId(project, task.id)
    const siblings = parentId ? (findTaskById(project, parentId)?.subtasks ?? []) : project.tasks
    return toTaskResource(task, ref.id, parentId, siblings.indexOf(task))
  }

  private inSubtree(root: Task, id: string): boolean {
    return root.id === id || root.subtasks.some((sub) => this.inSubtree(sub, id))
  }
}
