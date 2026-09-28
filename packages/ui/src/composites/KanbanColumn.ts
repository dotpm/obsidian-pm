import { setIcon } from '#platform'
import type { Task } from '@dotpm/core'
import { formatBadgeText, isIconName } from '#icons'
import { safeAsync } from '#dom'
import { KanbanCard } from './KanbanCard'
import type { AvatarPerson } from '#primitives/AvatarStack'

/** What a column stands for: a status, a priority, a person, a tag... */
export interface KanbanColumnHead {
  id: string
  label: string
  color?: string
  icon?: string
}

export interface KanbanCardData {
  people: AvatarPerson[]
  task: Task
  priorityColor?: string
  descriptionPreview?: string
  parentTitle?: string
  renderSource?: (parent: HTMLElement) => void
  loggedHours: number
  overdue: boolean
  showTagColors: boolean
}

export interface KanbanColumnProps {
  column: KanbanColumnHead
  cards: KanbanCardData[]
  onCardClick: (task: Task) => void
  onCardContextMenu: (task: Task, e: MouseEvent) => void
  onCardDragStart: (task: Task) => void
  onCardDragEnd: () => void
  onDrop: (taskId: string, columnId: string) => Promise<void>
}

export class KanbanColumn {
  el: HTMLElement

  constructor(parentEl: HTMLElement, props: KanbanColumnProps) {
    const col = parentEl.createDiv('pm-kanban-col')
    const { column } = props
    const color = column.color ?? 'var(--text-muted)'
    col.dataset.column = column.id
    this.el = col

    const header = col.createDiv('pm-kanban-col-header')
    header.style.setProperty('--col-color', color)

    const topBar = header.createDiv('pm-kanban-col-topbar')
    topBar.setCssStyles({ background: color })

    const titleRow = header.createDiv('pm-kanban-col-title-row')
    const badge = titleRow.createSpan({ cls: 'pm-kanban-col-badge' })
    if (column.icon && isIconName(column.icon)) {
      setIcon(badge.createSpan({ cls: 'pm-kanban-col-badge-icon' }), column.icon)
      badge.appendText(column.label)
    } else {
      badge.setText(formatBadgeText(column.icon ?? '', column.label))
    }
    badge.style.color = color

    const headerRight = titleRow.createDiv('pm-kanban-col-header-right')
    headerRight.createSpan({
      text: String(props.cards.length),
      cls: 'pm-kanban-col-count'
    })

    const cardsEl = col.createDiv('pm-kanban-cards')
    cardsEl.dataset.column = column.id

    for (const card of props.cards) {
      new KanbanCard(cardsEl, {
        task: card.task,
        people: card.people,
        priorityColor: card.priorityColor,
        descriptionPreview: card.descriptionPreview,
        parentTitle: card.parentTitle,
        renderSource: card.renderSource,
        loggedHours: card.loggedHours,
        overdue: card.overdue,
        showTagColors: card.showTagColors,
        onClick: () => props.onCardClick(card.task),
        onContextMenu: (e) => props.onCardContextMenu(card.task, e),
        onDragStart: () => props.onCardDragStart(card.task),
        onDragEnd: () => props.onCardDragEnd()
      })
    }

    cardsEl.addEventListener('dragover', (e) => {
      e.preventDefault()
      cardsEl.addClass('pm-kanban-drop-target')
      const afterEl = getDragAfterElement(cardsEl, e.clientY)
      const dragging = cardsEl.querySelector('.pm-kanban-card--dragging')
      if (dragging) {
        if (afterEl) {
          cardsEl.insertBefore(dragging, afterEl)
        } else {
          cardsEl.appendChild(dragging)
        }
      }
    })

    cardsEl.addEventListener('dragleave', () => {
      cardsEl.removeClass('pm-kanban-drop-target')
    })

    cardsEl.addEventListener(
      'drop',
      safeAsync(async (e: DragEvent) => {
        e.preventDefault()
        cardsEl.removeClass('pm-kanban-drop-target')
        const taskId = e.dataTransfer?.getData('text/plain') ?? ''
        if (!taskId) return
        await props.onDrop(taskId, column.id)
      })
    )
  }
}

function getDragAfterElement(container: HTMLElement, y: number): Element | null {
  const cards = Array.from(container.querySelectorAll('.pm-kanban-card:not(.pm-kanban-card--dragging)'))
  let closest: Element | null = null
  let closestOffset = Number.NEGATIVE_INFINITY
  for (const card of cards) {
    const box = card.getBoundingClientRect()
    const offset = y - box.top - box.height / 2
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset
      closest = card
    }
  }
  return closest
}
