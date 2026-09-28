import { setIcon, setTooltip } from '#platform'

/**
 * One applied filter as field, operator and value, each its own button, plus a remove
 * button. The field and value open the same editor; the operator is plain text.
 */
export class FilterChip {
  el: HTMLElement
  private fieldEl: HTMLButtonElement
  private opEl: HTMLElement
  private valueEl: HTMLButtonElement
  private removeEl: HTMLButtonElement

  constructor(parentEl: HTMLElement) {
    this.el = parentEl.createDiv('pm-filter-chip')
    this.fieldEl = this.el.createEl('button', { cls: 'pm-filter-chip-part pm-filter-chip-field' })
    this.opEl = this.el.createSpan('pm-filter-chip-op')
    this.valueEl = this.el.createEl('button', { cls: 'pm-filter-chip-part pm-filter-chip-value' })
    this.removeEl = this.el.createEl('button', { cls: 'pm-filter-chip-part pm-filter-chip-remove' })
    setIcon(this.removeEl, 'x')
  }

  setField(label: string, icon?: string): this {
    this.fieldEl.empty()
    if (icon) setIcon(this.fieldEl.createSpan('pm-filter-chip-icon'), icon)
    this.fieldEl.createSpan({ text: label })
    return this
  }

  setOperator(text: string): this {
    this.opEl.setText(text)
    this.opEl.toggleClass('pm-hidden', !text)
    return this
  }

  setValue(text: string): this {
    this.valueEl.setText(text)
    setTooltip(this.valueEl, text)
    return this
  }

  setRemoveLabel(label: string): this {
    this.removeEl.setAttribute('aria-label', label)
    return this
  }

  onEdit(handler: (anchor: HTMLElement) => void): this {
    this.fieldEl.addEventListener('click', () => handler(this.el))
    this.valueEl.addEventListener('click', () => handler(this.el))
    return this
  }

  onRemove(handler: () => void): this {
    this.removeEl.addEventListener('click', handler)
    return this
  }
}
