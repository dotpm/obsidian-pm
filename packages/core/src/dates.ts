import { Temporal } from 'temporal-polyfill'
import { t } from './i18n'

export { Temporal }

export function today(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO()
}

export function parsePlainDate(s: string): Temporal.PlainDate | null {
  if (!s) return null
  try {
    return Temporal.PlainDate.from(s)
  } catch {
    return null
  }
}

/** "Jun 15, 2026", or '' when empty or invalid. */
export function formatDate(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

/** "Mar 28", or '' when empty or invalid. */
export function formatDateShort(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric' }) : ''
}

/** "Mar 28, 26", or '' when empty or invalid. */
export function formatDateLong(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : ''
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'outcome'

/** Null past a week out, where a relative hint adds nothing. `from` is injectable for tests. */
export function relativeDue(iso: string, from: Temporal.PlainDate = today()): { text: string; tone: DueTone } | null {
  const due = parsePlainDate(iso)
  if (!due) return null
  const days = from.until(due, { largestUnit: 'day' }).days
  if (days < 0) return { text: t('{n}d overdue', { n: -days }), tone: 'overdue' }
  if (days === 0) return { text: t('Today'), tone: 'today' }
  if (days === 1) return { text: t('Tomorrow'), tone: 'today' }
  if (days <= 6) return { text: t('In {n}d', { n: days }), tone: 'soon' }
  return null
}

/** Whether a finished task landed on its due date; null unless both dates are set. */
export function completionOutcome(due: string, completed: string): { text: string; tone: DueTone } | null {
  const dueDate = parsePlainDate(due)
  const completedDate = parsePlainDate(completed)
  if (!dueDate || !completedDate) return null
  const days = dueDate.until(completedDate, { largestUnit: 'day' }).days
  return { text: days > 0 ? t('{n}d late', { n: days }) : t('On time'), tone: 'outcome' }
}
