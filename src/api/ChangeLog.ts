import type { Project, Task } from '@dotpm/core'
import type { Change, ChangePage } from '@dotpm/api'

interface Snapshot {
  projectId: string
  updatedAt: string
  /** Task id to a fingerprint of what a client would see for it. */
  tasks: Map<string, string>
}

function fingerprints(tasks: Task[], parentId: string | null, out: Map<string, string>): void {
  tasks.forEach((task, position) => {
    out.set(task.id, `${task.updatedAt}|${parentId ?? ''}|${position}|${task.archived ? 'a' : ''}`)
    fingerprints(task.subtasks, task.id, out)
  })
}

/**
 * A bounded log of what changed, for clients polling `changes`. It learns about
 * changes by comparing a project against the last time it saw it, so it only covers
 * projects that have been loaded in this session.
 */
export class ChangeLog {
  private seq = 0
  private entries: Change[] = []
  private snapshots = new Map<string, Snapshot>()

  constructor(private readonly capacity = 1000) {}

  get cursor(): number {
    return this.seq
  }

  /**
   * Compares a project with its last snapshot and records the differences. A project
   * seen for the first time records nothing unless `announce` is set, since a client
   * that never fetched it has nothing to update.
   */
  observe(project: Project, announce: boolean): void {
    const next: Snapshot = { projectId: project.id, updatedAt: project.updatedAt, tasks: new Map() }
    fingerprints(project.tasks, null, next.tasks)
    const prev = this.snapshots.get(project.filePath)
    this.snapshots.set(project.filePath, next)
    if (!prev) {
      if (announce) this.push('project', 'upsert', project.id, project.id)
      return
    }
    if (prev.updatedAt !== next.updatedAt || prev.projectId !== next.projectId) {
      this.push('project', 'upsert', project.id, project.id)
    }
    for (const [id, fingerprint] of next.tasks) {
      if (prev.tasks.get(id) !== fingerprint) this.push('task', 'upsert', id, project.id)
    }
    for (const id of prev.tasks.keys()) {
      if (!next.tasks.has(id)) this.push('task', 'delete', id, project.id)
    }
  }

  /** The project at this path is gone: its tasks go with it. */
  forget(path: string): void {
    const prev = this.snapshots.get(path)
    if (!prev) return
    this.snapshots.delete(path)
    for (const id of prev.tasks.keys()) this.push('task', 'delete', id, prev.projectId)
    this.push('project', 'delete', prev.projectId, prev.projectId)
  }

  trackedPaths(): string[] {
    return [...this.snapshots.keys()]
  }

  since(cursor: number | null): ChangePage {
    if (cursor === null) return { cursor: this.seq, changes: [], reset: false }
    const oldest = this.entries[0]?.seq ?? this.seq + 1
    if (cursor < oldest - 1) return { cursor: this.seq, changes: [], reset: true }
    return { cursor: this.seq, changes: this.entries.filter((change) => change.seq > cursor), reset: false }
  }

  private push(kind: Change['kind'], op: Change['op'], id: string, projectId: string): void {
    this.seq++
    this.entries.push({ seq: this.seq, at: new Date().toISOString(), kind, op, id, projectId })
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity)
  }
}
