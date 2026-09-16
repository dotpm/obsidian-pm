import { Menu, ButtonComponent } from 'obsidian'
import type PMPlugin from '#main'
import type { ProjectRef } from '#store'
import { formatDateShort, dateUrgency, t, tn } from '@dotpm/core'
import { safeAsync, ChipButton, EmptyState, ProjectRow, childTreeGuides } from '@dotpm/ui'
import { openProjectCreate } from '#ui/ModalFactory'
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
  toolbarEl: HTMLElement
  contentEl: HTMLElement
  openProject: (path: string) => Promise<void>
}

export function renderProjectListToolbar(ctx: ProjectListContext): void {
  ctx.toolbarEl.empty()
  const left = ctx.toolbarEl.createDiv('pm-toolbar-left')
  left.createEl('h2', { text: 'Projects', cls: 'pm-toolbar-title' })
  const line = countLine(ctx)
  if (line) left.createSpan({ cls: 'pm-project-list-count', text: line })

  const { settings } = ctx.plugin
  if (
    settings.showArchivedProjects ||
    ctx.plugin.index.projectRefs(true).length > ctx.plugin.index.projectRefs().length
  ) {
    new ChipButton(ctx.toolbarEl)
      .setLabel(t('common.archived'))
      .setActive(settings.showArchivedProjects)
      .onClick(
        safeAsync(async () => {
          settings.showArchivedProjects = !settings.showArchivedProjects
          await ctx.plugin.saveSettings()
          renderProjectListToolbar(ctx)
          renderProjectListContent(ctx)
        })
      )
  }

  new ButtonComponent(ctx.toolbarEl)
    .setButtonText(t('list.newProject'))
    .setCta()
    .onClick(() => openProjectCreate(ctx.plugin))
}

function countLine(ctx: ProjectListContext): string {
  const refs = ctx.plugin.index.projectRefs()
  const archived = ctx.plugin.index.projectRefs(true).length - refs.length
  if (refs.length === 0 && archived === 0) return ''
  const behind = refs.filter((ref) => ctx.plugin.index.dueSummary(ref).overdue > 0).length
  const bits = [tn('count.projects', refs.length)]
  if (behind) bits.push(tn('list.behind', behind))
  if (archived) bits.push(tn('list.archivedCount', archived))
  return bits.join(' · ')
}

export function renderProjectListContent(ctx: ProjectListContext): void {
  const showArchived = ctx.plugin.settings.showArchivedProjects
  const roots = ctx.plugin.index.rootRefs(showArchived)
  ctx.contentEl.empty()

  if (roots.length === 0) {
    if (!ctx.plugin.index.ready) {
      new EmptyState(ctx.contentEl).setIcon('📋').setTitle(t('list.looking'))
      return
    }
    if (ctx.plugin.index.projectRefs(true).length) {
      new EmptyState(ctx.contentEl).setIcon('📋').setTitle(t('list.allArchived')).setBody(t('list.allArchivedBody'))
      return
    }
    new EmptyState(ctx.contentEl)
      .setIcon('📋')
      .setTitle(t('list.empty'))
      .setBody(t('list.emptyBody'))
      .setAction(t('list.newProject'), () => openProjectCreate(ctx.plugin))
    return
  }

  const wrapper = ctx.contentEl.createDiv('pm-table-wrapper')
  wrapper.setAttr('data-borders', ctx.plugin.settings.lineBorders)
  const table = wrapper.createEl('table', { cls: 'pm-table pm-project-table' })
  const headRow = table.createEl('thead').createEl('tr')
  for (const column of columns()) headRow.createEl('th', { text: column.label, cls: column.cls })
  renderRows(ctx, table.createEl('tbody'), roots, [])
}

function renderRows(ctx: ProjectListContext, tbody: HTMLElement, refs: ProjectRef[], trail: boolean[]): void {
  const index = ctx.plugin.index
  const showArchived = ctx.plugin.settings.showArchivedProjects
  refs.forEach((ref, i) => {
    const children = index.childRefs(ref.path, showArchived)
    const collapsed = ctx.plugin.isProjectCollapsed(ref.path)
    const { total, done } = children.length ? index.rollupCounts(ref) : index.counts(ref)
    const { overdue, latestDue } = children.length ? index.rollupDueSummary(ref) : index.dueSummary(ref)
    const isLastChild = i === refs.length - 1

    new ProjectRow(tbody, {
      title: ref.title,
      icon: ref.icon,
      color: ref.color,
      depth: trail.length,
      treeGuides: ctx.plugin.settings.showSubtreeConnections ? trail : null,
      isLastChild,
      childCount: children.length,
      collapsed,
      archived: index.isArchived(ref.path),
      tasksDone: done,
      tasksTotal: total,
      overdue,
      members: linkedRefs(ctx.plugin.app, ref.teamMembers, ref.path),
      dueLabel: formatDateShort(latestDue),
      dueUrgency: dateUrgency(latestDue, overdue > 0),
      onToggleCollapsed: safeAsync(async () => {
        await ctx.plugin.toggleProjectCollapsed(ref.path)
        renderProjectListContent(ctx)
      }),
      onClick: safeAsync(() => ctx.openProject(ref.path)),
      onContextMenu: (e) => openProjectContextMenu(ctx, ref, e),
      onActions: (e) => openProjectContextMenu(ctx, ref, e)
    })

    if (children.length && !collapsed) renderRows(ctx, tbody, children, childTreeGuides(trail, isLastChild))
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
          renderProjectListContent(ctx)
        })
      )
  )
  menu.showAtMouseEvent(e)
}
