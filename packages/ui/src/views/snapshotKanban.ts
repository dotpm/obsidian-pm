import {
  type Task,
  dueUrgency,
  flattenTasks,
  getPriorityConfig,
  matchesQuery,
  shownFields,
  totalLoggedHours
} from '@dotpm/core'
import { KanbanColumn, type KanbanCardData } from '../composites/KanbanColumn'
import { compareTasks } from './tableSort'
import { boardColumns } from './boardColumns'
import { boardCandidates, cardCustomValues, descriptionPreview } from './boardCards'
import { renderProjectChip } from '../composites/projectChip'
import {
  allTasks,
  configOf,
  customFieldColumns,
  fieldCatalogOf,
  filterContextOf,
  filterSetupOf,
  isMulti,
  mergedConfig,
  personOf,
  projectOf,
  queryOf,
  type ViewModel
} from './model'

const noop = (): void => {}
const noDrop = async (): Promise<void> => {}

function parentTitle(model: ViewModel, taskId: string): string | undefined {
  for (const { task } of flattenTasks(allTasks(model))) {
    if (task.subtasks.some((sub) => sub.id === taskId)) return task.title
  }
  return undefined
}

function cardData(model: ViewModel, task: Task, fields: string[]): KanbanCardData {
  const config = configOf(model, task.id)
  const priorityConfig = getPriorityConfig(config.priorities, task.priority)
  const owner = isMulti(model) ? projectOf(model, task.id) : null
  return {
    task,
    people: task.assignees.map((raw) => personOf(model, raw)),
    priorityColor:
      priorityConfig && task.priority !== 'medium' && task.priority !== 'low' ? priorityConfig.color : undefined,
    parentTitle: fields.includes('subtasks') && task.type === 'subtask' ? parentTitle(model, task.id) : undefined,
    descriptionPreview: fields.includes('description') ? descriptionPreview(task.description) : undefined,
    customValues: cardCustomValues(task, customFieldColumns(model), fields),
    renderSource: owner
      ? (el) => renderProjectChip(el, { title: owner.title, color: owner.color, onClick: noop })
      : undefined,
    loggedHours: totalLoggedHours(task),
    overdue: dueUrgency(task, config.statuses) === 'overdue',
    showTagColors: model.settings.showTagColors
  }
}

/** The board without drag, menus or editing: the columns the view grouped by, cards in the order it sorted. */
export function renderSnapshotKanban(container: HTMLElement, model: ViewModel): HTMLElement {
  const config = mergedConfig(model)
  container.addClass('pm-kanban-view')
  const board = container.createDiv('pm-kanban-board')
  const fields = shownFields(model.fields, 'kanban', fieldCatalogOf(model))
  const candidates = boardCandidates(allTasks(model), fields)
  const query = queryOf(model)
  const ctx = filterContextOf(model)
  const tasks = candidates
    .filter((task) => matchesQuery(task, query, ctx))
    .sort((a, b) => compareTasks(a, b, model.sort, config.statuses, config.priorities))
  for (const column of boardColumns(filterSetupOf(model), model.group, tasks).filter((c) => !c.hidden)) {
    new KanbanColumn(board, {
      column,
      fields,
      cards: column.tasks.map((task) => cardData(model, task, fields)),
      onCardClick: noop,
      onCardContextMenu: noop,
      onCardDragStart: noop,
      onCardDragEnd: noop,
      onDrop: noDrop
    })
  }
  return board
}
