import { Menu, ButtonComponent } from 'obsidian'
import type PMPlugin from '#main'
import type { ProjectRef } from '#store'
import { formatDateShort, dateUrgency, PROJECT_TAG_PALETTE, projectTagColor, sanitizeTagSegment } from '@dotpm/core'
import { safeAsync, EmptyState, ProjectRow, ChipButton, childTreeGuides, renderMultiSelect } from '@dotpm/ui'
import { openProjectCreate } from '#ui/ModalFactory'
import { linkedRefs } from './linkedRefs'

const DOTPM_TAG_PREFIX = 'dotpm/'
const PROJECT_TAG_PALETTE_IDS = new Set(PROJECT_TAG_PALETTE.map((entry) => entry.id))
const ACTIVE_TAB = 'active'

function projectTagLabel(tag: string): string {
  return tag.startsWith(DOTPM_TAG_PREFIX) ? tag.slice(DOTPM_TAG_PREFIX.length) : tag
}

const COLUMNS: { label: string; cls?: string }[] = [
  { label: '' },
  { label: 'Project', cls: 'pm-project-th-title' },
  { label: 'Progress' },
  { label: 'Tasks' },
  { label: 'Members' },
  { label: 'Due' },
  { label: '' }
]

/** 'active' (the unfiltered master view), or a literal `dotpm/<tag>` id — the tab and the tag are the same string. */
export type ProjectListTab = string

export interface ProjectListContext {
  plugin: PMPlugin
  toolbarEl: HTMLElement
  contentEl: HTMLElement
  tab: ProjectListTab
  openProject: (path: string) => Promise<void>
  onTabChange: (tab: ProjectListTab) => void
}

/** Every distinct `dotpm/*` tag at least one project carries, palette entries first, then custom ones A-Z. */
function tagsInUse(ctx: ProjectListContext): string[] {
  const seen = new Set<string>()
  for (const ref of ctx.plugin.index.projectRefs()) {
    for (const t of ref.tags) if (t.startsWith(DOTPM_TAG_PREFIX)) seen.add(t)
  }
  const paletteOrder = PROJECT_TAG_PALETTE.map((entry) => entry.id).filter((id) => seen.has(id))
  const custom = [...seen].filter((id) => !PROJECT_TAG_PALETTE_IDS.has(id)).sort()
  return [...paletteOrder, ...custom]
}

/** Active is the unfiltered master view — every project belongs to it, tagged or not. */
function tabMatches(tab: ProjectListTab, ref: ProjectRef): boolean {
  return tab === ACTIVE_TAB ? true : ref.tags.includes(tab)
}

/**
 * The nearest ancestor that also belongs to this tab, skipping over any that don't — a
 * tagged project nested under an untagged (or differently tagged) parent still surfaces
 * rather than getting lost, either nested under that ancestor or as its own root.
 */
function matchingParent(ctx: ProjectListContext, tab: ProjectListTab, ref: ProjectRef): ProjectRef | null {
  const index = ctx.plugin.index
  for (let parent = index.parentOf(ref.path); parent; parent = index.parentOf(parent.path)) {
    if (tabMatches(tab, parent)) return parent
  }
  return null
}

function tabRoots(ctx: ProjectListContext, tab: ProjectListTab): ProjectRef[] {
  return ctx.plugin.index.projectRefs().filter((ref) => tabMatches(tab, ref) && !matchingParent(ctx, tab, ref))
}

function childrenFor(ctx: ProjectListContext, ref: ProjectRef): ProjectRef[] {
  const tab = ctx.tab
  return ctx.plugin.index
    .projectRefs()
    .filter((child) => tabMatches(tab, child) && matchingParent(ctx, tab, child)?.path === ref.path)
}

function tabCount(ctx: ProjectListContext, tab: ProjectListTab): number {
  return ctx.plugin.index.projectRefs().filter((ref) => tabMatches(tab, ref)).length
}

export function renderProjectListToolbar(ctx: ProjectListContext): void {
  ctx.toolbarEl.empty()
  const left = ctx.toolbarEl.createDiv('pm-toolbar-left')
  left.createEl('h2', { text: 'Projects', cls: 'pm-toolbar-title' })

  const tabs = left.createDiv('pm-chip-group')
  const used = tagsInUse(ctx)
  // Keeps the current tab visible even if its last project was just untagged elsewhere.
  const ids = ctx.tab !== ACTIVE_TAB && !used.includes(ctx.tab) ? [...used, ctx.tab] : used
  const tabOptions: { id: ProjectListTab; label: string }[] = [
    { id: ACTIVE_TAB, label: 'Active' },
    ...ids.map((id) => ({ id, label: projectTagLabel(id) }))
  ]
  for (const opt of tabOptions) {
    const count = tabCount(ctx, opt.id)
    new ChipButton(tabs)
      .setLabel(count ? `${opt.label} (${count})` : opt.label)
      .setShape('pill')
      .setActive(ctx.tab === opt.id)
      .onClick(() => ctx.onTabChange(opt.id))
  }

  const line = countLine(ctx)
  if (line) left.createSpan({ cls: 'pm-project-list-count', text: line })

  new ButtonComponent(ctx.toolbarEl)
    .setButtonText('+ new project')
    .setCta()
    .onClick(() => openProjectCreate(ctx.plugin))
}

function countLine(ctx: ProjectListContext): string {
  const index = ctx.plugin.index
  const refs = index.projectRefs().filter((ref) => tabMatches(ctx.tab, ref))
  if (refs.length === 0) return ''
  const bits = [refs.length === 1 ? '1 project' : `${refs.length} projects`]
  if (ctx.tab === ACTIVE_TAB) {
    const behind = refs.filter((ref) => index.dueSummary(ref).overdue > 0).length
    if (behind) bits.push(`${behind} with tasks past due`)
  }
  return bits.join(' · ')
}

export function renderProjectListContent(ctx: ProjectListContext): void {
  const roots = tabRoots(ctx, ctx.tab)
  ctx.contentEl.empty()

  if (roots.length === 0) {
    if (!ctx.plugin.index.ready) {
      new EmptyState(ctx.contentEl).setIcon('📋').setTitle('Looking for projects')
      return
    }
    if (ctx.tab !== ACTIVE_TAB) {
      new EmptyState(ctx.contentEl)
        .setIcon('🏷️')
        .setTitle(`No projects tagged ${projectTagLabel(ctx.tab)}`)
        .setBody('Add this tag from a project’s row to see it here.')
      return
    }
    new EmptyState(ctx.contentEl)
      .setIcon('📋')
      .setTitle('No projects yet')
      .setBody('Create your first project to get started.')
      .setAction('+ new project', () => openProjectCreate(ctx.plugin))
    return
  }

  const wrapper = ctx.contentEl.createDiv('pm-table-wrapper')
  wrapper.setAttr('data-borders', ctx.plugin.settings.lineBorders)
  const table = wrapper.createEl('table', { cls: 'pm-table pm-project-table' })
  const headRow = table.createEl('thead').createEl('tr')
  for (const column of COLUMNS) headRow.createEl('th', { text: column.label, cls: column.cls })
  renderRows(ctx, table.createEl('tbody'), roots, [])
}

function renderRows(ctx: ProjectListContext, tbody: HTMLElement, refs: ProjectRef[], trail: boolean[]): void {
  const index = ctx.plugin.index
  refs.forEach((ref, i) => {
    const children = childrenFor(ctx, ref)
    const collapsed = ctx.plugin.isProjectCollapsed(ref.path)
    const { total, done } = children.length ? index.rollupCounts(ref) : index.counts(ref)
    const { overdue, latestDue } = children.length ? index.rollupDueSummary(ref) : index.dueSummary(ref)
    const isLastChild = i === refs.length - 1

    const row = new ProjectRow(tbody, {
      title: ref.title,
      icon: ref.icon,
      color: ref.color,
      depth: trail.length,
      treeGuides: ctx.plugin.settings.showSubtreeConnections ? trail : null,
      isLastChild,
      childCount: children.length,
      collapsed,
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

    wireProjectTags(ctx, ref, row.tagsEl)

    if (children.length && !collapsed) renderRows(ctx, tbody, children, childTreeGuides(trail, isLastChild))
  })
}

/**
 * The tag picker stays open across several picks, so this never forces a full list
 * re-render (that would tear the popover down mid-interaction). It tracks `dotpm/*`
 * membership locally and persists in the background; the Dashboard's own debounced
 * refresh reconciles the row (and the tab bar) once the popover is eventually closed.
 * Any tag outside the `dotpm/` namespace is left untouched and never shown here.
 */
function wireProjectTags(ctx: ProjectListContext, ref: ProjectRef, container: HTMLElement): void {
  const foreign = ref.tags.filter((t) => !t.startsWith(DOTPM_TAG_PREFIX))
  let current = ref.tags.filter((t) => t.startsWith(DOTPM_TAG_PREFIX))

  const persist = safeAsync(async (next: string[]) => {
    const project = await ctx.plugin.store.loadProjectByPath(ref.path)
    if (!project) return
    await ctx.plugin.store.updateProject(project, { tags: [...foreign, ...next] })
  })

  renderMultiSelect({
    container,
    tag: true,
    addLabel: 'Add tag',
    selected: () => current,
    options: () => {
      // Vault-wide, not just this project's own tags, so a custom tag created on one
      // project is pickable (not just retypeable) from every other project's picker too.
      const custom = tagsInUse(ctx)
        .filter((t) => !PROJECT_TAG_PALETTE_IDS.has(t))
        .map((t) => ({ id: t, label: projectTagLabel(t) }))
      return [...PROJECT_TAG_PALETTE, ...custom]
    },
    labelFor: projectTagLabel,
    colorFor: projectTagColor,
    add: (id) => {
      current = [...current, id]
      persist(current)
    },
    remove: (id) => {
      current = current.filter((t) => t !== id)
      persist(current)
    },
    create: (label) => {
      const slug = sanitizeTagSegment(label)
      if (!slug) return
      const id = DOTPM_TAG_PREFIX + slug
      if (current.includes(id)) return
      current = [...current, id]
      persist(current)
    }
  })
}

function openProjectContextMenu(ctx: ProjectListContext, ref: ProjectRef, e: MouseEvent): void {
  const menu = new Menu()
  menu.addItem((item) =>
    item
      .setTitle('Open overview')
      .setIcon('file-text')
      .onClick(safeAsync(() => ctx.plugin.router.openProjectOverview(ref.path)))
  )
  menu.addItem((item) =>
    item
      .setTitle('Open tasks')
      .setIcon('table')
      .onClick(safeAsync(() => ctx.plugin.router.openScope({ kind: 'project', path: ref.path })))
  )
  if (ctx.plugin.index.childRefs(ref.path).length) {
    menu.addItem((item) =>
      item
        .setTitle('Open with sub-projects')
        .setIcon('layers')
        .onClick(safeAsync(() => ctx.plugin.router.openScope({ kind: 'subtree', path: ref.path })))
    )
  }
  menu.addItem((item) =>
    item
      .setTitle('Duplicate project')
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
      .setTitle('Edit project')
      .setIcon('settings')
      .onClick(safeAsync(() => ctx.plugin.router.openProjectEdit(ref.path)))
  )
  menu.addItem((item) =>
    item
      .setTitle('Delete project')
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
