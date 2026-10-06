import { createButton } from '#platform'
import { ChipButton } from '#primitives/ChipButton'
import { Popover } from '#primitives/Popover'

export interface SheetTab {
  id: string
  label: string
  /** A badge after the label, asked again after every change ("5" filters). Empty or 0 hides it. */
  badge?: () => string | number
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
export function renderTuneSheetPanel(parent: HTMLElement, props: TuneSheetProps, close: () => void): void {
  const root = parent.createDiv('pm-tune-sheet')
  const tabsEl = root.createDiv({ cls: 'pm-tune-sheet-tabs', attr: { role: 'tablist' } })
  const body = root.createDiv('pm-tune-sheet-body')
  const foot = root.createDiv('pm-tune-sheet-foot')
  const clear = props.clear
  const clearBtn = clear
    ? createButton(foot)
        .setButtonText(clear.label)
        .onClick(() => {
          clear.onClear()
          show(active)
        })
    : null
  clearBtn?.buttonEl.addClass('pm-tune-sheet-clear')
  const done = createButton(foot).setCta().onClick(close)
  done.buttonEl.addClass('pm-tune-sheet-done')
  let active = props.tabs.some((tab) => tab.id === props.active) ? props.active : props.tabs[0]?.id

  const tabButtons = props.tabs.map((tab) => {
    const button = new ChipButton(tabsEl)
      .setVariant('flat')
      .setLabel(tab.label)
      .onClick(() => show(tab.id))
    button.el.addClass('pm-tune-sheet-tab')
    button.el.setAttribute('role', 'tab')
    return { tab, button }
  })

  const sync = (): void => {
    for (const { tab, button } of tabButtons) {
      button.setBadge(tab.badge?.() ?? '').setActive(tab.id === active)
      button.el.setAttribute('aria-selected', String(tab.id === active))
    }
    clearBtn?.buttonEl.toggleClass('pm-hidden', !clear?.canClear())
    done.setButtonText(props.doneLabel())
  }

  const show = (id: string | undefined): void => {
    active = id
    body.empty()
    props.tabs.find((tab) => tab.id === id)?.render(body, sync)
    sync()
  }

  show(active)
}

/** The sheet in a popover, which a phone draws as a bottom sheet. */
export const openTuneSheet = (anchor: HTMLElement, props: TuneSheetProps): Popover =>
  Popover.show({ anchor, align: 'right', width: 360 }, (el, close) => renderTuneSheetPanel(el, props, close))
