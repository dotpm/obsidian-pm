import type { ProjectListFilter, ProjectListState, ProjectProgress, ProjectSortRule } from '../types'

/**
 * One project as the project list sees it, with its sub-projects. `done`, `total`,
 * `overdue` and `latestDue` already roll up the sub-projects for a parent.
 */
export interface ProjectListItem {
  path: string
  title: string
  /** The folder holding the project's own folder, `''` at the vault root. */
  folder: string
  tags: string[]
  done: number
  total: number
  overdue: number
  latestDue: string
  children: ProjectListItem[]
}

export interface ProjectListRow {
  item: ProjectListItem
  depth: number
  /** One entry per indent column: does an ancestor at that column still have rows below it. */
  guides: boolean[]
  isLastChild: boolean
  /** Sub-projects that made it into the list. */
  childCount: number
}

export interface ProjectListGroup {
  /** The folder or tag the group stands for; `''` for no folder or no tag. Null when the list isn't grouped. */
  key: string | null
  rows: ProjectListRow[]
  /** Projects in the group that match, not counting ancestors kept to show where they sit. */
  count: number
}

export function projectProgress(item: ProjectListItem): ProjectProgress {
  if (item.total > 0 && item.done >= item.total) return 'complete'
  return item.done > 0 ? 'in-progress' : 'not-started'
}

export function countProjectFilters(filter: ProjectListFilter): number {
  return (filter.tags?.length ? 1 : 0) + (filter.progress?.length ? 1 : 0)
}

export function isProjectQueryActive(filter: ProjectListFilter, text: string): boolean {
  return countProjectFilters(filter) > 0 || text.trim() !== ''
}

function matches(item: ProjectListItem, filter: ProjectListFilter, text: string): boolean {
  const needle = text.trim().toLowerCase()
  if (needle && !item.title.toLowerCase().includes(needle)) return false
  if (filter.tags?.length && !item.tags.some((tag) => filter.tags?.includes(tag))) return false
  if (filter.progress?.length && !filter.progress.includes(projectProgress(item))) return false
  return true
}

const ratio = (item: ProjectListItem): number => (item.total ? item.done / item.total : 0)

function compareItems(a: ProjectListItem, b: ProjectListItem, sort: ProjectSortRule[]): number {
  for (const { key, dir } of sort) {
    // A project with no dates sorts after every dated one, whichever way the dates run.
    if (key === 'due' && (!a.latestDue || !b.latestDue)) {
      const undated = Number(!a.latestDue) - Number(!b.latestDue)
      if (undated !== 0) return undated
      continue
    }
    const order =
      key === 'title'
        ? a.title.localeCompare(b.title)
        : key === 'progress'
          ? ratio(a) - ratio(b)
          : a.latestDue.localeCompare(b.latestDue)
    if (order !== 0) return dir === 'asc' ? order : -order
  }
  return 0
}

/** Every project in the trees, sub-projects included. */
export function allProjectItems(roots: ProjectListItem[]): ProjectListItem[] {
  return roots.flatMap((item) => [item, ...allProjectItems(item.children)])
}

/** Each tag used by any project, with how many projects carry it, by name. */
export function projectTagCounts(roots: ProjectListItem[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of allProjectItems(roots)) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag))
}

/**
 * The project list as it is drawn: grouped when asked, each group a tree of rows in sort
 * order. A query keeps a project when it or a sub-project matches, so a match is always
 * shown under its parents, and it opens every collapsed parent on the way.
 */
export function arrangeProjects(
  roots: ProjectListItem[],
  state: ProjectListState,
  text: string,
  isCollapsed: (path: string) => boolean
): { groups: ProjectListGroup[]; shown: number; total: number } {
  const active = isProjectQueryActive(state.filter, text)
  const hit = new Set(
    allProjectItems(roots)
      .filter((item) => matches(item, state.filter, text))
      .map((item) => item.path)
  )
  const kept = (item: ProjectListItem): boolean => hit.has(item.path) || item.children.some(kept)
  const ordered = (items: ProjectListItem[]): ProjectListItem[] =>
    items.filter(kept).sort((a, b) => compareItems(a, b, state.sort))

  const flatten = (items: ProjectListItem[], trail: boolean[], rows: ProjectListRow[]): ProjectListRow[] => {
    const list = ordered(items)
    list.forEach((item, i) => {
      const isLastChild = i === list.length - 1
      const children = ordered(item.children)
      rows.push({ item, depth: trail.length, guides: trail, isLastChild, childCount: children.length })
      if (children.length && (active || !isCollapsed(item.path))) flatten(item.children, [...trail, !isLastChild], rows)
    })
    return rows
  }
  const countIn = (items: ProjectListItem[]): number =>
    allProjectItems(items).filter((item) => hit.has(item.path)).length

  const total = allProjectItems(roots).length
  if (state.group === 'none') {
    const rows = flatten(roots, [], [])
    return { groups: rows.length ? [{ key: null, rows, count: countIn(roots) }] : [], shown: hit.size, total }
  }

  const byKey = new Map<string, ProjectListItem[]>()
  for (const root of roots) {
    const keys = state.group === 'folder' ? [root.folder] : root.tags.length ? root.tags : ['']
    for (const key of keys) byKey.set(key, [...(byKey.get(key) ?? []), root])
  }
  const keys = [...byKey.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  const groups = keys
    .map((key) => {
      const members = byKey.get(key) ?? []
      return { key, rows: flatten(members, [], []), count: countIn(members) }
    })
    .filter((group) => group.rows.length)
  return { groups, shown: hit.size, total }
}
