import { Menu, Notice } from 'obsidian'
import type PMPlugin from '#main'
import type { Task, Project } from '@dotpm/core'
import { t } from '@dotpm/core'
import { safeAsync } from '@dotpm/ui'
import { openTaskModal, confirmDialog, confirmDuplicateSubtasks, openProjectPicker } from './ModalFactory'

export interface TaskMenuContext {
  plugin: PMPlugin
  project: Project
  onRefresh: () => Promise<void>
}

export function buildTaskContextMenu(menu: Menu, task: Task, ctx: TaskMenuContext): Menu {
  menu.addItem((item) =>
    item
      .setTitle(t('Edit task'))
      .setIcon('pencil')
      .onClick(() => {
        openTaskModal(ctx.plugin, ctx.project, {
          task,
          onSave: async () => {
            await ctx.onRefresh()
          }
        })
      })
  )
  menu.addItem((item) =>
    item
      .setTitle(t('Add subtask'))
      .setIcon('plus')
      .onClick(() => {
        openTaskModal(ctx.plugin, ctx.project, {
          parentId: task.id,
          onSave: async () => {
            await ctx.onRefresh()
          }
        })
      })
  )
  menu.addItem((item) =>
    item
      .setTitle(t('Duplicate task'))
      .setIcon('copy')
      .onClick(
        safeAsync(async () => {
          let includeSubtasks = false
          if (task.subtasks.length > 0) {
            const choice = await confirmDuplicateSubtasks(ctx.plugin.app, task.title)
            if (choice === null) return
            includeSubtasks = choice === 'with-subtasks'
          }
          await ctx.plugin.store.duplicateTask(ctx.project, task.id, includeSubtasks)
          await ctx.onRefresh()
        })
      )
  )
  menu.addItem((item) =>
    item
      .setTitle(t('Move to project'))
      .setIcon('folder-input')
      .onClick(() => {
        const targets = ctx.plugin.index.projectRefs().filter((ref) => ref.path !== ctx.project.filePath)
        if (!targets.length) {
          new Notice(t('There is no other project to move this task to.'))
          return
        }
        openProjectPicker(
          ctx.plugin,
          targets,
          safeAsync(async (ref) => {
            const target = await ctx.plugin.store.loadProjectByPath(ref.path)
            if (!target) return
            await ctx.plugin.store.moveTaskToProject(ctx.project, target, task.id)
            new Notice(t('Moved "{title}" to {project}', { title: task.title, project: target.title }))
            await ctx.onRefresh()
          })
        )
      })
  )
  menu.addSeparator()
  if (task.archived) {
    menu.addItem((item) =>
      item
        .setTitle(t('Unarchive'))
        .setIcon('archive-restore')
        .onClick(
          safeAsync(async () => {
            await ctx.plugin.store.unarchiveTask(ctx.project, task.id)
            new Notice(t('Task unarchived'))
            await ctx.onRefresh()
          })
        )
    )
  } else {
    menu.addItem((item) =>
      item
        .setTitle(t('Archive'))
        .setIcon('archive')
        .onClick(
          safeAsync(async () => {
            await ctx.plugin.store.archiveTask(ctx.project, task.id)
            new Notice(t('Task archived'))
            await ctx.onRefresh()
          })
        )
    )
  }
  menu.addItem((item) =>
    item
      .setTitle(t('Delete task'))
      .setIcon('trash')
      .onClick(
        safeAsync(async () => {
          if (await confirmDialog(ctx.plugin.app, t('Delete "{title}"?', { title: task.title }))) {
            await ctx.plugin.store.deleteTask(ctx.project, task.id)
            await ctx.onRefresh()
          }
        })
      )
  )
  return menu
}
