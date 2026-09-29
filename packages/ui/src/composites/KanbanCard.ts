import { type Task, formatDateShort, t } from '@dotpm/core'
import { AvatarStack, type AvatarPerson } from '#primitives/AvatarStack'
import { Chip } from '#primitives/Chip'
import { ProgressBar } from '#primitives/ProgressBar'
import { renderDueChip } from './dueChip'
import { renderTagChip } from './tagChip'
import { renderTimeChip } from './timeChip'

/** A custom field's value as a card shows it. */
export interface CardFieldValue {
  name: string
  text: string
}

export interface KanbanCardProps {
  /** The card fields to show, in order (`priority`, `tags`, `cf:<id>`...). */
  fields: string[]
  people: AvatarPerson[]
  task: Task
  priorityColor?: string
  descriptionPreview?: string
  parentTitle?: string
  /** Keyed by field id, `cf:<id>`. A field without a value here shows nothing. */
  customValues?: Record<string, CardFieldValue>
  /** Leading slot in the footer, filled when a card has to say where it is from. */
  renderSource?: (parent: HTMLElement) => void
  loggedHours: number
  overdue: boolean
  showTagColors: boolean
  onClick: () => void
  onContextMenu: (e: MouseEvent) => void
  onDragStart: () => void
  onDragEnd: () => void
}

export class KanbanCard {
  el: HTMLElement

  constructor(parentEl: HTMLElement, props: KanbanCardProps) {
    const { task } = props
    const card = parentEl.createDiv('pm-kanban-card')
    card.draggable = true
    card.dataset.taskId = task.id
    this.el = card

    const { fields } = props
    if (props.priorityColor && fields.includes('priority')) {
      const priorityBar = card.createDiv('pm-kanban-card-priority-bar')
      priorityBar.setCssStyles({ background: props.priorityColor })
    }

    const body = card.createDiv('pm-kanban-card-body')

    if (props.parentTitle) {
      body.createSpan({ text: props.parentTitle, cls: 'pm-kanban-card-parent' })
    }

    const titleRow = body.createDiv('pm-kanban-card-title-row')
    titleRow.createSpan({ text: task.title, cls: 'pm-kanban-card-title' })
    if (task.type === 'milestone') {
      new Chip(titleRow)
        .setLabel(t('chip.milestone'))
        .setVariant('solid')
        .setSize('sm')
        .setColor('var(--color-purple)')
        .setTooltip(t('taskForm.typeMilestone'))
    }
    if (task.type === 'subtask') {
      new Chip(titleRow)
        .setLabel(t('chip.subtask'))
        .setVariant('solid')
        .setSize('sm')
        .setColor('var(--color-green)')
        .setTooltip(t('taskForm.typeSubtask'))
    }
    if (task.recurrence) {
      new Chip(titleRow)
        .setLabel(t('chip.recurring'))
        .setVariant('solid')
        .setSize('sm')
        .setColor('var(--color-blue)')
        .setTooltip(t('chip.recurringTooltip'))
    }

    const footer = body.createDiv('pm-kanban-card-footer')
    for (const field of fields) {
      if (field === 'description' && props.descriptionPreview) {
        body.createDiv({ cls: 'pm-kanban-card-description', text: props.descriptionPreview })
      } else if (field === 'time') {
        renderTimeChip(body, props.loggedHours, task.timeEstimate ?? 0, 'sm')
      } else if (field === 'tags' && task.tags.length) {
        const tagsEl = body.createDiv('pm-kanban-card-tags')
        for (const tag of task.tags.slice(0, 3)) {
          renderTagChip(tagsEl, tag, props.showTagColors)
        }
      } else if (field === 'progress' && task.progress > 0) {
        new ProgressBar(body).setSize('sm').setValue(task.progress)
      } else if (field === 'project') {
        props.renderSource?.(footer)
      } else if (field === 'assignees') {
        new AvatarStack(footer).setPeople(props.people).setMax(3).setSize('sm')
      } else if (field === 'due' && task.due) {
        renderDueChip(footer, formatDateShort(task.due), props.overdue ? 'overdue' : 'normal', 'sm')
      } else if (props.customValues?.[field]?.text) {
        const { name, text } = props.customValues[field]
        const row = body.createDiv('pm-kanban-card-field')
        row.createSpan({ cls: 'pm-kanban-card-field-name', text: name })
        row.createSpan({ cls: 'pm-kanban-card-field-value', text })
      }
    }
    if (footer.childElementCount) body.appendChild(footer)
    else footer.remove()

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', task.id)
      card.addClass('pm-kanban-card--dragging')
      window.setTimeout(() => card.addClass('pm-dragging'), 0)
      props.onDragStart()
    })

    card.addEventListener('dragend', () => {
      card.removeClass('pm-kanban-card--dragging')
      card.removeClass('pm-dragging')
      props.onDragEnd()
    })

    card.addEventListener('click', () => props.onClick())
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      props.onContextMenu(e)
    })
  }
}
