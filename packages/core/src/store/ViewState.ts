import type { FilterState, GanttGranularity, GroupState, SavedView, SortRule, ViewMode } from '../types'

/** What a view is showing right now, in the terms a saved view stores. */
export interface ViewState {
  filter: FilterState
  sort: SortRule[]
  group: GroupState
  mode: ViewMode
  granularity: GanttGranularity
}

export type ViewPart = 'filter' | 'sort' | 'group' | 'mode' | 'scale'

/** JSON with object keys in a fixed order, so two equal values always compare equal. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  )
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b)
}

/**
 * The parts of `state` that differ from `view`. A view that names no grouping, mode or
 * scale doesn't care which one is showing.
 */
export function viewDifferences(view: SavedView, state: ViewState): ViewPart[] {
  const parts: ViewPart[] = []
  if (!sameValue(view.filter, state.filter)) parts.push('filter')
  if (!sameValue(view.sort, state.sort)) parts.push('sort')
  if (view.group && !sameValue(view.group, state.group)) parts.push('group')
  if (view.viewMode && view.viewMode !== state.mode) parts.push('mode')
  if (view.ganttGranularity && view.ganttGranularity !== state.granularity) parts.push('scale')
  return parts
}
