import { setIcon, setTooltip } from '#platform'

export interface StepperProps {
  decreaseLabel: string
  increaseLabel: string
  /** Tooltip of the value, which resets on click. */
  resetLabel: string
  onDecrease: () => void
  onIncrease: () => void
  onReset: () => void
}

/** A minus button, the current value and a plus button, sized to sit in the view header. */
export class Stepper {
  readonly el: HTMLElement
  private readonly valueEl: HTMLButtonElement
  private readonly minus: HTMLButtonElement
  private readonly plus: HTMLButtonElement

  constructor(parentEl: HTMLElement, props: StepperProps) {
    this.el = parentEl.createDiv('pm-stepper')
    this.minus = this.button('minus', props.decreaseLabel, props.onDecrease)
    this.valueEl = this.el.createEl('button', { cls: 'pm-stepper-value' })
    setTooltip(this.valueEl, props.resetLabel)
    this.valueEl.addEventListener('click', props.onReset)
    this.plus = this.button('plus', props.increaseLabel, props.onIncrease)
    this.el.appendChild(this.plus)
  }

  private button(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = this.el.createEl('button', { cls: 'clickable-icon pm-stepper-btn', attr: { 'aria-label': label } })
    setIcon(btn, icon)
    setTooltip(btn, label)
    btn.addEventListener('click', onClick)
    return btn
  }

  /** The value shown, and whether either end has been reached. */
  setValue(text: string, atMin: boolean, atMax: boolean): this {
    this.valueEl.setText(text)
    this.minus.disabled = atMin
    this.plus.disabled = atMax
    return this
  }
}
