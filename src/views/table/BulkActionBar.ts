import { ButtonComponent, ExtraButtonComponent, Menu } from 'obsidian'
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  flattenTasks,
  collectAllAssignees,
  collectAllTags,
  displayName,
  priorityIcon,
  today,
  t
} from '@dotpm/core'
import { addPaletteMenuItem } from '@dotpm/ui'
import { promptText } from '#ui/ModalFactory'
import { peopleSource } from '#ui/PersonPicker'
import { TaskPickerModal } from '#modals/PickerModals'
import type { TableContext } from './TableRenderer'
import { updateSelectAllCheckbox } from './TableRow'

export type BulkAction =
  | { type: 'set-status'; status: TaskStatus }
  | { type: 'set-priority'; priority: TaskPriority }
  | { type: 'set-assignee'; assignee: string }
  | { type: 'set-tag'; tag: string }
  | { type: 'set-due-date'; due: string }
  | { type: 'set-progress'; progress: number }
  | { type: 'set-parent'; parentId: string }
  | { type: 'remove-parent' }
  | { type: 'archive' }
  | { type: 'unarchive' }
  | { type: 'delete' }

export interface BulkActionBarOpts {
  ctx: TableContext
  onAction: (action: BulkAction) => void
}

export function renderBulkActionBar(opts: BulkActionBarOpts): void {
  const { ctx, onAction } = opts
  const existing = ctx.container.querySelector('.pm-bulk-bar')

  if (ctx.state.selectedTaskIds.size === 0) {
    existing?.remove()
    return
  }

  const bar = existing ?? createBar(ctx.container)
  updateBarContent(bar as HTMLElement, ctx, onAction)
}

function createBar(container: HTMLElement): HTMLElement {
  const bar = createDiv({ cls: 'pm-bulk-bar' })
  container.prepend(bar)
  return bar
}

function updateBarContent(bar: HTMLElement, ctx: TableContext, onAction: (a: BulkAction) => void): void {
  bar.empty()
  const count = ctx.state.selectedTaskIds.size

  const left = bar.createDiv('pm-bulk-bar-left')
  left.createSpan({ text: t('common.selectedCount', { count }), cls: 'pm-bulk-bar-count' })

  new ButtonComponent(left).setButtonText(t('bulk.setStatus')).onClick((e) => {
    const menu = new Menu()
    for (const s of ctx.statuses) {
      addPaletteMenuItem(menu, s, { onClick: () => onAction({ type: 'set-status', status: s.id }) })
    }
    menu.showAtMouseEvent(e)
  })

  new ButtonComponent(left).setButtonText(t('bulk.setPriority')).onClick((e) => {
    const menu = new Menu()
    for (const p of ctx.priorities) {
      addPaletteMenuItem(
        menu,
        { ...p, namedIcon: priorityIcon(ctx.priorities, p.id, ctx.priorityIcons) },
        { onClick: () => onAction({ type: 'set-priority', priority: p.id }) }
      )
    }
    menu.showAtMouseEvent(e)
  })

  new ButtonComponent(left).setButtonText(t('bulk.setAssignee')).onClick((e) => {
    const menu = new Menu()
    const source = peopleSource(ctx.plugin, ctx.scope.primary?.filePath ?? '', () => [
      ...ctx.scope.teamMembers(),
      ...collectAllAssignees(ctx.scope.tasks())
    ])
    for (const member of source.known()) {
      menu.addItem((item) =>
        item.setTitle(displayName(member)).onClick(() => onAction({ type: 'set-assignee', assignee: member }))
      )
    }
    menu.addSeparator()
    menu.addItem((item) =>
      item.setTitle(t('bulk.clearAssignees')).onClick(() => onAction({ type: 'set-assignee', assignee: '' }))
    )
    menu.showAtMouseEvent(e)
  })

  new ButtonComponent(left).setButtonText(t('bulk.setTag')).onClick((e) => {
    const menu = new Menu()
    const allTags = collectAllTags(ctx.scope.tasks())
    for (const tag of allTags) {
      menu.addItem((item) => item.setTitle(tag).onClick(() => onAction({ type: 'set-tag', tag })))
    }
    menu.addSeparator()
    menu.addItem((item) =>
      item.setTitle(t('bulk.newTag')).onClick(async () => {
        const tag = await promptText(ctx.plugin.app, t('bulk.enterTag'), t('bulk.tagPlaceholder'))
        if (tag) onAction({ type: 'set-tag', tag })
      })
    )
    menu.addSeparator()
    menu.addItem((item) => item.setTitle(t('bulk.clearTags')).onClick(() => onAction({ type: 'set-tag', tag: '' })))
    menu.showAtMouseEvent(e)
  })

  new ButtonComponent(left).setButtonText(t('taskForm.setDueDate')).onClick((e) => {
    const menu = new Menu()
    const now = today()
    const ahead = (days: number) => now.add({ days }).toString()
    menu.addItem((item) =>
      item
        .setTitle(t('bulk.today', { date: ahead(0) }))
        .onClick(() => onAction({ type: 'set-due-date', due: ahead(0) }))
    )
    menu.addItem((item) =>
      item
        .setTitle(t('bulk.tomorrow', { date: ahead(1) }))
        .onClick(() => onAction({ type: 'set-due-date', due: ahead(1) }))
    )
    menu.addItem((item) =>
      item
        .setTitle(t('bulk.inOneWeek', { date: ahead(7) }))
        .onClick(() => onAction({ type: 'set-due-date', due: ahead(7) }))
    )
    menu.addItem((item) =>
      item
        .setTitle(t('bulk.inTwoWeeks', { date: ahead(14) }))
        .onClick(() => onAction({ type: 'set-due-date', due: ahead(14) }))
    )
    menu.addSeparator()
    menu.addItem((item) =>
      item.setTitle(t('bulk.pickDate')).onClick(() => {
        const input = activeDocument.createEl('input')
        input.type = 'date'
        input.addClass('pm-offscreen')
        activeDocument.body.appendChild(input)
        input.addEventListener('change', () => {
          if (input.value) onAction({ type: 'set-due-date', due: input.value })
          input.remove()
        })
        input.addEventListener('blur', () => window.setTimeout(() => input.remove(), 200))
        input.showPicker()
      })
    )
    menu.addSeparator()
    menu.addItem((item) =>
      item.setTitle(t('bulk.clearDueDate')).onClick(() => onAction({ type: 'set-due-date', due: '' }))
    )
    menu.showAtMouseEvent(e)
  })

  new ButtonComponent(left).setButtonText(t('bulk.setProgress')).onClick((e) => {
    const menu = new Menu()
    for (const pct of [0, 25, 50, 75, 100]) {
      menu.addItem((item) => item.setTitle(`${pct}%`).onClick(() => onAction({ type: 'set-progress', progress: pct })))
    }
    menu.showAtMouseEvent(e)
  })

  // A parent and its subtask live in the same project, so this is offered only when the
  // whole selection does too.
  const groups = ctx.scope.groupByProject([...ctx.state.selectedTaskIds])
  if (groups.length === 1) {
    const owner = groups[0].project
    new ButtonComponent(left).setButtonText(t('bulk.setParent')).onClick(() => {
      const selectedIdSet = new Set(ctx.state.selectedTaskIds)
      // A selected task's own descendants can't become its parent.
      const excludedIds = new Set<string>(selectedIdSet)
      for (const id of selectedIdSet) {
        const task = ctx.scope.taskById(id)
        if (task) {
          for (const ft of flattenTasks(task.subtasks)) {
            excludedIds.add(ft.task.id)
          }
        }
      }
      const candidates = flattenTasks(owner.tasks)
        .filter((ft) => !excludedIds.has(ft.task.id))
        .map((ft) => ft.task)
      const modal = new TaskPickerModal(ctx.plugin.app, candidates, (chosen) => {
        onAction({ type: 'set-parent', parentId: chosen.id })
      })
      modal.open()
    })
  }

  new ButtonComponent(left).setButtonText(t('bulk.removeParent')).onClick(() => onAction({ type: 'remove-parent' }))

  const selectedIds = [...ctx.state.selectedTaskIds]
  const selectedTasks = selectedIds.map((id) => ctx.scope.taskById(id)).filter(Boolean) as Task[]
  const hasArchived = selectedTasks.some((task) => task.archived)
  const hasNonArchived = selectedTasks.some((task) => !task.archived)

  if (hasNonArchived) {
    new ButtonComponent(left).setButtonText(t('common.archive')).onClick(() => onAction({ type: 'archive' }))
  }
  if (hasArchived) {
    new ButtonComponent(left).setButtonText(t('common.unarchive')).onClick(() => onAction({ type: 'unarchive' }))
  }

  new ButtonComponent(left)
    .setButtonText(t('common.delete'))
    .setDestructive()
    .onClick(() => onAction({ type: 'delete' }))

  const right = bar.createDiv('pm-bulk-bar-right')
  new ExtraButtonComponent(right)
    .setIcon('x')
    .setTooltip(t('bulk.clearSelection'))
    .onClick(() => {
      ctx.state.selectedTaskIds.clear()
      if (ctx.state.tableBody) {
        const cbs = ctx.state.tableBody.querySelectorAll('.pm-select-checkbox')
        cbs.forEach((checkbox) => {
          ;(checkbox as HTMLInputElement).checked = false
        })
      }
      updateSelectAllCheckbox(ctx.state)
      renderBulkActionBar({ ctx, onAction })
    })
}
