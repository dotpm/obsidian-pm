import { Checkbox } from '#primitives/Checkbox'
import { Chip } from '#primitives/Chip'
import { Popover } from '#primitives/Popover'
import { type NonWorkingDays, formatDateLong, parsePlainDate, t } from '@dotpm/core'
import { renderAddButton } from '../addButton'

export interface NonWorkingDaysProps {
  /** Edited in place. */
  days: NonWorkingDays
  /** The vault's holidays, `YYYY-MM-DD`, in order. */
  holidays: string[]
  onChange: () => void
  onHolidaysChange: (holidays: string[]) => void
}

/** Whether the timeline leaves out weekends and holidays, and the holiday list itself. */
export function renderNonWorkingDaysPanel(parent: HTMLElement, props: NonWorkingDaysProps): void {
  const body = parent.createDiv('pm-days-pop')
  const { days } = props
  let holidays = [...props.holidays]
  let list: HTMLElement

  const toggle = (key: keyof NonWorkingDays, label: string): void => {
    const row = body.createEl('label', { cls: 'pm-group-row' })
    row.createSpan({ cls: 'pm-group-label', text: label })
    new Checkbox(row).setChecked(!!days[key]).onChange((checked) => {
      if (checked) days[key] = true
      else Reflect.deleteProperty(days, key)
      props.onChange()
    })
  }

  const setHolidays = (next: string[]): void => {
    holidays = [...new Set(next)].sort()
    props.onHolidaysChange(holidays)
    renderList()
  }

  const render = (): void => {
    body.empty()
    toggle('weekends', t('timeline.hideWeekends'))
    toggle('holidays', t('timeline.hideHolidays'))
    list = body.createDiv('pm-days-list')
    renderList()
    body.createDiv({ cls: 'pm-days-note', text: t('timeline.holidaysNote') })
  }

  const renderList = (): void => {
    list.empty()
    for (const date of holidays) {
      new Chip(list)
        .setLabel(formatDateLong(date) || date)
        .setVariant('outline')
        .setSize('sm')
        .setRemovable(() => setHolidays(holidays.filter((d) => d !== date)), t('timeline.removeHoliday'))
        .el.addClass('pm-days-chip')
    }
    const add = renderAddButton(list, t('timeline.addHoliday'), () => {
      const input = list.createEl('input', { type: 'date', cls: 'pm-days-input' })
      add.replaceWith(input)
      input.focus()
      input.addEventListener('change', () => {
        if (parsePlainDate(input.value)) setHolidays([...holidays, input.value])
      })
      input.addEventListener('blur', () => {
        if (input.isConnected) renderList()
      })
    })
  }

  render()
}

/** The non-working days panel in a popover under `anchor`. */
export const openNonWorkingDaysPopover = (anchor: HTMLElement, props: NonWorkingDaysProps): Popover =>
  Popover.show({ anchor, width: 280 }, (el) => renderNonWorkingDaysPanel(el, props))
