import {
  type CustomFieldDef,
  type FlatTask,
  applyTaskFilterFlat,
  displayName,
  dueUrgency,
  flattenTasks,
  getStatusConfig,
  isFilterActive,
  isTerminalStatus,
  stringifyCustomValue,
  totalLoggedHours
} from '@dotpm/core'
import { TaskRow } from '../composites/TaskRow'
import { AssigneesCell } from '../composites/cells/AssigneesCell'
import { CustomFieldCell, type CustomFieldValue } from '../composites/cells/CustomFieldCell'
import { DueDateCell } from '../composites/cells/DueDateCell'
import { ExpandCell } from '../composites/cells/ExpandCell'
import { PriorityCell } from '../composites/cells/PriorityCell'
import { ProgressCell } from '../composites/cells/ProgressCell'
import { ProjectCell } from '../composites/cells/ProjectCell'
import { StatusCell } from '../composites/cells/StatusCell'
import { TimeCell } from '../composites/cells/TimeCell'
import { TitleCell } from '../composites/cells/TitleCell'
import { childTreeGuides } from '../composites/treeGuides'
import { allTasks, configOf, customFieldColumns, isMulti, mergedConfig, projectOf, type ViewModel } from './model'
import { compareTask, type SortKey } from './tableSort'

interface TreeRow extends FlatTask {
  guides: boolean[]
  isLastChild: boolean
}

const noop = (): void => {}
const noSave = async (): Promise<void> => {}

/**
 * Filtered, sorted, tree-ordered rows. A filter can promote a task whose parent was
 * filtered out to the top level; it keeps its depth for indentation.
 */
export function tableRows(model: ViewModel): TreeRow[] {
  const config = mergedConfig(model)
  const hasActiveFilter = isFilterActive(model.filter)
  const flat = applyTaskFilterFlat(flattenTasks(allTasks(model)), model.filter, config.statuses)
  const filteredIds = new Set(flat.map((f) => f.task.id))

  const childrenByParent = new Map<string | null, FlatTask[]>()
  for (const f of flat) {
    const bucket = f.parentId === null || (hasActiveFilter && !filteredIds.has(f.parentId)) ? null : f.parentId
    const list = childrenByParent.get(bucket) ?? []
    list.push(f)
    childrenByParent.set(bucket, list)
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => compareTask(a.task, b.task, model, config.statuses, config.priorities))
  }

  const rows: TreeRow[] = []
  const add = (parentId: string | null, trail: boolean[]): void => {
    const items = childrenByParent.get(parentId)
    if (!items) return
    items.forEach((item, i) => {
      const isLastChild = i === items.length - 1
      rows.push({ ...item, guides: padGuides(trail, item.depth), isLastChild })
      add(item.task.id, childTreeGuides(trail, isLastChild))
    })
  }
  add(null, [])
  return rows
}

function padGuides(trail: boolean[], depth: number): boolean[] {
  if (trail.length >= depth) return trail.slice(0, depth)
  return [...Array.from<boolean>({ length: depth - trail.length }).fill(false), ...trail]
}

function customFieldValue(cf: CustomFieldDef, val: unknown): CustomFieldValue {
  const values = (Array.isArray(val) ? val : [val]).map(stringifyCustomValue).filter(Boolean)
  if (cf.type === 'person') return { kind: 'people', people: values.map((raw) => ({ name: displayName(raw) })) }
  if (cf.type === 'checkbox') return { kind: 'checkbox', checked: Boolean(val) }
  if (cf.type === 'url') return { kind: 'url', url: values.join(', ') }
  return { kind: 'text', text: val !== undefined ? stringifyCustomValue(val) : '' }
}

/** The table view without any way to change it: no selection, no editing, no actions. */
export function renderSnapshotTable(container: HTMLElement, model: ViewModel): HTMLElement {
  const config = mergedConfig(model)
  const multi = isMulti(model)
  const customFields = customFieldColumns(model)

  const wrapper = container.createDiv('pm-table-wrapper')
  wrapper.setAttr('data-borders', model.settings.lineBorders)
  const table = wrapper.createEl('table', { cls: 'pm-table' })
  const hrow = table.createEl('thead').createEl('tr')

  const cols: { key: SortKey | null; label: string; width: string }[] = [
    { key: null, label: '', width: '32px' },
    { key: 'title', label: 'Task', width: 'auto' },
    ...(multi ? [{ key: null, label: 'Project', width: '130px' }] : []),
    { key: 'status', label: 'Status', width: '130px' },
    { key: 'priority', label: 'Priority', width: '110px' },
    { key: 'assignees', label: 'Assignees', width: '140px' },
    { key: 'due', label: 'Due', width: '110px' },
    { key: 'progress', label: 'Progress', width: '120px' },
    { key: null, label: 'Time', width: '90px' }
  ]
  for (const col of cols) {
    const th = hrow.createEl('th', { text: col.label })
    th.setCssStyles({ width: col.width })
    if (col.key && col.key === model.sortKey) {
      th.createSpan({ text: model.sortDir === 'asc' ? ' ↑' : ' ↓', cls: 'pm-sort-indicator' })
    }
  }
  for (const cf of customFields) hrow.createEl('th', { text: cf.name }).setCssStyles({ width: '120px' })

  const tbody = table.createEl('tbody')
  for (const flat of tableRows(model)) {
    const { task, depth } = flat
    const owner = projectOf(model, task.id)
    const ownConfig = configOf(model, task.id)
    const isDone = isTerminalStatus(task.status, ownConfig.statuses)
    const statusConfig = getStatusConfig(config.statuses, task.status)

    const { el: row } = new TaskRow(tbody, {
      taskId: task.id,
      depth,
      isDone,
      isArchived: task.archived === true,
      isSelected: false,
      onRowClick: noop
    })
    new ExpandCell(row, { hasSubtasks: task.subtasks.length > 0, collapsed: false, onToggle: noop })
    new TitleCell(row, {
      task,
      treeGuides: model.settings.showSubtreeConnections ? flat.guides : null,
      isLastChild: flat.isLastChild,
      showTagColors: model.settings.showTagColors,
      onTitleClick: noop,
      onTitleSave: noSave,
      onAddSubtask: noop
    })
    if (multi && owner) new ProjectCell(row, { title: owner.title, color: owner.color, onClick: noop })
    new StatusCell(row, { task, statuses: config.statuses, onChange: noop })
    new PriorityCell(row, {
      task,
      priorities: config.priorities,
      priorityIcons: model.settings.priorityIcons,
      onChange: noop
    })
    new AssigneesCell(
      row,
      task.assignees.map((raw) => ({ name: displayName(raw) }))
    )
    new DueDateCell(row, { task, urgency: dueUrgency(task, ownConfig.statuses), onSave: noSave })
    new ProgressCell(row, {
      value: task.progress,
      color: statusConfig?.color ?? 'var(--interactive-accent)',
      onSave: noSave
    })
    new TimeCell(row, { logged: totalLoggedHours(task), estimate: task.timeEstimate ?? 0 })
    for (const cf of customFields) new CustomFieldCell(row, customFieldValue(cf, task.customFields[cf.id]))
  }
  return wrapper
}

export function visibleTaskCount(model: ViewModel): number {
  return tableRows(model).length
}
