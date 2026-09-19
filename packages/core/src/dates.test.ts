import { afterEach, describe, expect, it, vi } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import {
  completionOutcome,
  formatDate,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  relativeDue,
  setDateFormat
} from './dates'
import { setLocale } from './i18n'

const from = Temporal.PlainDate.from('2026-06-15')

describe('relativeDue', () => {
  it('returns null for empty or invalid dates', () => {
    expect(relativeDue('', from)).toBeNull()
    expect(relativeDue('not-a-date', from)).toBeNull()
  })

  it('flags overdue dates with the day count', () => {
    expect(relativeDue('2026-06-13', from)).toEqual({ text: '2d overdue', tone: 'overdue' })
    expect(relativeDue('2026-06-14', from)).toEqual({ text: '1d overdue', tone: 'overdue' })
  })

  it('labels today and tomorrow', () => {
    expect(relativeDue('2026-06-15', from)).toEqual({ text: 'Today', tone: 'today' })
    expect(relativeDue('2026-06-16', from)).toEqual({ text: 'Tomorrow', tone: 'today' })
  })

  it('labels dates within the week', () => {
    expect(relativeDue('2026-06-18', from)).toEqual({ text: 'In 3d', tone: 'soon' })
    expect(relativeDue('2026-06-21', from)).toEqual({ text: 'In 6d', tone: 'soon' })
  })

  it('returns null beyond a week out', () => {
    expect(relativeDue('2026-06-22', from)).toBeNull()
    expect(relativeDue('2026-12-01', from)).toBeNull()
  })
})

describe('completionOutcome', () => {
  it('returns null unless both dates are set', () => {
    expect(completionOutcome('', '2026-06-15')).toBeNull()
    expect(completionOutcome('2026-06-15', '')).toBeNull()
    expect(completionOutcome('not-a-date', '2026-06-15')).toBeNull()
  })

  it('counts the days a task ran past its due date', () => {
    expect(completionOutcome('2026-06-15', '2026-06-18')).toEqual({ text: '3d late', tone: 'outcome' })
    expect(completionOutcome('2026-06-15', '2026-06-16')).toEqual({ text: '1d late', tone: 'outcome' })
  })

  it('reads on time when the task landed on or before its due date', () => {
    expect(completionOutcome('2026-06-15', '2026-06-15')).toEqual({ text: 'On time', tone: 'outcome' })
    expect(completionOutcome('2026-06-15', '2026-06-01')).toEqual({ text: 'On time', tone: 'outcome' })
  })
})

describe('date formatting', () => {
  const ZONES = ['UTC', 'America/New_York', 'Pacific/Kiritimati']

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns an empty string for empty or invalid dates', () => {
    expect(formatDate('')).toBe('')
    expect(formatDateShort('not-a-date')).toBe('')
    expect(formatDateLong('')).toBe('')
  })

  // A YYYY-MM-DD field names a calendar day, not an instant: read as an instant it lands on
  // the day before wherever the clock is behind UTC.
  it.each(ZONES)('names the day the field says in %s', (zone) => {
    vi.stubEnv('TZ', zone)
    expect(formatDate('2026-03-28')).toContain('28')
    expect(formatDateShort('2026-03-28')).toContain('28')
    expect(formatDateLong('2026-03-28')).toContain('28')
  })

  it.each(ZONES)('keeps both ends of a range on their own day in %s', (zone) => {
    vi.stubEnv('TZ', zone)
    const range = formatDateRange(Temporal.PlainDate.from('2026-04-07'), Temporal.PlainDate.from('2026-04-13'))
    expect(range).toContain('7')
    expect(range).toContain('13')
  })

  it('orders a range the way the language does', () => {
    setLocale('de')
    expect(formatDateRange(Temporal.PlainDate.from('2026-04-07'), Temporal.PlainDate.from('2026-04-13'))).toBe(
      '7.–13. Apr.'
    )
    setLocale('en')
  })
})

describe('custom date format', () => {
  afterEach(() => {
    setDateFormat('')
    setLocale('en')
  })

  it('writes numeric tokens with and without padding', () => {
    setDateFormat('DD.MM.YYYY')
    expect(formatDate('2026-03-08')).toBe('08.03.2026')
    setDateFormat('D/M/YY')
    expect(formatDate('2026-03-08')).toBe('8/3/26')
  })

  it('applies to the short and long formats too', () => {
    setDateFormat('YYYY-MM-DD')
    expect(formatDateShort('2026-03-08')).toBe('2026-03-08')
    expect(formatDateLong('2026-03-08')).toBe('2026-03-08')
  })

  it('names months and weekdays in the interface language', () => {
    setDateFormat('ddd, D MMM')
    expect(formatDate('2026-03-08')).toBe('Sun, 8 Mar')
    setDateFormat('dddd D MMMM')
    setLocale('de')
    expect(formatDate('2026-03-08')).toBe('Sonntag 8 März')
  })

  it('keeps bracketed text as written', () => {
    setDateFormat('[Day] D [of] MMMM')
    expect(formatDate('2026-03-08')).toBe('Day 8 of March')
  })

  it('returns an empty string for empty or invalid dates', () => {
    setDateFormat('YYYY-MM-DD')
    expect(formatDate('')).toBe('')
    expect(formatDateShort('not-a-date')).toBe('')
  })

  it('falls back to the language format when blank', () => {
    setDateFormat('   ')
    expect(formatDate('2026-03-08')).toBe('Mar 8, 2026')
  })
})
