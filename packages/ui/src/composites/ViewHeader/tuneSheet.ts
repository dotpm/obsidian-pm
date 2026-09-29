import { Popover } from '#primitives/Popover'

export interface SheetTab {
  id: string
  label: string
  /** A badge after the label, asked again after every change ("5" filters). Empty hides it. */
  badge?: () => string
  /** Draws the tab's panel; the panel calls `changed` after each edit it applies. */
  render: (parent: HTMLElement, changed: () => void) => void
}

export interface TuneSheetProps {
  tabs: SheetTab[]
  active?: string
  /** A "Clear all" button, shown while `canClear` says there is something to clear. */
  clear?: { label: string; canClear: () => boolean; onClear: () => void }
  /** The closing button's words, asked again after every change ("Show 42 tasks"). */
  doneLabel: () => string
}

/**
 * The phone's one sheet for the view's query: a tab per panel (Filter, Sort, Group,
 * Fields), the panel, and a footer whose button closes the sheet and says what the view
 * now shows. Edits apply as they happen; the footer and the tab names follow them.
 */
export function openTuneSheet(anchor: HTMLElement, props: TuneSheetProps): Popover {
  const pop = new Popover({ anchor, align: 'right', width: 360 })
  const root = pop.contentEl.createDiv('pm-tune-sheet')
  const tabsEl = root.createDiv({ cls: 'pm-tune-sheet-tabs', attr: { role: 'tablist' } })
  const body = root.createDiv('pm-tune-sheet-body')
  const foot = root.createDiv('pm-tune-sheet-foot')
  const clear = props.clear
  const clearBtn = clear ? foot.createEl('button', { cls: 'pm-tune-sheet-clear', text: clear.label }) : null
  const done = foot.createEl('button', { cls: 'mod-cta pm-tune-sheet-done' })
  let active = props.tabs.some((tab) => tab.id === props.active) ? props.active : props.tabs[0]?.id

  const tabButtons = props.tabs.map((tab) => {
    const button = tabsEl.createEl('button', { cls: 'pm-tune-sheet-tab', attr: { role: 'tab' } })
    button.createSpan({ text: tab.label })
    const badge = button.createSpan('pm-chip-btn-badge')
    button.addEventListener('click', () => show(tab.id))
    return { tab, button, badge }
  })

  const sync = (): void => {
    for (const { tab, button, badge } of tabButtons) {
      const text = tab.badge?.() ?? ''
      badge.setText(text)
      badge.toggleClass('pm-hidden', !text)
      button.toggleClass('is-active', tab.id === active)
      button.setAttribute('aria-selected', String(tab.id === active))
    }
    clearBtn?.toggleClass('pm-hidden', !clear?.canClear())
    done.setText(props.doneLabel())
  }

  const show = (id: string | undefined): void => {
    active = id
    body.empty()
    props.tabs.find((tab) => tab.id === id)?.render(body, sync)
    sync()
  }

  clearBtn?.addEventListener('click', () => {
    clear?.onClear()
    show(active)
  })
  done.addEventListener('click', () => pop.close())
  show(active)
  pop.open()
  return pop
}
