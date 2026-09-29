import { type CustomFieldDef, type Task, flattenTasks, formatDateLong, stringifyCustomValue, t } from '@dotpm/core'
import type { CardFieldValue } from '../composites/KanbanCard'

/** The tasks a board deals cards for: the top-level ones, or every task once subtasks get cards of their own. */
export function boardCandidates(tasks: Task[], fields: string[]): Task[] {
  return fields.includes('subtasks') ? flattenTasks(tasks).map((flat) => flat.task) : tasks
}

/** A description as one line of plain text, cut to what a card has room for. */
export function descriptionPreview(markdown: string): string | undefined {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*[#>\-*+]+[ \t]+/gm, '')
    .replace(/[*~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, 240) : undefined
}

/** The custom fields among `fields`, as the card shows them. */
export function cardCustomValues(
  task: Task,
  customFields: CustomFieldDef[],
  fields: string[]
): Record<string, CardFieldValue> {
  const values: Record<string, CardFieldValue> = {}
  for (const cf of customFields) {
    const id = `cf:${cf.id}`
    const raw = task.customFields[cf.id]
    if (!fields.includes(id) || raw === undefined || raw === null || raw === '') continue
    const list = (Array.isArray(raw) ? raw : [raw]).map(stringifyCustomValue).filter(Boolean)
    const text =
      cf.type === 'checkbox'
        ? raw === true
          ? t('common.yes')
          : ''
        : cf.type === 'date'
          ? list.map((value) => formatDateLong(value) || value).join(', ')
          : list.map((value) => value.replace(/^\[\[(?:[^|\]]*\|)?([^\]]*)\]\]$/, '$1')).join(', ')
    if (text) values[id] = { name: cf.name, text }
  }
  return values
}
