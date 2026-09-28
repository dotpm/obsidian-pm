import { setIcon, setTooltip } from '#platform'
import { safeAsync } from '#dom'
import { Popover } from '#primitives/Popover'
import { t } from '@dotpm/core'

export interface SavedViewItem {
  id: string
  name: string
  /** The icon of the mode the view opens in, when it names one. */
  modeIcon?: string
}

export interface SavedViewsProps {
  views: SavedViewItem[]
  activeId: string | null
  /** False while nothing differs from the defaults, so there is nothing to save. */
  canSave: boolean
  onSelect: (id: string | null) => void
  onSave: (name: string) => Promise<void>
  onUpdate: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

/** Views past this count get a search field above the list. */
const SEARCH_FROM = 8

/** The saved views of the current scope: pick one, update or delete it, or save the current state as a new one. */
export function openSavedViewsPopover(anchor: HTMLElement, props: SavedViewsProps): Popover {
  const pop = new Popover({ anchor, width: 280 })
  const body = pop.contentEl.createDiv('pm-saved-views')
  const search =
    props.views.length >= SEARCH_FROM
      ? body.createEl('input', {
          cls: 'pm-pop-field',
          attr: { placeholder: t('header.findView'), spellcheck: 'false' }
        })
      : null
  const list = body.createDiv('pm-pop-list')

  const pick = (id: string | null) => {
    pop.close()
    props.onSelect(id)
  }

  const renderList = () => {
    list.empty()
    const query = search?.value.trim().toLowerCase() ?? ''
    if (!query) {
      const all = renderRow(list, { name: t('header.allTasks'), active: props.activeId === null })
      all.main.addEventListener('click', () => pick(null))
      all.row.createSpan({ cls: 'pm-saved-view-note', text: t('header.builtIn') })
    }
    for (const view of props.views.filter((v) => !query || v.name.toLowerCase().includes(query))) {
      const { row, main } = renderRow(list, {
        name: view.name,
        active: props.activeId === view.id,
        icon: view.modeIcon
      })
      main.addEventListener('click', () => pick(view.id))
      rowAction(row, 'refresh-cw', t('header.updateView'), async () => {
        pop.close()
        await props.onUpdate(view.id)
      })
      rowAction(row, 'trash-2', t('header.deleteView'), async () => {
        pop.close()
        await props.onDelete(view.id)
      })
    }
    if (!props.views.length) renderEmptyHint(list)
  }

  search?.addEventListener('input', renderList)
  renderList()
  renderSaveForm(body, props, () => pop.close())
  pop.open()
  search?.focus()
  return pop
}

function renderRow(
  parent: HTMLElement,
  item: { name: string; active: boolean; icon?: string }
): { row: HTMLElement; main: HTMLButtonElement } {
  const row = parent.createDiv('pm-saved-view-row')
  const main = row.createEl('button', { cls: 'pm-pop-item pm-saved-view-main' })
  const check = main.createSpan({ cls: 'pm-pop-check' })
  setIcon(check, 'check')
  if (!item.active) check.addClass('pm-pop-check--hidden')
  main.createSpan({ cls: 'pm-pop-item-label', text: item.name })
  if (item.icon) setIcon(main.createSpan('pm-saved-view-mode'), item.icon)
  return { row, main }
}

function rowAction(row: HTMLElement, icon: string, label: string, run: () => Promise<void>): void {
  const button = row.createEl('button', { cls: 'pm-saved-view-action clickable-icon', attr: { 'aria-label': label } })
  setIcon(button, icon)
  setTooltip(button, label)
  button.addEventListener('click', safeAsync(run))
}

function renderEmptyHint(parent: HTMLElement): void {
  parent.createDiv({ cls: 'pm-saved-views-empty', text: t('header.noViewsHint') })
}

function renderSaveForm(parent: HTMLElement, props: SavedViewsProps, close: () => void): void {
  const foot = parent.createDiv('pm-saved-views-foot')
  const start = foot.createEl('button', { cls: 'pm-pop-item pm-pop-item--accent' })
  setIcon(start.createSpan('pm-saved-view-mode'), 'plus')
  start.createSpan({ cls: 'pm-pop-item-label', text: t('header.saveCurrent') })
  start.disabled = !props.canSave
  if (!props.canSave) setTooltip(start, t('header.nothingToSave'))

  start.addEventListener('click', () => {
    start.addClass('pm-hidden')
    const input = foot.createEl('input', {
      cls: 'pm-pop-field',
      attr: { placeholder: t('header.viewName'), spellcheck: 'false' }
    })
    input.focus()
    let saving = false
    input.addEventListener(
      'keydown',
      safeAsync(async (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || saving) return
        e.preventDefault()
        const name = input.value.trim()
        if (!name) return
        saving = true
        close()
        await props.onSave(name)
      })
    )
  })
}
