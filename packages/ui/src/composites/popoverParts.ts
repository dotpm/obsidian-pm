import { ChipButton } from '#primitives/ChipButton'
import { IconButton } from '#primitives/IconButton'

export interface PopHeadProps {
  title: string
  /** `title` names the whole panel in bold (a field's editor); `heading` labels a part of it. */
  variant?: 'heading' | 'title'
  /** A back button before the title, for a panel reached from another. */
  back?: { label: string; onClick: () => void }
  /** A flat button at the end of the row: Reset, Clear all, Show all. */
  action?: { label: string; onClick: () => void; disabled?: boolean }
  /** Starts a new section of the panel, with a rule above it. */
  section?: boolean
}

/** The heading row of a popover panel or of one of its sections. */
export function renderPopHead(parent: HTMLElement, props: PopHeadProps): HTMLElement {
  const head = parent.createDiv('pm-pop-head')
  head.toggleClass('pm-pop-section', !!props.section)
  const { back, action } = props
  const isTitle = props.variant === 'title'
  head.toggleClass('pm-pop-head--title', isTitle)
  if (back) new IconButton(head).setIcon('chevron-left').setTooltip(back.label).onClick(back.onClick)
  head.createSpan({ cls: isTitle ? 'pm-pop-title' : 'pm-pop-heading', text: props.title })
  if (action) {
    new ChipButton(head)
      .setVariant('flat')
      .setLabel(action.label)
      .setDisabled(!!action.disabled)
      .onClick(action.onClick)
      .el.addClass('pm-pop-head-action')
  }
  return head
}

/** The search field at the top of a popover list; `onInput` runs on every keystroke. */
export function renderPopSearch(parent: HTMLElement, placeholder: string, onInput: () => void): HTMLInputElement {
  const input = parent.createEl('input', { cls: 'pm-pop-field', attr: { placeholder, spellcheck: 'false' } })
  input.addEventListener('input', onInput)
  return input
}
