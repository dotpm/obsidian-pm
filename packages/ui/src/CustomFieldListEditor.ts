import { type CustomFieldDef, CUSTOM_FIELD_TYPES, makeId, t } from '@dotpm/core'
import { IconButton } from './primitives/IconButton'
import { renderAddButton } from './composites/addButton'

export function customFieldTypeLabels(): Record<CustomFieldDef['type'], string> {
  return {
    text: t('fieldType.text'),
    number: t('fieldType.number'),
    date: t('fieldType.date'),
    select: t('fieldType.select'),
    multiselect: t('fieldType.multiselect'),
    person: t('fieldType.person'),
    checkbox: t('fieldType.checkbox'),
    url: t('fieldType.url')
  }
}

export interface CustomFieldListEditorOpts {
  /** Mutated in place; `onChanged` is the owner's cue to persist. */
  fields: CustomFieldDef[]
  onChanged: () => void
  /** Replaces this list's own repaint, for an owner that draws something derived from `fields`. */
  redraw?: () => void
  /** Extra per-row content between the type picker and the delete button. */
  renderExtra?: (row: HTMLElement, field: CustomFieldDef) => void
}

export function renderCustomFieldListEditor(container: HTMLElement, opts: CustomFieldListEditorOpts): void {
  const rerender = opts.redraw ?? ((): void => renderCustomFieldListEditor(container, opts))
  container.empty()
  opts.fields.forEach((field, index) => renderRow(container, field, index, opts, rerender))
  renderAddButton(container, t('settings.customFields.add'), () => {
    opts.fields.push({ id: makeId(), name: t('settings.customFields.newLabel'), type: 'text', options: [] })
    opts.onChanged()
    rerender()
  })
}

function renderRow(
  container: HTMLElement,
  field: CustomFieldDef,
  index: number,
  opts: CustomFieldListEditorOpts,
  rerender: () => void
): void {
  const row = container.createDiv('pm-cf-row')
  renderCustomFieldFields(row, field, opts.onChanged, rerender)
  opts.renderExtra?.(row, field)
  new IconButton(row)
    .setIcon('x')
    .setTooltip(t('customField.removeField'))
    .onClick(() => {
      opts.fields.splice(index, 1)
      opts.onChanged()
      rerender()
    })
  renderCustomFieldOptions(row, field, opts.onChanged)
}

export function renderCustomFieldFields(
  parent: HTMLElement,
  field: CustomFieldDef,
  onChanged: () => void,
  redraw: () => void
): void {
  const name = parent.createEl('input', { type: 'text', value: field.name, cls: 'pm-input pm-cf-name' })
  name.placeholder = t('customField.namePlaceholder')
  name.addEventListener('change', () => {
    field.name = name.value
    onChanged()
  })

  const type = parent.createEl('select', { cls: 'pm-input pm-select pm-cf-type' })
  for (const id of CUSTOM_FIELD_TYPES) {
    const el = type.createEl('option', { value: id, text: customFieldTypeLabels()[id] })
    if (id === field.type) el.selected = true
  }
  type.addEventListener('change', () => {
    field.type = type.value as CustomFieldDef['type']
    onChanged()
    redraw()
  })
}

export function renderCustomFieldOptions(parent: HTMLElement, field: CustomFieldDef, onChanged: () => void): void {
  if (field.type !== 'select' && field.type !== 'multiselect') return
  const options = field.options ?? []
  field.options = options
  const optionsWrap = parent.createDiv('pm-cf-options')
  const drawOptions = (): void => {
    optionsWrap.empty()
    options.forEach((option, i) => {
      const optionRow = optionsWrap.createDiv('pm-cf-opt-row')
      const input = optionRow.createEl('input', { type: 'text', value: option, cls: 'pm-input pm-cf-opt-input' })
      input.placeholder = t('customField.option', { index: i + 1 })
      input.addEventListener('change', () => {
        options[i] = input.value
        onChanged()
      })
      new IconButton(optionRow)
        .setIcon('x')
        .setTooltip(t('customField.removeOption'))
        .onClick(() => {
          options.splice(i, 1)
          onChanged()
          drawOptions()
        })
    })
    renderAddButton(optionsWrap, t('customField.addOption'), () => {
      options.push('')
      drawOptions()
    })
  }
  drawOptions()
}
