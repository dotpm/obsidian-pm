import { Temporal } from 'temporal-polyfill'
import { locale, t, tn } from './i18n'

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

let dateFormat = ''

/** Moment-style tokens every date label follows instead of the language's own format; '' turns it off. */
export function setDateFormat(format: string): void {
  dateFormat = format.trim()
}

const pad = (value: number, length: number): string => String(value).padStart(length, '0')

const DATE_TOKENS: Record<string, (date: Temporal.PlainDate) => string> = {
  YYYY: (date) => pad(date.year, 4),
  YY: (date) => pad(date.year % 100, 2),
  MMMM: (date) => date.toLocaleString(locale(), { month: 'long' }),
  MMM: (date) => date.toLocaleString(locale(), { month: 'short' }),
  MM: (date) => pad(date.month, 2),
  M: (date) => String(date.month),
  DD: (date) => pad(date.day, 2),
  D: (date) => String(date.day),
  dddd: (date) => date.toLocaleString(locale(), { weekday: 'long' }),
  ddd: (date) => date.toLocaleString(locale(), { weekday: 'short' })
}

/** Text in square brackets is kept as written. */
const DATE_PATTERN = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g

function formatPlainDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = parsePlainDate(iso)
  if (!date) return ''
  if (!dateFormat) return date.toLocaleString(locale(), options)
  return dateFormat.replace(DATE_PATTERN, (token, literal: string | undefined) => literal ?? DATE_TOKENS[token](date))
}

/** "Jun 15, 2026", or '' when empty or invalid. */
export function formatDate(iso: string): string {
  return formatPlainDate(iso, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "Mar 28", or '' when empty or invalid. */
export function formatDateShort(iso: string): string {
  return formatPlainDate(iso, { month: 'short', day: 'numeric' })
}

/** "Mar 28, 26", or '' when empty or invalid. */
export function formatDateLong(iso: string): string {
  return formatPlainDate(iso, { month: 'short', day: 'numeric', year: '2-digit' })
}

/** "Mar 28 - 31" in the order and punctuation the active language uses for a date range. */
export function formatDateRange(start: Temporal.PlainDate, end: Temporal.PlainDate): string {
  const format = new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return format.formatRange(utcDate(start), utcDate(end))
}

function utcDate(date: Temporal.PlainDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day))
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'outcome'

/** Null past a week out, where a relative hint adds nothing. `from` is injectable for tests. */
export function relativeDue(iso: string, from: Temporal.PlainDate = today()): { text: string; tone: DueTone } | null {
  const due = parsePlainDate(iso)
  if (!due) return null
  const days = from.until(due, { largestUnit: 'day' }).days
  if (days < 0) return { text: tn('dates.overdueDays', -days), tone: 'overdue' }
  if (days === 0) return { text: t('dates.today'), tone: 'today' }
  if (days === 1) return { text: t('dates.tomorrow'), tone: 'today' }
  if (days <= 6) return { text: tn('dates.inDays', days), tone: 'soon' }
  return null
}

/** Whether a finished task landed on its due date; null unless both dates are set. */
export function completionOutcome(due: string, completed: string): { text: string; tone: DueTone } | null {
  const dueDate = parsePlainDate(due)
  const completedDate = parsePlainDate(completed)
  if (!dueDate || !completedDate) return null
  const days = dueDate.until(completedDate, { largestUnit: 'day' }).days
  return { text: days > 0 ? tn('dates.daysLate', days) : t('dates.onTime'), tone: 'outcome' }
}
