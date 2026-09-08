import { safeAsync } from '../../dom'

export interface InlineEditOpts {
  container: HTMLElement
  display: HTMLElement
  inputType: 'text' | 'date' | 'number'
  value: string
  onSave: (newValue: string) => Promise<void>
}

export function makeInlineEdit(opts: InlineEditOpts): void {
  const { container, display, inputType, value, onSave } = opts
  const input = container.createEl('input', { type: inputType, cls: 'pm-inline-edit', value })
  display.replaceWith(input)
  input.focus()
  if (inputType !== 'date') input.select()

  let saved = false
  const save = safeAsync(async () => {
    if (saved) return
    saved = true
    const newVal = input.value.trim()
    if (newVal !== value) {
      await onSave(newVal)
    } else {
      input.replaceWith(display)
    }
  })

  const cancel = (): void => {
    if (saved) return
    saved = true
    input.replaceWith(display)
  }

  let typed = false
  input.addEventListener('blur', save)
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') save()
    else if (ev.key === 'Escape') cancel()
    else typed = true
  })

  if (inputType === 'date') {
    input.addEventListener('change', () => {
      if (!typed) save()
    })
  }
}
