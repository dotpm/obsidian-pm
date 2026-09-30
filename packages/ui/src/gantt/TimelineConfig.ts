import {
  type Task,
  type GanttGranularity,
  type NonWorkingDays,
  flattenTasks,
  Temporal,
  today,
  parsePlainDate
} from '@dotpm/core'

export const ROW_HEIGHT = 44
export const HEADER_HEIGHT = 56
export const LABEL_WIDTH = 280
export const BAR_PADDING = 8
export const BAR_BORDER_RADIUS = 7

export const DAY_WIDTH: Record<GanttGranularity, number> = {
  day: 44,
  week: 22,
  month: 9,
  quarter: 5,
  year: 2
}

export const MIN_ZOOM = 50
export const MAX_ZOOM = 400
/** The stops the zoom buttons step through, in percent. */
export const ZOOM_STEPS = [50, 67, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400]

export interface TimelineCfg {
  startDate: Temporal.PlainDate
  endDate: Temporal.PlainDate
  dayWidth: number
  granularity: GanttGranularity
  totalDays: number
  totalWidth: number
  /** Per day from `startDate`: whether the axis leaves it out. */
  hidden: Uint8Array
  /** Per day from `startDate`, plus one past the end: how many shown days come before it. */
  columns: Int32Array
}

export interface TimelineOptions {
  /** Percent of the scale's own day width. */
  zoom?: number
  /** Days the axis leaves out, a day at a time. */
  isHidden?: (date: Temporal.PlainDate) => boolean
  /** Width in pixels the shown days must at least fill; the range runs on past the last task until they do. */
  minWidth?: number
}

/** The days `days` leaves out: Saturdays and Sundays, and the listed holidays. */
export function nonWorkingDay(
  days: NonWorkingDays,
  holidays: readonly string[]
): ((date: Temporal.PlainDate) => boolean) | undefined {
  if (!days.weekends && !(days.holidays && holidays.length)) return undefined
  const off = new Set(days.holidays ? holidays : [])
  return (date) => (!!days.weekends && date.dayOfWeek >= 6) || off.has(date.toString())
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)))
}

/** The next zoom stop past `zoom` in `direction`, or `zoom` itself at either end. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next =
    direction > 0 ? ZOOM_STEPS.find((step) => step > zoom) : [...ZOOM_STEPS].reverse().find((step) => step < zoom)
  return next ?? zoom
}

const MIN_DAYS: Record<GanttGranularity, number> = {
  day: 30,
  week: 90,
  month: 365,
  quarter: 365,
  year: 1095
}

export function buildTimelineConfig(
  tasks: Task[],
  granularity: GanttGranularity,
  options: TimelineOptions = {}
): TimelineCfg {
  const allTasks = flattenTasks(tasks).map((f) => f.task)
  const dates: Temporal.PlainDate[] = []

  for (const t of allTasks) {
    const start = parsePlainDate(t.start)
    const due = parsePlainDate(t.due)
    if (start) dates.push(start)
    if (due) dates.push(due)
  }

  const now = today()
  dates.push(now)

  let startDate = dates.reduce((min, d) => (Temporal.PlainDate.compare(d, min) < 0 ? d : min), dates[0])
  let endDate = dates.reduce((max, d) => (Temporal.PlainDate.compare(d, max) > 0 ? d : max), dates[0])

  startDate = startDate.subtract({ days: 7 })
  endDate = endDate.add({ days: 14 })

  const currentSpan = endDate.since(startDate, { largestUnit: 'days' }).days
  if (currentSpan < MIN_DAYS[granularity]) {
    const extra = Math.ceil((MIN_DAYS[granularity] - currentSpan) / 2)
    startDate = startDate.subtract({ days: extra })
    endDate = endDate.add({ days: extra })
  }

  if (granularity !== 'day') {
    startDate = startDate.with({ day: 1 })
  }

  const dayWidth = (DAY_WIDTH[granularity] * clampZoom(options.zoom ?? 100)) / 100
  const span = endDate.since(startDate, { largestUnit: 'days' }).days
  const minColumns = Math.ceil((options.minWidth ?? 0) / dayWidth)
  const hiddenFlags: number[] = []
  let shownDays = 0
  for (let i = 0; i < span || shownDays < minColumns; i++) {
    const isHidden = options.isHidden?.(startDate.add({ days: i })) ? 1 : 0
    hiddenFlags.push(isHidden)
    shownDays += 1 - isHidden
  }
  const totalDays = hiddenFlags.length
  endDate = startDate.add({ days: totalDays })
  const hidden = Uint8Array.from(hiddenFlags)
  const columns = new Int32Array(totalDays + 1)
  for (let i = 0; i < totalDays; i++) columns[i + 1] = columns[i] + (hidden[i] ? 0 : 1)
  return {
    startDate,
    endDate,
    dayWidth,
    granularity,
    totalDays,
    totalWidth: columns[totalDays] * dayWidth,
    hidden,
    columns
  }
}

/** The column day `index` (from `startDate`) starts at. Days outside the range run on one per column. */
function columnOf(cfg: TimelineCfg, index: number): number {
  if (index <= 0) return index
  if (index >= cfg.totalDays) return cfg.columns[cfg.totalDays] + index - cfg.totalDays
  return cfg.columns[index]
}

/** The left edge of day `index`; a hidden day takes no width, so it sits where the next shown day starts. */
export function dayX(cfg: TimelineCfg, index: number): number {
  return columnOf(cfg, index) * cfg.dayWidth
}

export function isHiddenDay(cfg: TimelineCfg, index: number): boolean {
  return cfg.hidden[index] === 1
}

export function dateToX(cfg: TimelineCfg, date: Temporal.PlainDate): number {
  return dayX(cfg, date.since(cfg.startDate, { largestUnit: 'days' }).days)
}

/** The day whose column starts at `column`: the first shown day at or after it. */
function dayAtColumn(cfg: TimelineCfg, column: number): Temporal.PlainDate {
  const shown = cfg.columns[cfg.totalDays]
  if (column <= 0) return cfg.startDate.add({ days: column })
  if (column >= shown) return cfg.startDate.add({ days: cfg.totalDays + column - shown })
  let low = 0
  let high = cfg.totalDays
  while (low < high) {
    const mid = (low + high) >> 1
    if (cfg.columns[mid] < column) low = mid + 1
    else high = mid
  }
  while (low < cfg.totalDays && cfg.hidden[low]) low++
  return cfg.startDate.add({ days: low })
}

/** The day that starts at the column edge nearest `x`. */
export function xToDate(cfg: TimelineCfg, x: number): Temporal.PlainDate {
  return dayAtColumn(cfg, Math.round(x / cfg.dayWidth))
}

/** The last shown day before the column edge nearest `x`: where a bar ending at `x` is due. */
export function xToLastDate(cfg: TimelineCfg, x: number): Temporal.PlainDate {
  return dayAtColumn(cfg, Math.round(x / cfg.dayWidth) - 1)
}

/**
 * Snap-point X positions. day: every day border. week: Monday and Thursday.
 * month: 1st, ~8th, ~15th, ~22nd. quarter and year: the 1st of each month.
 */
export function getSnapPoints(cfg: TimelineCfg): number[] {
  const points: number[] = []
  const { startDate, totalDays, granularity } = cfg

  for (let i = 0; i <= totalDays; i++) {
    if (isHiddenDay(cfg, i)) continue
    const d = startDate.add({ days: i })
    const x = dayX(cfg, i)

    if (granularity === 'day') {
      points.push(x)
    } else if (granularity === 'week') {
      // Temporal dayOfWeek runs Mon=1 to Sun=7.
      if (d.dayOfWeek === 1 || d.dayOfWeek === 4) points.push(x)
    } else if (granularity === 'month') {
      if (d.day === 1 || d.day === 8 || d.day === 15 || d.day === 22) points.push(x)
    } else if (d.day === 1) {
      points.push(x)
    }
  }
  return points
}

/** Snap an x position to the nearest snap point within a threshold. */
export function snapX(x: number, snapPoints: number[], threshold: number): number {
  let closest = x
  let minDist = Infinity
  for (const sp of snapPoints) {
    const dist = Math.abs(x - sp)
    if (dist < minDist) {
      minDist = dist
      closest = sp
    }
    if (sp > x + threshold) break // snap points are sorted, no need to continue
  }
  return minDist <= threshold ? closest : x
}

export function getWeekNumber(d: Temporal.PlainDate): number {
  return d.weekOfYear ?? 0
}
