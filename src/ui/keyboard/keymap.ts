import { t, type MessageKey } from '@dotpm/core'
import { parseBinding } from './keys'
import type { KeyboardContext, KeyboardSurface } from './types'

export type ActionId =
  | 'next'
  | 'prev'
  | 'nextColumn'
  | 'prevColumn'
  | 'first'
  | 'last'
  | 'pageDown'
  | 'pageUp'
  | 'extendDown'
  | 'extendUp'
  | 'toggleSelect'
  | 'selectAll'
  | 'escape'
  | 'open'
  | 'new'
  | 'newSubtask'
  | 'toggleDone'
  | 'statusNext'
  | 'statusPrev'
  | 'priorityNext'
  | 'priorityPrev'
  | 'assign'
  | 'due'
  | 'tags'
  | 'move'
  | 'duplicate'
  | 'archive'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'search'
  | 'filter'
  | 'clearFilter'
  | 'nextView'
  | 'nextSavedView'
  | 'pickSavedView'
  | 'saveView'
  | 'viewTable'
  | 'viewBoard'
  | 'viewTimeline'
  | 'moveCardNext'
  | 'moveCardPrev'
  | 'expand'
  | 'collapse'
  | 'openOverview'
  | 'editProject'
  | 'openNote'
  | 'palette'
  | 'help'

export type ActionHandlers = Partial<Record<ActionId, () => void | Promise<void>>>

export interface Binding {
  keys: string[]
  action: ActionId
}

/** The recorder waits for a whole chord, so one-shot actions run once even when held. */
export const REPEATABLE = new Set<ActionId>([
  'next',
  'prev',
  'nextColumn',
  'prevColumn',
  'first',
  'last',
  'pageDown',
  'pageUp',
  'extendDown',
  'extendUp'
])

export const ACTION_LABELS: Record<ActionId, MessageKey> = {
  next: 'keyboard.next',
  prev: 'keyboard.prev',
  nextColumn: 'keyboard.nextColumn',
  prevColumn: 'keyboard.prevColumn',
  first: 'keyboard.first',
  last: 'keyboard.last',
  pageDown: 'keyboard.pageDown',
  pageUp: 'keyboard.pageUp',
  extendDown: 'keyboard.extendDown',
  extendUp: 'keyboard.extendUp',
  toggleSelect: 'keyboard.toggleSelect',
  selectAll: 'keyboard.selectAll',
  escape: 'keyboard.escape',
  open: 'taskMenu.edit',
  new: 'keyboard.newTask',
  newSubtask: 'taskMenu.addSubtask',
  toggleDone: 'keyboard.toggleDone',
  statusNext: 'keyboard.statusNext',
  statusPrev: 'keyboard.statusPrev',
  priorityNext: 'keyboard.priorityNext',
  priorityPrev: 'keyboard.priorityPrev',
  assign: 'keyboard.assign',
  due: 'keyboard.due',
  tags: 'keyboard.tags',
  move: 'keyboard.move',
  duplicate: 'taskMenu.duplicate',
  archive: 'keyboard.archive',
  delete: 'common.delete',
  undo: 'commands.undo',
  redo: 'commands.redo',
  search: 'header.search',
  filter: 'header.filter',
  clearFilter: 'filter.clearAllFilters',
  nextView: 'keyboard.nextView',
  nextSavedView: 'keyboard.nextSavedView',
  pickSavedView: 'keyboard.pickSavedView',
  saveView: 'keyboard.saveView',
  viewTable: 'views.table',
  viewBoard: 'views.kanban',
  viewTimeline: 'views.gantt',
  moveCardNext: 'keyboard.moveCardNext',
  moveCardPrev: 'keyboard.moveCardPrev',
  expand: 'keyboard.expand',
  collapse: 'keyboard.collapse',
  openOverview: 'keyboard.openOverview',
  editProject: 'keyboard.editProject',
  openNote: 'keyboard.openNote',
  palette: 'keyboard.palette',
  help: 'keyboard.help'
}

/** A few actions read differently on a project than on a task. */
const LABEL_OVERRIDES: Partial<Record<KeyboardContext, Partial<Record<ActionId, MessageKey>>>> = {
  projects: {
    open: 'keyboard.openProject',
    new: 'keyboard.newProject'
  },
  overview: {
    open: 'project.openTasks'
  }
}

export function actionLabel(action: ActionId, context: KeyboardContext): string {
  return t(LABEL_OVERRIDES[context]?.[action] ?? ACTION_LABELS[action])
}

export type KeyboardSection = 'navigation' | 'selection' | 'tasks' | 'projects' | 'view'

export const ACTION_SECTIONS: Record<ActionId, KeyboardSection> = {
  next: 'navigation',
  prev: 'navigation',
  nextColumn: 'navigation',
  prevColumn: 'navigation',
  first: 'navigation',
  last: 'navigation',
  pageDown: 'navigation',
  pageUp: 'navigation',
  escape: 'navigation',
  expand: 'navigation',
  collapse: 'navigation',
  toggleSelect: 'selection',
  extendDown: 'selection',
  extendUp: 'selection',
  selectAll: 'selection',
  open: 'tasks',
  new: 'tasks',
  newSubtask: 'tasks',
  toggleDone: 'tasks',
  statusNext: 'tasks',
  statusPrev: 'tasks',
  priorityNext: 'tasks',
  priorityPrev: 'tasks',
  assign: 'tasks',
  due: 'tasks',
  tags: 'tasks',
  move: 'tasks',
  duplicate: 'tasks',
  archive: 'tasks',
  delete: 'tasks',
  undo: 'tasks',
  redo: 'tasks',
  moveCardNext: 'tasks',
  moveCardPrev: 'tasks',
  openOverview: 'projects',
  editProject: 'projects',
  openNote: 'projects',
  search: 'view',
  filter: 'view',
  clearFilter: 'view',
  nextView: 'view',
  nextSavedView: 'view',
  pickSavedView: 'view',
  saveView: 'view',
  viewTable: 'view',
  viewBoard: 'view',
  viewTimeline: 'view',
  palette: 'view',
  help: 'view'
}

const NAVIGATE: Binding[] = [
  { keys: ['ArrowDown', 'j'], action: 'next' },
  { keys: ['ArrowUp', 'k'], action: 'prev' },
  { keys: ['Home', 'g'], action: 'first' },
  { keys: ['End', 'G'], action: 'last' },
  { keys: ['PageDown'], action: 'pageDown' },
  { keys: ['PageUp'], action: 'pageUp' },
  { keys: ['Escape'], action: 'escape' }
]

const SELECT: Binding[] = [
  { keys: ['Space'], action: 'toggleSelect' },
  { keys: ['Shift+ArrowDown'], action: 'extendDown' },
  { keys: ['Shift+ArrowUp'], action: 'extendUp' },
  { keys: ['Mod+A'], action: 'selectAll' }
]

const TASK_ACTIONS: Binding[] = [
  { keys: ['Enter', 'e'], action: 'open' },
  { keys: ['n'], action: 'new' },
  { keys: ['Shift+N'], action: 'newSubtask' },
  { keys: ['x'], action: 'toggleDone' },
  { keys: ['s'], action: 'statusNext' },
  { keys: ['Shift+S'], action: 'statusPrev' },
  { keys: ['p'], action: 'priorityNext' },
  { keys: ['Shift+P'], action: 'priorityPrev' },
  { keys: ['a'], action: 'assign' },
  { keys: ['d'], action: 'due' },
  { keys: ['#'], action: 'tags' },
  { keys: ['m'], action: 'move' },
  { keys: ['Mod+D'], action: 'duplicate' },
  { keys: ['u'], action: 'archive' },
  { keys: ['Delete', 'Backspace'], action: 'delete' },
  { keys: ['Mod+Z'], action: 'undo' },
  { keys: ['Mod+Shift+Z', 'Mod+Y'], action: 'redo' }
]

const VIEW_ACTIONS: Binding[] = [
  { keys: ['Mod+F', '/'], action: 'search' },
  { keys: ['f'], action: 'filter' },
  { keys: ['Shift+F'], action: 'clearFilter' },
  { keys: ['v'], action: 'nextView' },
  { keys: ['Shift+V'], action: 'nextSavedView' },
  { keys: ['w'], action: 'pickSavedView' },
  { keys: ['Shift+W'], action: 'saveView' },
  { keys: ['1'], action: 'viewTable' },
  { keys: ['2'], action: 'viewBoard' },
  { keys: ['3'], action: 'viewTimeline' }
]

const COMMON_ACTIONS: Binding[] = [
  { keys: ['Mod+K'], action: 'palette' },
  { keys: ['?', 'F1'], action: 'help' }
]

const TREE: Binding[] = [
  { keys: ['ArrowRight', 'l'], action: 'expand' },
  { keys: ['ArrowLeft', 'h'], action: 'collapse' }
]

const BOARD: Binding[] = [
  { keys: ['ArrowRight', 'l'], action: 'nextColumn' },
  { keys: ['ArrowLeft', 'h'], action: 'prevColumn' },
  { keys: ['Mod+ArrowRight'], action: 'moveCardNext' },
  { keys: ['Mod+ArrowLeft'], action: 'moveCardPrev' }
]

export const KEYMAP: Record<KeyboardContext, Binding[]> = {
  table: [...NAVIGATE, ...SELECT, ...TASK_ACTIONS, ...VIEW_ACTIONS, ...COMMON_ACTIONS, ...TREE],
  board: [...NAVIGATE, ...TASK_ACTIONS, ...VIEW_ACTIONS, ...COMMON_ACTIONS, ...BOARD],
  timeline: [...NAVIGATE, ...TASK_ACTIONS, ...VIEW_ACTIONS, ...COMMON_ACTIONS, ...TREE],
  projects: [
    ...NAVIGATE,
    { keys: ['Enter'], action: 'open' },
    { keys: ['o'], action: 'openOverview' },
    { keys: ['e'], action: 'editProject' },
    { keys: ['n'], action: 'new' },
    { keys: ['Mod+Z'], action: 'undo' },
    { keys: ['Mod+Shift+Z', 'Mod+Y'], action: 'redo' },
    { keys: ['Mod+F', '/'], action: 'search' },
    { keys: ['f'], action: 'filter' },
    { keys: ['Shift+F'], action: 'clearFilter' },
    { keys: ['Shift+V'], action: 'nextSavedView' },
    { keys: ['w'], action: 'pickSavedView' },
    { keys: ['Shift+W'], action: 'saveView' },
    ...COMMON_ACTIONS,
    ...TREE
  ],
  overview: [
    { keys: ['Enter'], action: 'open' },
    { keys: ['e'], action: 'editProject' },
    { keys: ['o'], action: 'openNote' },
    { keys: ['n'], action: 'new' },
    ...COMMON_ACTIONS
  ]
}

export const CONTEXT_LABELS: Record<KeyboardContext, MessageKey> = {
  table: 'views.table',
  board: 'views.kanban',
  timeline: 'views.gantt',
  projects: 'dashboard.title',
  overview: 'views.overview'
}

const NEEDS_ITEMS = new Set<ActionId>([
  'next',
  'prev',
  'nextColumn',
  'prevColumn',
  'first',
  'last',
  'pageDown',
  'pageUp',
  'extendDown',
  'extendUp'
])

const NEEDS_SELECTION = new Set<ActionId>(['toggleSelect', 'selectAll', 'extendDown', 'extendUp'])

const NEEDS_TARGET = new Set<ActionId>([
  'toggleDone',
  'statusNext',
  'statusPrev',
  'priorityNext',
  'priorityPrev',
  'assign',
  'due',
  'tags',
  'move',
  'archive',
  'delete'
])

/** Actions that read the active item, so a selection alone is not enough. */
const NEEDS_ACTIVE = new Set<ActionId>([
  'open',
  'newSubtask',
  'duplicate',
  'moveCardNext',
  'moveCardPrev',
  'openOverview',
  'editProject',
  'openNote'
])

/** Whether an action has something to act on or a surface that can run it. */
export function isActionAvailable(action: ActionId, surface: KeyboardSurface | null): boolean {
  if (!surface) return false
  if (NEEDS_SELECTION.has(action)) return !!surface.selection
  if (NEEDS_ITEMS.has(action)) return surface.groups().some((group) => group.length > 0)
  if (NEEDS_ACTIVE.has(action)) return !!surface.activeId()
  if (action === 'expand') return !!surface.activeId() && !!surface.expand && (surface.canCollapse?.() ?? true)
  if (action === 'collapse') return !!surface.activeId() && !!surface.collapse && (surface.canCollapse?.() ?? true)
  if (NEEDS_TARGET.has(action)) return !!surface.activeId() || !!surface.selection?.().ids().size
  return true
}

export function resolveAction(context: KeyboardContext, id: string): ActionId | null {
  for (const binding of KEYMAP[context]) {
    for (const key of binding.keys) {
      if (parseBindingCached(key) === id) return binding.action
    }
  }
  return null
}

const parsedCache = new Map<string, string>()
function parseBindingCached(binding: string): string {
  const cached = parsedCache.get(binding)
  if (cached) return cached
  const parsed = parseBinding(binding).id
  parsedCache.set(binding, parsed)
  return parsed
}
