import { Menu } from 'obsidian'
import { Chip, CollapseToggle, IconButton, renderStatusDot, safeAsync, ROW_HEIGHT } from '@dotpm/ui'
import type PMPlugin from '#main'
import { type Project, type StatusConfig, type Task, t, tn } from '@dotpm/core'
import type { ProjectScope, TaskRef } from '#store'
import { openTaskByPath, openTaskModal } from '#ui/ModalFactory'
import { toggleCollapsed, toggleProjectRow } from '../collapse'

export interface LabelContext {
  plugin: PMPlugin
  scope: ProjectScope
  statuses: StatusConfig[]
  collapsedIds: ReadonlySet<string>
  onRefresh: () => Promise<void>
}

/** The row that heads a project's tasks when the timeline shows several projects. */
export function renderProjectLabel(
  container: HTMLElement,
  project: Project,
  collapsed: boolean,
  ctx: LabelContext
): void {
  const el = container.createDiv('pm-gantt-label-row pm-gantt-project-row')
  el.style.height = `${ROW_HEIGHT}px`

  new CollapseToggle(el, {
    collapsed,
    subject: project.title,
    onToggle: safeAsync(async () => {
      toggleProjectRow(ctx.plugin.settings, project)
      await ctx.plugin.saveSettings()
      await ctx.onRefresh()
    })
  })
  el.createSpan({ cls: 'pm-gantt-project-dot' }).style.backgroundColor = project.color
  const titleEl = el.createSpan({ text: project.title, cls: 'pm-gantt-label-title' })
  titleEl.setAttr('aria-label', t('projectChip.open', { title: project.title }))
  titleEl.addEventListener(
    'click',
    safeAsync(() => ctx.plugin.router.openProjectLink(project.filePath))
  )

  new IconButton(el)
    .setIcon('plus')
    .setTooltip(t('task.add'))
    .setRevealOnHover(true)
    .onClick(
      safeAsync(async (e: MouseEvent) => {
        e.stopPropagation()
        // A folded project would hide the new task, so it opens up first.
        if (collapsed) {
          toggleProjectRow(ctx.plugin.settings, project)
          await ctx.plugin.saveSettings()
          await ctx.onRefresh()
        }
        openTaskModal(ctx.plugin, project, { onSave: () => ctx.onRefresh() })
      })
    )
}

export function renderTaskLabel(
  container: HTMLElement,
  task: Task,
  depth: number,
  _row: number,
  ctx: LabelContext
): void {
  // One row is one task, so its project is resolved once here.
  const project = ctx.scope.projectOf(task.id)
  if (!project) return
  const el = container.createDiv('pm-gantt-label-row')
  el.style.height = `${ROW_HEIGHT}px`
  el.style.paddingLeft = `${depth * 18 + 8}px`
  el.dataset.taskId = task.id

  el.draggable = true
  el.addEventListener('dragstart', (e: DragEvent) => {
    e.dataTransfer?.setData('text/plain', task.id)
    el.addClass('pm-gantt-label-row--dragging')
  })
  el.addEventListener('dragend', () => {
    el.removeClass('pm-gantt-label-row--dragging')
  })
  let dropPosition: 'before' | 'after' = 'before'
  el.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    dropPosition = e.clientY < midY ? 'before' : 'after'
    el.removeClass('pm-gantt-label-row--drop-before', 'pm-gantt-label-row--drop-after')
    el.addClass(dropPosition === 'before' ? 'pm-gantt-label-row--drop-before' : 'pm-gantt-label-row--drop-after')
  })
  el.addEventListener('dragleave', () => {
    el.removeClass('pm-gantt-label-row--drop-before', 'pm-gantt-label-row--drop-after')
  })
  el.addEventListener(
    'drop',
    safeAsync(async (e: DragEvent) => {
      e.preventDefault()
      el.removeClass('pm-gantt-label-row--drop-before', 'pm-gantt-label-row--drop-after')
      const draggedId = e.dataTransfer?.getData('text/plain')
      if (!draggedId || draggedId === task.id) return
      await ctx.plugin.store.reorderTask(project, draggedId, task.id, dropPosition)
      await ctx.onRefresh()
    })
  )

  if (task.subtasks.length > 0) {
    new CollapseToggle(el, {
      collapsed: ctx.collapsedIds.has(task.id),
      onToggle: safeAsync(async () => {
        toggleCollapsed(ctx.plugin.settings, project, task.id)
        await ctx.plugin.saveSettings()
        await ctx.onRefresh()
      })
    })
  } else {
    el.createSpan({ cls: 'pm-gantt-label-spacer' })
  }

  renderStatusDot(el, task.status, ctx.statuses, 'pm-gantt-label-dot')

  const titleEl = el.createSpan({ text: task.title, cls: 'pm-gantt-label-title' })
  titleEl.addEventListener('click', () => {
    openTaskModal(ctx.plugin, project, { task, onSave: () => ctx.onRefresh() })
  })

  // A predecessor outside this view draws no arrow, so the row says it is there.
  const elsewhere = task.dependencies
    .filter((id) => !ctx.scope.taskById(id))
    .map((id) => ctx.plugin.index.task(id))
    .filter((ref): ref is TaskRef => ref !== null)
  if (elsewhere.length) {
    const nameOf = (ref: TaskRef) => {
      const owner = ref.projectPath ? ctx.plugin.index.projectRef(ref.projectPath) : null
      return owner ? t('gantt.inProject', { title: ref.title, project: owner.title }) : ref.title
    }
    new Chip(el)
      .setLabel(tn('gantt.dependsElsewhere', elsewhere.length))
      .setVariant('plain')
      .setSize('sm')
      .setTooltip(elsewhere.map(nameOf).join('\n'))
      .onClick((e) => {
        e.stopPropagation()
        const menu = new Menu()
        for (const ref of elsewhere) {
          menu.addItem((item) =>
            item
              .setTitle(nameOf(ref))
              .setIcon('link-2')
              .onClick(
                safeAsync(() =>
                  openTaskByPath(ctx.plugin, ref.path, () => {
                    void ctx.onRefresh()
                  })
                )
              )
          )
        }
        menu.showAtMouseEvent(e)
      })
  }

  if (task.progress > 0) {
    el.createSpan({ text: `${task.progress}%`, cls: 'pm-gantt-label-progress' })
  }

  new IconButton(el)
    .setIcon('plus')
    .setTooltip(t('taskMenu.addSubtask'))
    .setRevealOnHover(true)
    .onClick((e) => {
      e.stopPropagation()
      openTaskModal(ctx.plugin, project, { parentId: task.id, onSave: () => ctx.onRefresh() })
    })
}
