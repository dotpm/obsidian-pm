import type { Change, ProjectResource, ProjectSummary, TaskResource } from '@dotpm/api/contract'

export type Output =
  | { kind: 'projects'; value: ProjectSummary[] }
  | { kind: 'project'; value: ProjectResource & { tasks?: TaskResource[] } }
  | { kind: 'tasks'; value: TaskResource[] }
  | { kind: 'task'; value: TaskResource }
  | { kind: 'changes'; value: { cursor: number; changes: Change[]; reset: boolean } }
  | { kind: 'status'; value: { ok: boolean; name: string; version: string; url: string; source: string } }
  | { kind: 'deleted'; value: { id: string } }

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, col) => Math.max(header.length, ...rows.map((row) => row[col].length)))
  const line = (cells: string[]): string =>
    cells
      .map((cell, col) => (col === cells.length - 1 ? cell : cell.padEnd(widths[col])))
      .join('  ')
      .trimEnd()
  return [line(headers), ...rows.map(line)].join('\n')
}

function fields(pairs: Array<[string, string]>): string {
  const width = Math.max(...pairs.map(([label]) => label.length))
  return pairs.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join('\n')
}

function taskRows(tasks: TaskResource[]): string[][] {
  const listed = new Map(tasks.map((task) => [task.id, task]))
  const depth = (task: TaskResource): number => {
    let level = 0
    for (let parent = task.parentId; parent && listed.has(parent); parent = listed.get(parent)?.parentId ?? null) {
      level++
    }
    return level
  }
  return tasks.map((task) => [
    task.id,
    task.status,
    task.priority,
    task.due,
    `${'  '.repeat(depth(task))}${task.title}${task.archived ? ' (archived)' : ''}`
  ])
}

function tasks(list: TaskResource[]): string {
  if (list.length === 0) return 'no tasks'
  return table(['ID', 'STATUS', 'PRIORITY', 'DUE', 'TITLE'], taskRows(list))
}

function project(value: ProjectResource & { tasks?: TaskResource[] }): string {
  const head = fields([
    ['id', value.id],
    ['title', value.title],
    ['path', value.path],
    ['parent', value.parentId ?? ''],
    ['tasks', `${value.doneCount} of ${value.taskCount} done`],
    ['team', value.teamMembers.join(', ')],
    ['statuses', value.statuses.map((status) => status.id).join(', ')],
    ['priorities', value.priorities.map((priority) => priority.id).join(', ')],
    ['fields', value.customFields.map((field) => field.id).join(', ')]
  ])
  const parts = [head]
  if (value.description) parts.push('', value.description)
  if (value.tasks) parts.push('', tasks(value.tasks))
  return parts.join('\n')
}

function task(value: TaskResource): string {
  const head = fields([
    ['id', value.id],
    ['title', value.title],
    ['project', value.projectId],
    ['parent', value.parentId ?? ''],
    ['path', value.path],
    ['type', value.type],
    ['status', value.status],
    ['priority', value.priority],
    ['start', value.start],
    ['due', value.due],
    ['completed', value.completed],
    ['progress', `${value.progress}%`],
    ['assignees', value.assignees.join(', ')],
    ['tags', value.tags.join(', ')],
    ['depends on', value.dependencies.join(', ')],
    ['estimate', value.timeEstimate === null ? '' : `${value.timeEstimate}h`],
    ['archived', value.archived ? 'yes' : 'no'],
    ['updated', value.updatedAt]
  ])
  return value.description ? `${head}\n\n${value.description}` : head
}

function changes(value: { cursor: number; changes: Change[]; reset: boolean }): string {
  const head = `cursor ${value.cursor}${value.reset ? ' (reset: the cursor was too old, list again)' : ''}`
  if (value.changes.length === 0) return head
  const rows = value.changes.map((change) => [
    String(change.seq),
    change.at,
    change.kind,
    change.op,
    change.id,
    change.projectId
  ])
  return `${head}\n${table(['SEQ', 'AT', 'KIND', 'OP', 'ID', 'PROJECT'], rows)}`
}

export function render(output: Output): string {
  switch (output.kind) {
    case 'projects':
      return output.value.length === 0
        ? 'no projects'
        : table(
            ['ID', 'TASKS', 'TITLE', 'PATH'],
            output.value.map((p) => [p.id, `${p.doneCount}/${p.taskCount}`, p.title, p.path])
          )
    case 'project':
      return project(output.value)
    case 'tasks':
      return tasks(output.value)
    case 'task':
      return task(output.value)
    case 'changes':
      return changes(output.value)
    case 'status':
      return fields([
        ['server', `${output.value.name} ${output.value.version}`],
        ['url', output.value.url],
        ['from', output.value.source]
      ])
    case 'deleted':
      return `deleted ${output.value.id}`
  }
}
