import { Popover } from '#primitives/Popover'
import { renderGlyph, renderOptionRow } from '../properties/optionList'

export interface TuneItem {
  icon: string
  label: string
  /** The control's current value, shown faint after the label ("5", "Priority +1"). */
  state?: string
  /** Opens the control's own popover or menu, anchored to the Tune button. */
  onOpen?: (anchor: HTMLElement) => void
  /** Draws the control inside the row instead, for one that works in place (a stepper). */
  control?: (parent: HTMLElement) => void
}

/**
 * The header's query and view options as one list, each row showing its state. Picking a
 * row closes the list and opens that control anchored to the same button; a row with its
 * own control stays open. Sections are separated by a rule.
 */
export function openTunePopover(anchor: HTMLElement, sections: TuneItem[][]): Popover {
  const pop = new Popover({ anchor, align: 'right', width: 240 })
  const body = pop.contentEl.createDiv('pm-tune-pop')
  for (const items of sections.filter((section) => section.length)) {
    const list = body.createDiv('pm-pop-list pm-tune-section')
    for (const item of items) {
      const { control, onOpen } = item
      if (control) {
        const row = list.createDiv('pm-tune-row')
        renderGlyph(row, { icon: item.icon })
        row.createSpan({ cls: 'pm-pop-item-label', text: item.label })
        control(row)
        continue
      }
      renderOptionRow(list, {
        icon: item.icon,
        label: item.label,
        note: item.state,
        onPick: () => {
          pop.close()
          onOpen?.(anchor)
        }
      })
    }
  }
  pop.open()
  return pop
}
