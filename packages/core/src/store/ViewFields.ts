import type { CustomFieldDef, FieldList, ViewFields, ViewMode } from '../types'
import { t } from '../i18n'

/**
 * The built-in fields each presentation can show, in their default order: table columns,
 * what a board card carries, and the text beside a timeline bar. Custom fields follow as
 * `cf:<id>`. `project` exists only while a view covers several projects, and on a board
 * `subtasks` puts each subtask on a card of its own.
 */
const BUILT_IN: Record<ViewMode, string[]> = {
  table: ['title', 'project', 'status', 'priority', 'assignees', 'due', 'progress', 'time'],
  kanban: ['priority', 'description', 'time', 'tags', 'progress', 'project', 'assignees', 'due', 'subtasks'],
  gantt: ['title', 'assignees', 'progress', 'dates', 'status', 'priority']
}

const HIDDEN_BY_DEFAULT: Record<ViewMode, ReadonlySet<string>> = {
  table: new Set(),
  kanban: new Set(['description', 'subtasks']),
  gantt: new Set(['assignees', 'progress', 'dates', 'status', 'priority'])
}

/** A table shows custom fields until told otherwise; a card or a bar label only once asked. */
const CUSTOM_SHOWN_BY_DEFAULT: Record<ViewMode, boolean> = { table: true, kanban: false, gantt: false }

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  project: 130,
  status: 130,
  priority: 110,
  assignees: 140,
  due: 110,
  progress: 120,
  time: 90
}
export const CUSTOM_COLUMN_WIDTH = 120

/** What decides which fields exist: the custom fields in scope, and whether it spans projects. */
export interface FieldCatalog {
  customFields: CustomFieldDef[]
  multi: boolean
}

export function availableFields(mode: ViewMode, catalog: FieldCatalog): string[] {
  const builtIn = BUILT_IN[mode].filter((id) => id !== 'project' || catalog.multi)
  return [...builtIn, ...catalog.customFields.map((cf) => `cf:${cf.id}`)]
}

export function defaultFields(mode: ViewMode, catalog: FieldCatalog): string[] {
  return availableFields(mode, catalog).filter((id) =>
    id.startsWith('cf:') ? CUSTOM_SHOWN_BY_DEFAULT[mode] : !HIDDEN_BY_DEFAULT[mode].has(id)
  )
}

/** The title names the row in a table and on a timeline, so it can't be hidden or moved. */
export function isLockedField(mode: ViewMode, id: string): boolean {
  return id === 'title' && mode !== 'kanban'
}

/**
 * What `mode` shows, in order: the view's list without the fields that no longer exist,
 * or the defaults when it has none. A locked field always leads.
 */
export function shownFields(fields: ViewFields, mode: ViewMode, catalog: FieldCatalog): string[] {
  const available = availableFields(mode, catalog)
  const stored = fields[mode]?.visible
  const list = stored ? stored.filter((id) => available.includes(id)) : defaultFields(mode, catalog)
  const locked = available.filter((id) => isLockedField(mode, id))
  return [...locked, ...list.filter((id) => !locked.includes(id))]
}

/** `shown` with `id` back where `order` puts it among them, so hiding a field and showing it again changes nothing. */
export function withFieldShown<T extends string>(shown: readonly T[], id: T, order: readonly T[]): T[] {
  const rank = order.indexOf(id)
  const at = shown.findIndex((other) => order.indexOf(other) > rank)
  return at === -1 ? [...shown, id] : [...shown.slice(0, at), id, ...shown.slice(at)]
}

export function hiddenFields(fields: ViewFields, mode: ViewMode, catalog: FieldCatalog): string[] {
  const shown = shownFields(fields, mode, catalog)
  return availableFields(mode, catalog).filter((id) => !shown.includes(id))
}

/** A table column's width in px; the title takes what is left. */
export function columnWidth(fields: ViewFields, id: string): number | undefined {
  if (id === 'title') return undefined
  return fields.table?.widths?.[id] ?? DEFAULT_COLUMN_WIDTHS[id] ?? CUSTOM_COLUMN_WIDTH
}

/**
 * Drops a mode that shows its defaults at default widths, so a view whose fields were
 * changed and changed back compares equal to one never touched.
 */
export function tidyFields(fields: ViewFields, catalog: FieldCatalog): void {
  for (const mode of Object.keys(fields) as ViewMode[]) {
    const list = fields[mode] as FieldList
    if (list.widths && !Object.keys(list.widths).length) delete list.widths
    const shown = shownFields(fields, mode, catalog)
    const defaults = shownFields({}, mode, catalog)
    const isDefault = shown.length === defaults.length && shown.every((id, i) => id === defaults[i])
    if (isDefault && !list.widths) Reflect.deleteProperty(fields, mode)
  }
}

/**
 * The board card fields a view had while "Show subtasks" and "Show description preview"
 * were settings of their own.
 */
export function legacyBoardFields(showSubtasks: boolean, showDescription: boolean): ViewFields {
  if (!showSubtasks && !showDescription) return {}
  const visible = BUILT_IN.kanban.filter(
    (id) =>
      !HIDDEN_BY_DEFAULT.kanban.has(id) ||
      (id === 'subtasks' && showSubtasks) ||
      (id === 'description' && showDescription)
  )
  return { kanban: { visible } }
}

/** A field's name as a column header or a row of the Fields popover shows it. */
export function viewFieldLabel(id: string, customFields: CustomFieldDef[]): string {
  if (id.startsWith('cf:')) return customFields.find((cf) => `cf:${cf.id}` === id)?.name ?? id.slice(3)
  switch (id) {
    case 'title':
      return t('columns.task')
    case 'project':
      return t('columns.project')
    case 'status':
      return t('columns.status')
    case 'priority':
      return t('columns.priority')
    case 'assignees':
      return t('columns.assignees')
    case 'due':
      return t('columns.due')
    case 'progress':
      return t('columns.progress')
    case 'time':
      return t('columns.time')
    case 'tags':
      return t('taskForm.tags')
    case 'description':
      return t('fields.description')
    case 'subtasks':
      return t('fields.subtasks')
    case 'dates':
      return t('fields.dates')
    default:
      return id
  }
}
