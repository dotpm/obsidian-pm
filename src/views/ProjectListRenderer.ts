import { Menu } from 'obsidian'
import type PMPlugin from '#main'
import { folderOf, projectFolderOf, type ProjectRef } from '#store'
import {
  type ProjectGroupBy,
  type ProjectListGroup,
  type ProjectListItem,
  type ProjectListRow,
  formatDateShort,
  dateUrgency,
  t
} from '@dotpm/core'
import { safeAsync, CollapseToggle, ProjectRow } from '@dotpm/ui'
import { linkedRefs } from './linkedRefs'

const columns = (): { label: string; cls?: string }[] => [
  { label: '' },
  { label: t('columns.project'), cls: 'pm-project-th-title' },
  { label: t('columns.progress') },
  { label: t('columns.tasks') },
  { label: t('columns.members') },
  { label: t('columns.due') },
  { label: '' }
]

export interface ProjectListContext {
  plugin: PMPlugin
  contentEl: HTMLElement
  openProject: (path: string) => Promise<void>
  /** Draws the list again after a row changed something about it. */
  redraw: () => void
}

/** Every project the list covers, as trees, with the rolled-up counts a parent row shows. */
export function projectListItems(plugin: PMPlugin): ProjectListItem[] {
  const { index } = plugin
  const showArchived = plugin.settings.showArchivedProjects
  const itemOf = (ref: ProjectRef): ProjectListItem => {
    const children = index.childRefs(ref.path, showArchived)
    const { total, done } = children.length ? index.rollupCounts(ref) : index.counts(ref)
    const { overdue, latestDue } = children.length ? index.rollupDueSummary(ref) : index.dueSummary(ref)
    return {
      path: ref.path,
      title: ref.title,
      folder: folderOf(projectFolderOf(plugin.app, ref.path) ?? ref.path),
      tags: ref.tags,
      done,
      total,
      overdue,
      latestDue,
      children: children.map(itemOf)
    }
  }
  return index.rootRefs(showArchived).map(itemOf)
}

/** The rows, each group under a heading row that collapses it; `collapsedGroups` is edited in place. */
export function renderProjectTable(
  ctx: ProjectListContext,
  groups: ProjectListGroup[],
  groupBy: ProjectGroupBy,
  collapsedGroups: Set<string>
): void {
  const wrapper = ctx.contentEl.createDiv('pm-table-wrapper')
  wrapper.setAttr('data-borders', ctx.plugin.settings.lineBorders)
  const table = wrapper.createEl('table', { cls: 'pm-table pm-project-table' })
  const headRow = table.createEl('thead').createEl('tr')
  for (const column of columns()) headRow.createEl('th', { text: column.label, cls: column.cls })
  const tbody = table.createEl('tbody')
  for (const group of groups) {
    const collapsed = group.key !== null && collapsedGroups.has(group.key)
    if (group.key !== null) {
      const key = group.key
      const row = tbody.createEl('tr', { cls: 'pm-project-group-row' })
      const cell = row.createEl('td', { attr: { colspan: String(columns().length) } })
      const inner = cell.createDiv('pm-project-group')
      new CollapseToggle(inner, {
        collapsed,
        subject: groupLabel(groupBy, key),
        onToggle: () => {
          if (collapsed) collapsedGroups.delete(key)
          else collapsedGroups.add(key)
          ctx.redraw()
        }
      })
      inner.createSpan({ cls: 'pm-project-group-label', text: groupLabel(groupBy, key) })
      inner.createSpan({ cls: 'pm-project-group-count', text: String(group.count) })
    }
    if (!collapsed) for (const row of group.rows) renderRow(ctx, tbody, row)
  }
}

function groupLabel(groupBy: ProjectGroupBy, key: string): string {
  if (groupBy === 'tag') return key ? `#${key}` : t('list.noTag')
  return key ? `${key}/` : t('list.noFolder')
}

function renderRow(ctx: ProjectListContext, tbody: HTMLElement, row: ProjectListRow): void {
  const { index } = ctx.plugin
  const { item } = row
  const ref = index.projectRef(item.path)
  if (!ref) return
  new ProjectRow(tbody, {
    title: ref.title,
    icon: ref.icon,
    color: ref.color,
    depth: row.depth,
    treeGuides: ctx.plugin.settings.showSubtreeConnections ? row.guides : null,
    isLastChild: row.isLastChild,
    childCount: row.childCount,
    collapsed: row.collapsed,
    archived: index.isArchived(item.path),
    tasksDone: item.done,
    tasksTotal: item.total,
    overdue: item.overdue,
    members: linkedRefs(ctx.plugin.app, ref.teamMembers, ref.path),
    dueLabel: formatDateShort(item.latestDue),
    dueUrgency: dateUrgency(item.latestDue, item.overdue > 0),
    onToggleCollapsed: row.collapsible
      ? safeAsync(async () => {
          await ctx.plugin.toggleProjectCollapsed(item.path)
          ctx.redraw()
        })
      : undefined,
    onClick: safeAsync(() => ctx.openProject(item.path)),
    onContextMenu: (e) => openProjectContextMenu(ctx, ref, e),
    onActions: (e) => openProjectContextMenu(ctx, ref, e)
  })
}

function openProjectContextMenu(ctx: ProjectListContext, ref: ProjectRef, e: MouseEvent): void {
  const menu = new Menu()
  menu.addItem((item) =>
    item
      .setTitle(t('project.openOverview'))
      .setIcon('file-text')
      .onClick(safeAsync(() => ctx.plugin.router.openProjectOverview(ref.path)))
  )
  menu.addItem((item) =>
    item
      .setTitle(t('project.openTasks'))
      .setIcon('table')
      .onClick(safeAsync(() => ctx.plugin.router.openScope({ kind: 'project', path: ref.path })))
  )
  if (ctx.plugin.index.childRefs(ref.path).length) {
    menu.addItem((item) =>
      item
        .setTitle(t('project.openWithSubProjects'))
        .setIcon('layers')
        .onClick(safeAsync(() => ctx.plugin.router.openScope({ kind: 'subtree', path: ref.path })))
    )
  }
  menu.addItem((item) =>
    item
      .setTitle(t('commands.duplicateProject'))
      .setIcon('copy')
      .onClick(
        safeAsync(async () => {
          const project = await ctx.plugin.store.loadProjectByPath(ref.path)
          if (!project) return
          await ctx.plugin.duplicateProjectFlow(project)
        })
      )
  )
  menu.addItem((item) =>
    item
      .setTitle(t('project.edit'))
      .setIcon('settings')
      .onClick(safeAsync(() => ctx.plugin.router.openProjectEdit(ref.path)))
  )
  if (!ctx.plugin.index.isArchived(ref.path)) {
    menu.addItem((item) =>
      item
        .setTitle(t('project.archive'))
        .setIcon('archive')
        .onClick(safeAsync(() => ctx.plugin.setProjectArchived(ref.path, true)))
    )
  } else if (ref.archived) {
    menu.addItem((item) =>
      item
        .setTitle(t('project.unarchive'))
        .setIcon('archive-restore')
        .onClick(safeAsync(() => ctx.plugin.setProjectArchived(ref.path, false)))
    )
  }
  menu.addItem((item) =>
    item
      .setTitle(t('project.delete'))
      .setIcon('trash')
      .onClick(
        safeAsync(async () => {
          const project = await ctx.plugin.store.loadProjectByPath(ref.path)
          if (!project) return
          await ctx.plugin.store.deleteProject(project)
          ctx.redraw()
        })
      )
  )
  menu.showAtMouseEvent(e)
}
