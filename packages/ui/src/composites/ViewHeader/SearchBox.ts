import { setIcon, setTooltip } from '#platform'
import { Popover } from '#primitives/Popover'

export interface SearchBoxProps {
  value: string
  label: string
  placeholder: string
  clearLabel: string
  onChange: (value: string) => void
}

/**
 * A search icon that opens into a field. It stays open while it holds a query, so a
 * hidden query never filters the view unseen. Escape clears the query, a second Escape
 * closes the field.
 */
export class SearchBox {
  el: HTMLElement
  private input: HTMLInputElement

  constructor(parentEl: HTMLElement, props: SearchBoxProps) {
    this.el = parentEl.createDiv('pm-search-box')
    const toggle = this.el.createEl('button', {
      cls: 'pm-search-box-toggle clickable-icon',
      attr: { 'aria-label': props.label }
    })
    setIcon(toggle, 'search')
    setTooltip(toggle, props.label)
    this.input = this.el.createEl('input', {
      type: 'search',
      cls: 'pm-search-box-input',
      attr: { placeholder: props.placeholder, spellcheck: 'false', 'aria-label': props.label }
    })
    this.input.value = props.value
    const clear = this.el.createEl('button', {
      cls: 'pm-search-box-clear clickable-icon',
      attr: { 'aria-label': props.clearLabel }
    })
    setIcon(clear, 'x')

    const set = (value: string) => {
      this.input.value = value
      this.sync()
      props.onChange(value)
    }
    toggle.addEventListener('click', () => {
      this.el.addClass('is-open')
      this.input.focus()
    })
    this.input.addEventListener('input', () => {
      this.sync()
      props.onChange(this.input.value)
    })
    this.input.addEventListener('blur', () => this.sync())
    this.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (this.input.value) {
        set('')
      } else {
        this.input.blur()
        this.el.removeClass('is-open')
      }
    })
    clear.addEventListener('click', () => {
      set('')
      this.input.focus()
    })
    this.sync()
  }

  /** Shows a query changed elsewhere, without reporting it back. */
  setValue(value: string): void {
    if (this.input.value === value) return
    this.input.value = value
    this.sync()
  }

  focus(): void {
    this.el.addClass('is-open')
    this.input.focus()
  }

  private sync(): void {
    const hasValue = this.input.value.length > 0
    this.el.toggleClass('has-value', hasValue)
    this.el.toggleClass('is-open', hasValue || this.input.matches(':focus'))
  }
}

/** The same field in a popover, for a header folded too narrow to hold it. */
export function openSearchPopover(anchor: HTMLElement, props: SearchBoxProps): Popover {
  const pop = new Popover({ anchor, align: 'right', width: 260 })
  const box = new SearchBox(pop.contentEl, props)
  box.el.addClass('pm-search-box--pop')
  pop.open()
  box.focus()
  return pop
}
