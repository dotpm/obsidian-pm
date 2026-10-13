// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { makeTask, Temporal } from '@dotpm/core'
import { svgEl } from '#dom'
import type { GanttCanvas } from './canvas'
import { barExtent, dateSpan, drawSpanWhiskers, spanExtent } from './bars'
import { buildTimelineConfig } from './TimelineConfig'

const range = (tasks: Parameters<typeof dateSpan>[0]) => {
  const span = dateSpan(tasks)
  return span && [span.start.toString(), span.end.toString()]
}

describe('dateSpan', () => {
  it('reaches past the parent to its latest subtask', () => {
    const parent = makeTask({
      start: '2026-10-05',
      due: '2026-10-20',
      subtasks: [makeTask({ start: '2026-10-15', due: '2026-11-03' })]
    })
    expect(range([parent])).toEqual(['2026-10-05', '2026-11-03'])
  })

  it('counts a subtask that starts before its parent', () => {
    const parent = makeTask({
      start: '2026-10-05',
      due: '2026-10-20',
      subtasks: [makeTask({ start: '', subtasks: [makeTask({ start: '2026-09-28', due: '2026-10-01' })] })]
    })
    expect(range([parent])).toEqual(['2026-09-28', '2026-10-20'])
  })

  it('takes a task with only one date as that single day', () => {
    expect(range([makeTask({ start: '', due: '2026-10-07' }), makeTask({ start: '2026-10-09' })])).toEqual([
      '2026-10-07',
      '2026-10-09'
    ])
  })

  it('is null when nothing is dated', () => {
    expect(dateSpan([makeTask({ start: '', subtasks: [makeTask({ start: '' })] })])).toBeNull()
  })
})

describe('drawSpanWhiskers', () => {
  const sample = [makeTask({ start: '2026-09-01', due: '2026-12-31' })]
  const canvas = (): GanttCanvas => ({
    svgEl: svgEl('svg', {}),
    headerSvgEl: svgEl('svg', {}),
    cfg: buildTimelineConfig(sample, 'week'),
    weekLabel: 'weekNumber'
  })
  const span = (start: string, end: string) => ({
    start: Temporal.PlainDate.from(start),
    end: Temporal.PlainDate.from(end)
  })
  /** The subpaths of the drawn line, as [x1, y1, x2, y2]. */
  const strokes = (group: SVGGElement | null) =>
    (group?.querySelector('.pm-gantt-span-line')?.getAttribute('d') ?? '')
      .split('M')
      .filter((part) => part.trim())
      .map((part) => part.replace('L', ' ').trim().split(/\s+/).map(Number))
  const horizontal = (s: number[]) => s[1] === s[3]

  it('runs a capped line from the bar out to the last folded day, on that side only', () => {
    const c = canvas()
    const task = makeTask({ start: '2026-10-05', due: '2026-10-09' })
    const folded = span('2026-10-05', '2026-11-03')
    const group = drawSpanWhiskers(svgEl('g', {}), c, 0, folded, 'red', barExtent(c, task))

    const barEnd = barExtent(c, task)?.x2
    const { x2 } = spanExtent(c, folded)
    const lines = strokes(group)
    expect(lines.filter(horizontal)).toEqual([[x2, lines[1][1], barEnd, lines[1][1]]])
    expect(lines.filter((s) => !horizontal(s)).map((s) => s[0])).toEqual([x2])
  })

  it('draws on both sides when the folded tasks start earlier and end later', () => {
    const c = canvas()
    const task = makeTask({ start: '2026-10-05', due: '2026-10-09' })
    const lines = strokes(
      drawSpanWhiskers(svgEl('g', {}), c, 0, span('2026-09-20', '2026-11-03'), 'red', barExtent(c, task))
    )
    expect(lines.filter(horizontal)).toHaveLength(2)
    expect(lines.filter((s) => !horizontal(s))).toHaveLength(2)
  })

  it('draws nothing when the folded tasks stay inside the bar', () => {
    const c = canvas()
    const task = makeTask({ start: '2026-10-05', due: '2026-10-20' })
    expect(
      drawSpanWhiskers(svgEl('g', {}), c, 0, span('2026-10-06', '2026-10-20'), 'red', barExtent(c, task))
    ).toBeNull()
  })

  it('spans the whole range without a bar, as for a project', () => {
    const c = canvas()
    const folded = span('2026-10-05', '2026-11-03')
    const lines = strokes(drawSpanWhiskers(svgEl('g', {}), c, 0, folded, 'red', null))
    const { x1, x2 } = spanExtent(c, folded)
    expect(lines.filter(horizontal).map((s) => [s[0], s[2]])).toEqual([[x1, x2]])
    expect(lines.filter((s) => !horizontal(s)).map((s) => s[0])).toEqual([x1, x2])
  })
})
