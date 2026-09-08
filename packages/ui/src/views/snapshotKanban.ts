import {
  type Task,
  displayName,
  dueUrgency,
  flattenTasks,
  getPriorityConfig,
  matchesFilter,
  totalLoggedHours
} from '@dotpm/core'
import { KanbanColumn, type KanbanCardData } from '../composites/KanbanColumn'
import { renderProjectChip } from '../composites/projectChip'
import { allTasks, configOf, isMulti, mergedConfig, projectOf, type ViewModel } from './model'

const noop = (): void => {}
const noDrop = async (): Promise<void> => {}

function parentTitle(model: ViewModel, taskId: string): string | undefined {
  for (const { task } of flattenTasks(allTasks(model))) {
    if (task.subtasks.some((sub) => sub.id === taskId)) return task.title
  }
  return undefined
}

function cardData(model: ViewModel, task: Task): KanbanCardData {
  const config = configOf(model, task.id)
  const priorityConfig = getPriorityConfig(config.priorities, task.priority)
  const owner = isMulti(model) ? projectOf(model, task.id) : null
  return {
    task,
    people: task.assignees.map((raw) => ({ name: displayName(raw) })),
    priorityColor:
      priorityConfig && task.priority !== 'medium' && task.priority !== 'low' ? priorityConfig.color : undefined,
    parentTitle: model.settings.kanbanShowSubtasks && task.type === 'subtask' ? parentTitle(model, task.id) : undefined,
    renderSource: owner
      ? (el) => renderProjectChip(el, { title: owner.title, color: owner.color, onClick: noop })
      : undefined,
    loggedHours: totalLoggedHours(task),
    overdue: dueUrgency(task, config.statuses) === 'overdue',
    showTagColors: model.settings.showTagColors
  }
}

/** The board without drag, menus or editing: one column per status, cards in tree order. */
export function renderSnapshotKanban(container: HTMLElement, model: ViewModel): HTMLElement {
  const config = mergedConfig(model)
  container.addClass('pm-kanban-view')
  const board = container.createDiv('pm-kanban-board')
  const candidates = model.settings.kanbanShowSubtasks
    ? flattenTasks(allTasks(model)).map((f) => f.task)
    : allTasks(model)
  for (const status of config.statuses) {
    const cards = candidates
      .filter((task) => task.status === status.id && matchesFilter(task, model.filter, config.statuses))
      .map((task) => cardData(model, task))
    new KanbanColumn(board, {
      status,
      cards,
      onCardClick: noop,
      onCardContextMenu: noop,
      onCardDragStart: noop,
      onCardDragEnd: noop,
      onDrop: noDrop
    })
  }
  return board
}
