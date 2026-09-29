import { createButton, setTooltip } from '#platform'
import { safeAsync } from '#dom'
import { Checkbox } from '#primitives/Checkbox'
import { IconButton } from '#primitives/IconButton'
import { Popover } from '#primitives/Popover'
import { locale, t } from '@dotpm/core'
import { renderOptionRow } from '../properties/optionList'

export interface SavedViewItem {
  id: string
  name: string
  /** The icon of the mode the view opens in, when it names one. */
  modeIcon?: string
  isDefault?: boolean
}

export interface SavedViewsProps {
  views: SavedViewItem[]
  activeId: string | null
  /** What differs from the active view, named for the reader. Empty when nothing does. */
  changes: string[]
  /** False while nothing differs from the defaults, so there is nothing to save. */
  canSave: boolean
  /** Where a new view is kept, so the reader knows whether it syncs. */
  storageNote: string
  onSelect: (id: string | null) => void
  onSave: (name: string, isDefault: boolean) => Promise<void>
  onUpdate: (id: string) => Promise<void>
  onRevert: () => void
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (ids: string[]) => Promise<void>
  /** Stars a view as the one the scope opens with, or clears the star with null. */
  onSetDefault: (id: string | null) => Promise<void>
}

/** Views past this count get a search field above the list. */
const SEARCH_FROM = 8

/**
 * The saved views of the current scope. Unsaved changes to the active view come first,
 * with Update, Save as new and Revert; then the list, where a view is picked, starred as
 * the default, renamed, deleted or dragged into another place; then a form to save the
 * current state as a new view.
 */
export function renderSavedViewsPanel(parent: HTMLElement, props: SavedViewsProps, close: () => void): void {
  const body = parent.createDiv('pm-saved-views')
  const run = (action: () => Promise<void>): void => {
    close()
    safeAsync(action)()
  }

  const foot = createDiv('pm-saved-views-foot')
  const openForm = (): void => {
    foot.empty()
    foot.createDiv({ cls: 'pm-pop-heading', text: t('header.saveAsNewTitle') })
    const input = foot.createEl('input', {
      cls: 'pm-pop-field',
      attr: { placeholder: t('header.viewName'), spellcheck: 'false' }
    })
    const defaultRow = foot.createEl('label', { cls: 'pm-saved-views-check' })
    const isDefault = new Checkbox(defaultRow).el
    defaultRow.createSpan({ text: t('header.makeDefault') })
    foot.createDiv({ cls: 'pm-saved-views-storage', text: props.storageNote })
    input.focus()
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const name = input.value.trim()
      if (name) run(() => props.onSave(name, isDefault.checked))
    })
  }

  const active = props.views.find((view) => view.id === props.activeId)
  if (active && props.changes.length) {
    const dirty = body.createDiv('pm-saved-views-dirty')
    const note = dirty.createDiv('pm-saved-views-dirty-note')
    note.createSpan('pm-dirty-dot')
    const changes = new Intl.ListFormat(locale(), { type: 'conjunction', style: 'narrow' }).format(props.changes)
    note.createSpan({ text: t('header.unsaved', { changes }) })
    const actions = dirty.createDiv('pm-saved-views-dirty-actions')
    createButton(actions)
      .setButtonText(t('header.updateView'))
      .setCta()
      .onClick(() => run(() => props.onUpdate(active.id)))
    createButton(actions).setButtonText(t('header.saveAsNew')).onClick(openForm)
    new IconButton(actions)
      .setIcon('undo-2')
      .setTooltip(t('header.revert'))
      .onClick(() => {
        close()
        props.onRevert()
      })
  }

  const search =
    props.views.length >= SEARCH_FROM
      ? body.createEl('input', {
          cls: 'pm-pop-field',
          attr: { placeholder: t('header.findView'), spellcheck: 'false' }
        })
      : null
  const list = body.createDiv('pm-pop-list')
  let dragFrom: string | null = null

  const beginRename = (main: HTMLButtonElement, view: SavedViewItem): void => {
    const input = createEl('input', { cls: 'pm-pop-field pm-saved-view-rename', value: view.name })
    main.replaceWith(input)
    input.focus()
    input.select()
    let done = false
    const commit = (): void => {
      if (done) return
      done = true
      const name = input.value.trim()
      if (!name || name === view.name) {
        input.replaceWith(main)
        return
      }
      main.find('.pm-pop-item-label')?.setText(name)
      run(() => props.onRename(view.id, name))
    }
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      commit()
    })
    input.addEventListener('blur', commit)
  }

  const renderRow = (
    parent: HTMLElement,
    name: string,
    selected: boolean,
    icon: string | undefined,
    onSelect: () => void
  ): { row: HTMLElement; main: HTMLButtonElement } => {
    const row = parent.createDiv('pm-saved-view-row')
    const main = renderOptionRow(row, {
      label: name,
      trailingIcon: icon,
      check: 'start',
      selected,
      onPick: () => {
        close()
        onSelect()
      }
    })
    main.addClass('pm-saved-view-main')
    return { row, main }
  }

  const renderList = (): void => {
    list.empty()
    const query = search?.value.trim().toLowerCase() ?? ''
    if (!query) {
      const all = renderRow(list, t('header.allTasks'), props.activeId === null, undefined, () => props.onSelect(null))
      all.row.createSpan({ cls: 'pm-saved-view-note', text: t('header.builtIn') })
    }
    for (const view of props.views.filter((v) => !query || v.name.toLowerCase().includes(query))) {
      const { row, main } = renderRow(list, view.name, props.activeId === view.id, view.modeIcon, () =>
        props.onSelect(view.id)
      )

      const star = rowAction(row, 'star', view.isDefault ? t('header.isDefault') : t('header.makeDefault'), () =>
        run(() => props.onSetDefault(view.isDefault ? null : view.id))
      )
      star.toggleClass('is-default', !!view.isDefault)
      star.toggleClass('pm-icon-btn--hover-only', !view.isDefault)
      rowAction(row, 'pencil', t('header.rename'), () => beginRename(main, view))
      rowAction(row, 'trash-2', t('header.deleteView'), () => run(() => props.onDelete(view.id)))

      if (query) continue
      row.setAttribute('draggable', 'true')
      row.addEventListener('dragstart', () => {
        dragFrom = view.id
        row.addClass('is-dragging')
      })
      row.addEventListener('dragend', () => row.removeClass('is-dragging'))
      row.addEventListener('dragover', (e) => e.preventDefault())
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        const from = dragFrom
        dragFrom = null
        if (!from || from === view.id) return
        const ids = props.views.map((v) => v.id).filter((id) => id !== from)
        ids.splice(ids.indexOf(view.id), 0, from)
        run(() => props.onReorder(ids))
      })
    }
    if (!props.views.length) list.createDiv({ cls: 'pm-pop-empty', text: t('header.noViewsHint') })
  }

  search?.addEventListener('input', renderList)
  renderList()

  body.appendChild(foot)
  const start = renderOptionRow(foot, { label: t('header.saveCurrent'), icon: 'plus', accent: true, onPick: openForm })
  start.disabled = !props.canSave
  if (!props.canSave) setTooltip(start, t('header.nothingToSave'))
}

/** The saved views in a popover under `anchor`, with the search field focused when there is one. */
export function openSavedViewsPopover(anchor: HTMLElement, props: SavedViewsProps): Popover {
  const pop = new Popover({ anchor, width: 300 })
  renderSavedViewsPanel(pop.contentEl, props, () => pop.close())
  pop.open()
  pop.contentEl.find('input.pm-pop-field')?.focus()
  return pop
}

function rowAction(row: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement {
  const button = new IconButton(row).setIcon(icon).setTooltip(label).setRevealOnHover(true).onClick(onClick).el
  button.addClass('pm-saved-view-action')
  return button
}
