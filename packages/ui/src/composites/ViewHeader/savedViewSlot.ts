import { ChipButton } from '#primitives/ChipButton'
import { t } from '@dotpm/core'

export interface SavedViewSlotProps {
  /** Opens the saved views, anchored to the button. */
  onOpen: (anchor: HTMLElement) => void
  /** Writes the unsaved changes into the active view. */
  onSave: () => void
}

export interface SavedViewSlotState {
  /** The active view's name, or the built-in one's ("All tasks") while none is active. */
  name: string
  /** False while the built-in view is the one shown. */
  saved: boolean
  /** True while the active view has unsaved changes: the button gets its dot and Save shows. */
  dirty: boolean
  /** "42 tasks", "9 of 26 shown". */
  count: string
}

/**
 * The header's view slot: the saved-view button with its unsaved-changes dot, a quiet Save
 * button that shows only while there is something to save, and the count of what is shown.
 */
export class SavedViewSlot {
  private button: ChipButton
  private save: ChipButton
  private countEl: HTMLElement

  constructor(parent: HTMLElement, props: SavedViewSlotProps) {
    this.button = new ChipButton(parent).setIcon('bookmark').setChevron(true).setAriaLabel(t('header.savedViews'))
    this.button.el.addClass('pm-vh-saved-view')
    this.button.el.createSpan({ cls: 'pm-dirty-dot', attr: { 'aria-hidden': 'true' } })
    this.button.onClick(() => props.onOpen(this.button.el))
    this.save = new ChipButton(parent)
      .setLabel(t('header.saveChanges'))
      .setTooltip(t('header.updateView'))
      .onClick(props.onSave)
    this.save.el.addClass('pm-vh-save-view')
    this.countEl = parent.createSpan('pm-vh-count')
  }

  sync(state: SavedViewSlotState): this {
    this.button.setLabel(state.name).setTooltip(state.name)
    this.button.el.toggleClass('pm-vh-saved-view--none', !state.saved)
    this.button.el.toggleClass('pm-vh-saved-view--dirty', state.dirty)
    this.save.el.toggleClass('pm-hidden', !state.dirty)
    this.countEl.setText(state.count)
    return this
  }
}
